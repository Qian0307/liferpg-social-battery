import type { PersonalityProfile } from "@/lib/types";

/**
 * 10 題生活電量快篩：社交、學習、工作、滑手機、休息五個面向，各 2 題。
 * 每個選項帶兩個分數：
 * - e：這一題的電量韌性（0-3，越高代表越不容易被耗乾、越容易恢復 → 基礎電量越大）
 * - recharge：恢復方式的投票（可為 null，表示這題不參與投票）
 */
export type RechargeVote = PersonalityProfile["rechargeStyle"] | null;

export type OnboardingDomain = "social" | "study" | "work" | "screen" | "rest";

export interface OnboardingOption {
  label: string;
  e: number;
  recharge: RechargeVote;
}

export interface OnboardingQuestion {
  id: string;
  domain: OnboardingDomain;
  question: string;
  options: OnboardingOption[];
}

export const DOMAIN_LABELS: Record<OnboardingDomain, string> = {
  social: "社交",
  study: "學習",
  work: "工作",
  screen: "滑手機",
  rest: "休息",
};

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  // ---- 社交 ----
  {
    id: "q1",
    domain: "social",
    question: "參加完十個人以上的聚會，你回到家通常會？",
    options: [
      { label: "整個人被榨乾，只想躺著", e: 0, recharge: "solitude" },
      { label: "有點累，需要放空一下", e: 1, recharge: null },
      { label: "還好，洗個澡就恢復了", e: 2, recharge: null },
      { label: "意猶未盡，還想再約下一攤", e: 3, recharge: null },
    ],
  },
  {
    id: "q2",
    domain: "social",
    question: "你覺得最舒服的社交頻率是？",
    options: [
      { label: "一週一次以下就夠了", e: 0, recharge: "solitude" },
      { label: "一週一到兩次，和熟的人就好", e: 1, recharge: "specific_people" },
      { label: "一週三到四次", e: 2, recharge: "mixed" },
      { label: "幾乎每天都想跟人相處", e: 3, recharge: null },
    ],
  },
  // ---- 學習 ----
  {
    id: "q3",
    domain: "study",
    question: "連續讀書或上課兩小時之後，你的狀態通常是？",
    options: [
      { label: "腦袋當機，要休息很久才回得來", e: 0, recharge: null },
      { label: "需要休息二、三十分鐘", e: 1, recharge: null },
      { label: "起來走走十分鐘就能繼續", e: 2, recharge: null },
      { label: "還很專注，可以再讀一段", e: 3, recharge: null },
    ],
  },
  {
    id: "q4",
    domain: "study",
    question: "考試週或報告截止前，你通常？",
    options: [
      { label: "常熬夜崩潰，結束後要好幾天才恢復", e: 0, recharge: null },
      { label: "撐得過去，但會累上好幾天", e: 1, recharge: null },
      { label: "有點累，睡一晚就好", e: 2, recharge: null },
      { label: "照常作息，壓力反而讓我更有效率", e: 3, recharge: null },
    ],
  },
  // ---- 工作 ----
  {
    id: "q5",
    domain: "work",
    question: "上班或打工一整天後，晚上你還剩多少力氣？",
    options: [
      { label: "回家只能躺平", e: 0, recharge: null },
      { label: "只做得了最低限度的事", e: 1, recharge: null },
      { label: "還能處理一點自己的事", e: 2, recharge: null },
      { label: "還有精神學習或運動", e: 3, recharge: null },
    ],
  },
  {
    id: "q6",
    domain: "work",
    question: "工作或打工時一直要應對人、處理突發狀況，你會？",
    options: [
      { label: "很快耗盡，下班後需要完全一個人", e: 0, recharge: "solitude" },
      { label: "會累，但跟熟的人聊聊就好", e: 1, recharge: "specific_people" },
      { label: "有壓力，但還應付得來", e: 2, recharge: "mixed" },
      { label: "反而覺得有挑戰、很有趣", e: 3, recharge: null },
    ],
  },
  // ---- 滑手機 ----
  {
    id: "q7",
    domain: "screen",
    question: "一天下來，你滑手機（社群、短影音）的時間大約是？",
    options: [
      { label: "五小時以上", e: 0, recharge: null },
      { label: "三到五小時", e: 1, recharge: null },
      { label: "一到三小時", e: 2, recharge: null },
      { label: "一小時以內", e: 3, recharge: null },
    ],
  },
  {
    id: "q8",
    domain: "screen",
    question: "滑完手機之後，你通常覺得？",
    options: [
      { label: "更累、更煩，還是停不下來", e: 0, recharge: null },
      { label: "沒什麼感覺，時間就這樣過了", e: 1, recharge: null },
      { label: "稍微放鬆了一點", e: 2, recharge: null },
      { label: "很少滑，或滑一下就能停下來", e: 3, recharge: null },
    ],
  },
  // ---- 休息 ----
  {
    id: "q9",
    domain: "rest",
    question: "最近一週的睡眠大概是？",
    options: [
      { label: "常常不到 6 小時，或作息很亂", e: 0, recharge: null },
      { label: "6 小時左右，起床還是累", e: 1, recharge: null },
      { label: "大多 7 小時左右", e: 2, recharge: null },
      { label: "規律 7–9 小時，起床有精神", e: 3, recharge: null },
    ],
  },
  {
    id: "q10",
    domain: "rest",
    question: "累的時候，最能讓你恢復的是？",
    options: [
      { label: "好像怎麼休息都很難恢復", e: 0, recharge: null },
      { label: "一個人安靜待著、離開螢幕", e: 2, recharge: "solitude" },
      { label: "和一兩個最熟的人聊聊", e: 2, recharge: "specific_people" },
      { label: "出門運動，或跟朋友熱鬧一下", e: 3, recharge: "mixed" },
    ],
  },
];

