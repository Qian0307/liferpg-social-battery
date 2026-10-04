import { z } from "zod";
import { chatJsonWithProvider, type AiProvider } from "@/lib/ai";
import { LOW_BATTERY_THRESHOLD } from "@/lib/battery";
import type { BatterySnapshot } from "@/lib/battery-snapshot";
import { CRISIS_RESPONSE, detectCrisis, SAFETY_CLAUSE } from "@/lib/safety";

/**
 * LifeRPG 的 AI 嚮導：根據今天的電量與玩家進行中的目標名稱，
 * 建議今天適合挑戰哪個 Boss、何時安排恢復。
 * 只收目標名稱，不收備註或其他個人內容。
 */

export const guideRequestSchema = z.object({
  session: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "連結碼格式不正確"),
  goals: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
});

const aiGuideSchema = z.object({
  /** 必須是玩家傳來的其中一個目標名稱；建議今天休息時為空字串 */
  bossGoal: z.string().max(100),
  focusMinutes: z.number().int().min(0).max(90),
  recoveryWhen: z.string().min(1).max(60),
  message: z.string().min(1).max(120),
});

export interface GuideSuggestion {
  bossGoal: string | null;
  focusMinutes: number;
  recoveryWhen: string;
  message: string;
}

export interface GuideResult {
  suggestion: GuideSuggestion;
  /** 七天內低電量日偏多時的關懷提醒（規則式，固定文字，不交給 AI 生成） */
  careNote: string | null;
  source: "ai" | "rule" | "crisis";
  provider: AiProvider | null;
}

const GUIDE_SYSTEM_PROMPT = `
你是 LifeRPG 的「AI 嚮導」。LifeRPG 是把人生目標變成 Boss 戰的專注遊戲；
玩家同時用「生活電量計」追蹤社交、課業、工作等行程造成的電量消耗。你的任務是看今天的電量，
建議今天適合挑戰哪一個 Boss（也就是哪個目標）、專注多久，以及何時安排恢復。

【判斷原則】
- 今天預估剩餘電量 ≥ 60：可以挑戰最重要的目標，專注 25–50 分鐘。
- 30–59：挑戰一個目標，但專注控制在 15–25 分鐘，並在社交行程前後安排恢復。
- 低於 ${LOW_BATTERY_THRESHOLD}：今天以恢復為主，bossGoal 給空字串或最輕鬆的目標、專注 0–15 分鐘。
- 接下來幾天有低電量日時，提醒玩家今天先把進度推前，或在那天前一晚安排恢復。
- 恢復是「恢復與休息」：放鬆練習、離開螢幕、一個人安靜待一下。

【輸出要求｜嚴格遵守】
- 只輸出一個 JSON 物件，不要 markdown、不要解釋。
- 格式：{"bossGoal": "<必須完全等於玩家目標清單中的一個名稱，或空字串>",
  "focusMinutes": <0 到 90 的整數>,
  "recoveryWhen": "<何時安排恢復，繁體中文 20 字內，例如：晚上聚餐結束後 20 分鐘>",
  "message": "<給玩家的一句話，繁體中文 60 字內，溫暖具體，要提到電量>"}
- 用遊戲語氣（Boss、冒險），但不要誇張。

${SAFETY_CLAUSE}
`.trim();

function buildGuideUserPrompt(snapshot: BatterySnapshot, goals: string[]): string {
  const today = snapshot.today;
  const upcoming = snapshot.week
    .slice(1)
    .map((d) => `- ${d.date}：起床 ${d.startBattery}% → 剩 ${d.remainingBattery}%（${d.activityCount} 個行程）${d.isLow ? " ⚠ 低電量" : ""}`)
    .join("\n");
  return `【今天 ${today.date}】
- 起床電量：${today.startBattery}%
- 今天所有行程結束後預估剩：${today.remainingBattery}%
- 今天的行程（含恢復）：${today.activityCount} 個

【接下來六天】
${upcoming}

【玩家進行中的目標（Boss）】
${goals.length ? goals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "（目前沒有進行中的目標）"}

請給今天的建議，只輸出 JSON。`;
}

