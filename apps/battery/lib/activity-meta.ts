import type { ActivityType, LifeActivityType, UserActivityType } from "@/lib/types";

/** 前端顯示用的活動類型資訊（client-safe，不含任何 server 依賴）。 */
export const ACTIVITY_META: Record<ActivityType, { label: string; emoji: string }> = {
  meal: { label: "吃飯聚餐", emoji: "🍜" },
  meeting: { label: "會議", emoji: "💼" },
  date: { label: "約會", emoji: "💐" },
  class: { label: "上課", emoji: "📚" },
  party: { label: "派對", emoji: "🎉" },
  other: { label: "其他社交", emoji: "✨" },
  study: { label: "課業／考試", emoji: "📖" },
  work: { label: "工作／打工", emoji: "💻" },
  exercise: { label: "運動", emoji: "🏃" },
  commute: { label: "通勤", emoji: "🚌" },
  chores: { label: "家務雜事", emoji: "🧺" },
  recovery: { label: "恢復時間", emoji: "🌿" },
};

export const LIFE_TYPES: readonly LifeActivityType[] = ["study", "work", "exercise", "commute", "chores"];

/** 新增活動選單用：不含 recovery（恢復只能由 LifeRPG 寫入）。 */
export const ACTIVITY_TYPES = (Object.keys(ACTIVITY_META) as ActivityType[]).filter(
  (t): t is UserActivityType => t !== "recovery"
);

/** 生活活動（課業、工作、運動、通勤、家務）不看人數與熟悉度，改看強度。 */
export function isLifeType(type: ActivityType): type is LifeActivityType {
  return (LIFE_TYPES as readonly string[]).includes(type);
}

export const INTENSITY_LABELS = ["", "很輕鬆", "輕鬆", "普通", "吃力", "非常吃力"];

/**
 * 依活動類型換成貼近情境的問法。底層仍是同一套數值：
 * - 社交活動的第二個欄位存在 familiarity（1 = 最耗電，5 = 最輕鬆），例如上課的「參與程度」1 = 要上台報告。
 * - 生活活動的欄位存在 intensity（1 = 最輕鬆，5 = 最吃力）。
 * LifeRPG 前端（apps/liferpg/index.html 的 FIELD_CONFIG）使用相同的文字，修改時兩邊要一起改。
 */
export const TYPE_FIELDS: Record<UserActivityType, { people: string | null; level: string; options: string[] }> = {
  meal: { people: "一起吃飯的人數", level: "跟他們有多熟", options: ["", "完全陌生", "點頭之交", "普通朋友", "熟識朋友", "最親密的人"] },
  meeting: { people: "與會人數", level: "你在會議中的角色", options: ["", "要主持或上台報告", "要提出想法、會被追問", "一般討論", "偶爾發言", "純旁聽"] },
  date: { people: null, level: "對象有多熟", options: ["", "第一次見面", "見過幾次", "還在認識中", "穩定交往", "在一起很久"] },
  class: { people: "班上人數", level: "上課參與程度", options: ["", "要上台報告", "分組討論、要發言", "可能被點名", "偶爾互動", "純聽講"] },
  party: { people: "參加人數", level: "認識的人有多少", options: ["", "幾乎都不認識", "認識少數幾個", "一半一半", "大部分都認識", "都是好朋友"] },
  other: { people: "人數", level: "熟悉度", options: ["", "完全陌生", "點頭之交", "普通朋友", "熟識朋友", "最親密的人"] },
  study: { people: null, level: "難度與壓力", options: ["", "輕鬆複習", "一般作業", "需要專心", "考前衝刺", "大考或趕截止"] },
  work: { people: null, level: "忙碌程度", options: ["", "很清閒", "偶爾忙", "正常", "一直在忙", "忙到停不下來"] },
  exercise: { people: null, level: "運動強度", options: ["", "散步伸展", "輕鬆慢跑", "一般運動", "高強度訓練", "比賽或極限"] },
  commute: { people: null, level: "通勤狀況", options: ["", "輕鬆有座位", "一般", "要轉車", "擁擠站著", "又擠又久"] },
  chores: { people: null, level: "工作量", options: ["", "整理一下", "一般家事", "大掃除一角", "大量家事", "搬家等級"] },
};

/** 一行描述活動的負荷：社交活動寫人數與熟悉度，生活活動寫強度。 */
export function describeLoad(a: {
  type: ActivityType;
  headcount: number;
  familiarity: number;
  intensity?: number | null;
}): string {
  if (a.type === "recovery") return "恢復行動";
  const f = TYPE_FIELDS[a.type];
  if (isLifeType(a.type)) {
    const level = a.intensity ?? 3;
    return `${f.level}：${f.options[level] ?? INTENSITY_LABELS[level] ?? ""}`;
  }
  const level = `${f.level}：${f.options[a.familiarity] ?? ""}`;
  return f.people ? `${a.headcount} 人・${level}` : level;
}

/** 耗電顯示成「-20%」，恢復（負值）顯示成「+15%」。 */
export function formatDrain(drain: number): string {
  return drain < 0 ? `+${-drain}%` : `-${drain}%`;
}

export const FAMILIARITY_LABELS = ["", "完全陌生", "點頭之交", "普通朋友", "熟識朋友", "最親密的人"];

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分鐘`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatWeekday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", weekday: "short" }).format(d);
}

export function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}