export const ONBOARDING_QUESTION_COUNT = ONBOARDING_QUESTIONS.length;

/**
 * 簡單加權規則（不呼叫 AI）。
 * 總分 0-30 映射到基礎電量 25-88；另外找出平均分數最低的面向，寫進摘要。
 */
export function computeProfile(answers: number[]): PersonalityProfile {
  return computeProfileDetail(answers).profile;
}

export function computeProfileDetail(answers: number[]): {
  profile: PersonalityProfile;
  domains: Record<OnboardingDomain, number>;
} {
  let score = 0;
  const votes: Record<string, number> = { solitude: 0, specific_people: 0, mixed: 0 };
  const sums: Record<OnboardingDomain, number> = { social: 0, study: 0, work: 0, screen: 0, rest: 0 };
  const counts: Record<OnboardingDomain, number> = { social: 0, study: 0, work: 0, screen: 0, rest: 0 };

  answers.forEach((choice, i) => {
    const q = ONBOARDING_QUESTIONS[i];
    if (!q) return;
    const opt = q.options[choice];
    if (!opt) return;
    score += opt.e;
    sums[q.domain] += opt.e;
    counts[q.domain] += 1;
    if (opt.recharge) votes[opt.recharge] += 1;
  });

  const maxScore = ONBOARDING_QUESTIONS.length * 3; // 30
  const baseBatteryCapacity = Math.round(25 + (score / maxScore) * 63); // 25 ~ 88

  // 每個面向換算成 0-100，方便顯示與找出最弱的一環
  const domains = Object.fromEntries(
    (Object.keys(sums) as OnboardingDomain[]).map((d) => [d, counts[d] ? Math.round((sums[d] / (counts[d] * 3)) * 100) : 0])
  ) as Record<OnboardingDomain, number>;

  const rechargeStyle = pickRechargeStyle(votes, score, maxScore);
  const summary = buildSummary(baseBatteryCapacity, rechargeStyle, domains);

  return { profile: { baseBatteryCapacity, summary, rechargeStyle }, domains };
}
function pickRechargeStyle(
  votes: Record<string, number>,
  score: number,
  maxScore: number
): PersonalityProfile["rechargeStyle"] {
  const total = votes.solitude + votes.specific_people + votes.mixed;
  // 沒有任何投票（全選最外向的選項）→ 高外向者歸為 mixed
  if (total === 0) return score > maxScore * 0.66 ? "mixed" : "specific_people";
  const entries = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const [topKey, topVal] = entries[0];
  const tie = entries.filter(([, v]) => v === topVal).length > 1;
  if (tie) return "mixed";
  return topKey as PersonalityProfile["rechargeStyle"];
}

const WEAK_TIPS: Record<OnboardingDomain, string> = {
  social: "人多的場合掉電特別快",
  study: "長時間讀書最容易燒乾電量",
  work: "工作和打工後很難回血",
  screen: "滑手機正在悄悄吃掉你的恢復時間",
  rest: "睡眠與休息不足，讓電量補不回來",
};

function buildSummary(
  capacity: number,
  style: PersonalityProfile["rechargeStyle"],
  domains: Record<OnboardingDomain, number>
): string {
  const styleText: Record<PersonalityProfile["rechargeStyle"], string> = {
    solitude: "獨處是你最有效的充電方式",
    specific_people: "和少數幾個對的人相處最能幫你充電",
    mixed: "你既能享受熱鬧，也需要固定的喘息空檔",
  };
  const level =
    capacity <= 40
      ? "你的生活電量偏小，連續的課業、工作或社交很快就見底"
      : capacity <= 60
        ? "你的生活電量中等，日常撐得住，但禁不起連續高強度"
        : capacity <= 78
          ? "你的生活電量不小，多數日子都應付得來"
          : "你的生活電量很充足，恢復得也快";
  // 最弱的面向（同分時依題目順序取第一個）；全部都很高就不特別點名
  const weakest = (Object.keys(domains) as OnboardingDomain[]).reduce((a, b) => (domains[b] < domains[a] ? b : a));
  const weakNote = domains[weakest] < 67 ? `。最需要留意的是「${DOMAIN_LABELS[weakest]}」：${WEAK_TIPS[weakest]}` : "";
  return `${level}${weakNote}——${styleText[style]}。`;
}
