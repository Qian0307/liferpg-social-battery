import "server-only";

import { isLifeType } from "@/lib/activity-meta";
import { chatJsonWithProvider, type AiProvider } from "@/lib/ai";
import { buildParseVoiceUserPrompt, PARSE_VOICE_SYSTEM_PROMPT } from "@/lib/prompts/parse-voice-activity";
import { parsedActivitySchema } from "@/lib/schemas";
import { CRISIS_RESPONSE, detectCrisis } from "@/lib/safety";
import { localDate, localTime, TIME_ZONE } from "@/lib/time";
import type { z } from "zod";

export type ParsedActivity = z.infer<typeof parsedActivitySchema>;

export type ParseVoiceResult =
  | { status: "ok"; activity: ParsedActivity; source: "ai" | "rule"; provider?: AiProvider }
  | { status: "crisis"; message: string };

/**
 * 把語音轉出的文字解析成活動欄位。
 * AI 失敗時退回關鍵字規則，確保使用者至少拿到一組可編輯的預設值——
 * D4-3：語音是非核心功能，任何情況下都不能讓「手動填表單」這條路徑斷掉。
 */
export async function parseVoiceActivity(transcript: string): Promise<ParseVoiceResult> {
  if (detectCrisis(transcript)) {
    return { status: "crisis", message: CRISIS_RESPONSE };
  }

  const now = new Date();
  const nowLocal = `${localDate(now)} ${localTime(now)}`;
  const weekday = new Intl.DateTimeFormat("zh-TW", { timeZone: TIME_ZONE, weekday: "long" }).format(now);

  const result = await chatJsonWithProvider({
    systemPrompt: PARSE_VOICE_SYSTEM_PROMPT,
    userPrompt: buildParseVoiceUserPrompt(transcript, nowLocal, weekday),
    temperature: 0.2,
    maxTokens: 300,
  });

  const parsed = result === null ? null : parsedActivitySchema.safeParse(result.data);
  if (parsed?.success) {
    // LLM 換算「禮拜六」這類相對日期常常算錯；句子裡有明確的日期詞時，日期改用規則換算，時段仍採用 AI 的結果
    const activity = EXPLICIT_DAY.test(transcript)
      ? { ...parsed.data, scheduledAt: matchWhen(transcript, now).scheduledAt.slice(0, 10) + parsed.data.scheduledAt.slice(10) }
      : parsed.data;
    return { status: "ok", activity, source: "ai", provider: result!.provider };
  }

  console.warn("[voice-parse] AI 解析失敗，改用關鍵字規則");
  return { status: "ok", activity: ruleBasedParse(transcript, now), source: "rule" };
}

/** 沒有 AI 時的關鍵字 fallback：抓得到什麼算什麼，其餘用預設值。 */
function ruleBasedParse(transcript: string, now: Date): ParsedActivity {
  const uncertain: string[] = [];

  const type = matchType(transcript.toLowerCase()) ?? (uncertain.push("type"), "other" as const);

  // 先解析時長，並把時長那段文字挖掉——否則「兩個半小時」的「兩個」會被誤認成人數
  const duration = matchDuration(transcript);
  const textWithoutDuration = duration.matched ? transcript.replace(duration.matched, " ") : transcript;
  let durationMinutes: number;
  if (duration.minutes !== null) {
    durationMinutes = duration.minutes;
  } else {
    durationMinutes = DEFAULT_DURATION[type];
    uncertain.push("durationMinutes");
  }

  const life = isLifeType(type);
  const headcount = life ? 1 : matchHeadcount(textWithoutDuration, type, uncertain);
  const familiarity = life ? 3 : matchFamiliarity(transcript) ?? (uncertain.push("familiarity"), 3);
  const intensity = life ? matchIntensity(transcript) ?? (uncertain.push("intensity"), 3) : null;

  const { scheduledAt, guessed } = matchWhen(transcript, now);
  if (guessed) uncertain.push("scheduledAt");

  return {
    type,
    headcount: Math.max(1, Math.min(500, headcount)),
    familiarity: Math.max(1, Math.min(5, familiarity)),
    intensity,
    durationMinutes: Math.max(5, Math.min(1440, durationMinutes)),
    scheduledAt,
    uncertainFields: uncertain,
  };
}