/** AI 不可用或輸出不合格時的規則式建議。 */
export function ruleBasedGuide(snapshot: BatterySnapshot, goals: string[]): GuideSuggestion {
  const remaining = snapshot.today.remainingBattery;
  const nextRisk = snapshot.riskDays.find((d) => d.date !== snapshot.today.date);
  const first = goals[0] ?? null;
  const riskNote = nextRisk ? `${nextRisk.date.slice(5).replace("-", "/")} 電量會掉到 ${nextRisk.remainingBattery}%，記得提早推進。` : "";

  if (remaining < LOW_BATTERY_THRESHOLD) {
    return {
      bossGoal: null,
      focusMinutes: 10,
      recoveryWhen: "今天行程結束後，先安排 20 分鐘",
      message: `今天預估只剩 ${remaining}%，電量低於 ${LOW_BATTERY_THRESHOLD}%，建議先安排恢復，Boss 改天再打。`,
    };
  }
  if (remaining < 60) {
    return {
      bossGoal: first,
      focusMinutes: 20,
      recoveryWhen: "社交行程結束後 15 分鐘",
      message: first
        ? `今天電量 ${remaining}%，挑戰「${first}」20 分鐘就好，打完記得休息。${riskNote}`
        : `今天電量 ${remaining}%，適合輕量冒險，先建立一個目標吧。${riskNote}`,
    };
  }
  return {
    bossGoal: first,
    focusMinutes: 40,
    recoveryWhen: "專注結束後 10 分鐘離開螢幕",
    message: first
      ? `今天電量 ${remaining}%，狀態不錯，適合挑戰「${first}」。${riskNote}`
      : `今天電量 ${remaining}%，狀態不錯，建立一個目標開始冒險吧。${riskNote}`,
  };
}

/** 七天裡有幾天低電量，就提醒使用者可以找信任的人或專業資源聊聊。 */
const CARE_NOTE_MIN_LOW_DAYS = 3;

export function careNoteFor(snapshot: BatterySnapshot): string | null {
  const lowDays = snapshot.riskDays.length;
  if (lowDays < CARE_NOTE_MIN_LOW_DAYS) return null;
  return `接下來七天有 ${lowDays} 天電量會低於 ${LOW_BATTERY_THRESHOLD}%。如果疲憊感持續好一陣子，可以和信任的人聊聊，或尋求學校輔導中心等專業資源。`;
}

export async function buildGuide(snapshot: BatterySnapshot, goals: string[]): Promise<GuideResult> {
  const fallback = ruleBasedGuide(snapshot, goals);
  const careNote = careNoteFor(snapshot);
  if (detectCrisis(goals)) {
    return { suggestion: { ...fallback, message: CRISIS_RESPONSE }, source: "crisis", provider: null, careNote };
  }

  const result = await chatJsonWithProvider({
    systemPrompt: GUIDE_SYSTEM_PROMPT,
    userPrompt: buildGuideUserPrompt(snapshot, goals),
    temperature: 0.5,
    maxTokens: 300,
  });
  const parsed = result === null ? null : aiGuideSchema.safeParse(result.data);
  if (!result || !parsed?.success) {
    if (result) console.warn("[guide] AI 輸出格式不符，改用規則式建議");
    return { suggestion: fallback, source: "rule", provider: null, careNote };
  }

  // AI 偶爾會改寫目標名稱；不在清單裡就當作沒有指定 Boss
  const bossGoal = goals.includes(parsed.data.bossGoal.trim()) ? parsed.data.bossGoal.trim() : null;
  return {
    suggestion: {
      bossGoal,
      focusMinutes: parsed.data.focusMinutes,
      recoveryWhen: parsed.data.recoveryWhen.trim(),
      message: parsed.data.message.trim(),
    },
    source: "ai",
    provider: result.provider,
    careNote,
  };
}