export const DEFAULT_HEADCOUNT: Record<ParsedActivity["type"], number> = {
  meal: 4, meeting: 6, date: 2, class: 30, party: 15, other: 4,
  study: 1, work: 1, exercise: 1, commute: 1, chores: 1,
};
const DEFAULT_DURATION: Record<ParsedActivity["type"], number> = {
  meal: 90, meeting: 60, date: 120, class: 120, party: 180, other: 90,
  study: 120, work: 240, exercise: 60, commute: 40, chores: 60,
};

/**
 * 依關鍵字判斷活動類型。語音 fallback 與 Outlook 匯入共用。
 * 社交場合優先（「跟同學一起讀書」偏向社交），再判斷生活活動。
 */
export function matchType(t: string): ParsedActivity["type"] | null {
  if (/派對|聚會|慶生|迎新|party|夜唱|續攤|尾牙/.test(t)) return "party";
  if (/約會|男友|女友|男朋友|女朋友|date/.test(t)) return "date";
  if (/讀書|念書|唸書|考試|期中|期末|複習|寫作業|作業|自習|小考|study|exam/.test(t)) return "study";
  if (/打工|上班|值班|實習|加班|輪班|work|shift/.test(t)) return "work";
  if (/運動|健身|跑步|慢跑|游泳|打球|籃球|羽球|排球|瑜伽|重訓|騎腳踏車|gym|run/.test(t)) return "exercise";
  if (/通勤|搭車|坐車|開車|騎車|捷運|公車|高鐵|火車|commute/.test(t)) return "commute";
  if (/家務|打掃|洗衣|煮飯|採買|買菜|整理房間|倒垃圾|chores/.test(t)) return "chores";
  if (/開會|會議|討論|meeting|報告|面試/.test(t)) return "meeting";
  if (/上課|課程|講座|研討|class|工作坊/.test(t)) return "class";
  if (/吃飯|聚餐|午餐|晚餐|早餐|喝|咖啡|火鍋|brunch|宵夜/.test(t)) return "meal";
  return null;
}

/** 生活活動的強度：抓不到就回 null，由呼叫端給預設 3。 */
export function matchIntensity(t: string): number | null {
  if (/爆肝|通宵|超級累|極限/.test(t)) return 5;
  if (/很累|很操|吃力|衝刺|期末|大考|高強度|重訓|趕/.test(t)) return 4;
  if (/散步|輕鬆|簡單|隨便|一下下|伸展/.test(t)) return 2;
  return null;
}

function matchFamiliarity(t: string): number | null {
  // 由具體到籠統：「不太熟的同學」要判成 2，不能被「同學」先攔截成 3
  if (/陌生|第一次見|不認識|素未謀面/.test(t)) return 1;
  if (/不太熟|不熟|剛認識|沒見過幾次|沒很熟/.test(t)) return 2;
  if (/最好的朋友|家人|男友|女友|男朋友|女朋友|伴侶|最熟/.test(t)) return 5;
  if (/好朋友|死黨/.test(t)) return 4;
  if (/同學|同事|組員|學長|學姊|學弟|學妹/.test(t)) return 3;
  if (/朋友/.test(t)) return 4;
  return null;
}

/** 「兩小時」「兩個半小時」「90 分鐘」「1.5 小時」都要吃得下。 */
function matchDuration(text: string): { minutes: number | null; matched: string | null } {
  // X 個半小時
  const halfCombo = text.match(/([\d一二兩三四五六七八九十]+)\s*個?\s*半\s*(?:小時|鐘頭)/);
  if (halfCombo) {
    const base = parseNumber(halfCombo[1]);
    if (base !== null) return { minutes: Math.round((base + 0.5) * 60), matched: halfCombo[0] };
  }
  // 半小時
  const half = text.match(/半\s*(?:個)?\s*(?:小時|鐘頭)/);
  if (half) return { minutes: 30, matched: half[0] };
  // 阿拉伯數字小時（含小數）
  const digits = text.match(/(\d+(?:\.\d+)?)\s*個?\s*(?:小時|鐘頭)/);
  if (digits) return { minutes: Math.round(Number(digits[1]) * 60), matched: digits[0] };
  // 中文數字小時
  const chinese = text.match(/([一二兩三四五六七八九十]+)\s*個?\s*(?:小時|鐘頭)/);
  if (chinese) {
    const n = parseNumber(chinese[1]);
    if (n !== null) return { minutes: n * 60, matched: chinese[0] };
  }
  const minutes = text.match(/(\d+)\s*分鐘/);
  if (minutes) return { minutes: Number(minutes[1]), matched: minutes[0] };

  return { minutes: null, matched: null };
}

/** 人數：必須明確帶「人」或人的稱謂，避免把量詞誤抓成人數。 */
function matchHeadcount(text: string, type: ParsedActivity["type"], uncertain: string[]): number {
  const PEOPLE_NOUN = "朋友|同學|同事|組員|客人|夥伴|學長|學姊|學弟|學妹|人";
  const NUM = "[\\d一二兩三四五六七八九十]+";
  const patterns = [
    // 數字與稱謂之間允許夾修飾語，例如「五個不太熟的同學」「十二個陌生人」
    new RegExp(`(${NUM})\\s*(?:個|位|名)\\s*[\\u4e00-\\u9fa5]{0,5}?(?:${PEOPLE_NOUN})`),
    new RegExp(`(${NUM})\\s*(?:${PEOPLE_NOUN})`),
    new RegExp(`(${NUM})\\s*位`),
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = parseNumber(m[1]);
    if (n === null) continue;
    // 「跟三個朋友」不含自己，補上使用者本人
    return /跟|和|與|同/.test(text) ? n + 1 : n;
  }

  uncertain.push("headcount");
  return DEFAULT_HEADCOUNT[type];
}

const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 支援阿拉伯數字與中文數字（含「十」「二十」「二十五」）。 */
function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);

  if (!text.includes("十")) return CN_DIGITS[text] ?? null;

  const [tensPart, onesPart] = text.split("十");
  const tens = tensPart === "" ? 1 : CN_DIGITS[tensPart] ?? null;
  if (tens === null) return null;
  const ones = onesPart === "" ? 0 : CN_DIGITS[onesPart] ?? null;
  if (ones === null) return null;
  return tens * 10 + ones;
}

/** 句子裡有明確日期詞（今天、明天、後天、禮拜幾）時，日期以規則換算為準。 */
const EXPLICIT_DAY = /(?:禮拜|星期|週)[日天一二三四五六]|明天|明日|後天|今天|今晚/;

const WEEKDAY_CHARS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** 解析「明天晚上」「禮拜五」這種相對時間，回傳 "YYYY-MM-DDTHH:mm"。 */
function matchWhen(text: string, now: Date): { scheduledAt: string; guessed: boolean } {
  let dayOffset = 0;
  let guessedDay = true;

  const weekday = text.match(/(?:禮拜|星期|週)([日天一二三四五六])/);
  if (/後天/.test(text)) { dayOffset = 2; guessedDay = false; }
  else if (/明天|明日/.test(text)) { dayOffset = 1; guessedDay = false; }
  else if (/今天|今晚|等一下|待會/.test(text)) { dayOffset = 0; guessedDay = false; }
  else if (weekday) {
    // 用台北時區的星期幾算出「下一個某曜日」還有幾天。
    // 注意這裡要用 Z 而不是 +08:00：台北午夜換算成 UTC 會退回前一天，星期會少一天。
    const target = WEEKDAY_CHARS[weekday[1]];
    const nowDow = new Date(`${localDate(now)}T00:00:00Z`).getUTCDay();
    dayOffset = (target - nowDow + 7) % 7 || 7;
    guessedDay = false;
  }
  else if (/下週|下星期|下禮拜/.test(text)) { dayOffset = 7; guessedDay = false; }

  let hour = 19;
  let guessedTime = true;
  const explicit = text.match(/(\d{1,2})\s*點/);
  if (explicit) {
    hour = Number(explicit[1]);
    if (/下午|晚上|傍晚/.test(text) && hour < 12) hour += 12;
    guessedTime = false;
  } else if (/早上|上午|早餐/.test(text)) { hour = 9; guessedTime = false; }
  else if (/中午|午餐/.test(text)) { hour = 12; guessedTime = false; }
  else if (/下午/.test(text)) { hour = 14; guessedTime = false; }
  else if (/傍晚/.test(text)) { hour = 18; guessedTime = false; }
  else if (/晚上|晚餐|宵夜/.test(text)) { hour = 19; guessedTime = false; }

  const target = new Date(now.getTime() + dayOffset * 86_400_000);
  const date = localDate(target);
  const hh = String(Math.max(0, Math.min(23, hour))).padStart(2, "0");
  return { scheduledAt: `${date}T${hh}:00`, guessed: guessedDay && guessedTime };
}
