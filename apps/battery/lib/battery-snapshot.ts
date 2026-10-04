import { DEMO_PROFILE, DEMO_SCENARIO } from "@/lib/demo-data";
import { findUserBySession, listActivitiesBetween, rowToProfile } from "@/lib/repo";
import { addDays, attachRuleWarnings, buildDaySummaries, localDate, type DaySummary } from "@/lib/week";
import type { Activity, PersonalityProfile } from "@/lib/types";

/** 示範情境的 session id，與 middleware 的 ?demo=1 相同。 */
export const DEMO_SESSION_ID = "demo-session";

export interface BatteryDayDTO {
  date: string;
  startBattery: number;
  remainingBattery: number;
  totalDrain: number;
  activityCount: number;
  isLow: boolean;
}

export interface BatterySnapshot {
  generatedAt: string;
  demo: boolean;
  profile: Pick<PersonalityProfile, "baseBatteryCapacity" | "summary" | "rechargeStyle">;
  /** 今天：起床電量與所有今日行程結束後的預估剩餘電量 */
  today: BatteryDayDTO;
  /** 從今天起算的七天 */
  week: BatteryDayDTO[];
  riskDays: { date: string; remainingBattery: number; warning: string }[];
}

/**
 * LifeRPG 讀取用的電量快照。只讀、不寫入、不呼叫 AI（預警走規則式，避免公開 API 燒 AI 額度）。
 * 只回傳每天的數字與次數，不回傳活動細節，連結碼外洩時暴露的資訊也最少。
 * 找不到使用者回 null。
 */
export async function getBatterySnapshot(sessionId: string): Promise<BatterySnapshot | null> {
  const startDate = localDate(new Date());
  const user = await findUserBySession(sessionId);

  let profile: PersonalityProfile;
  let days: DaySummary[];
  if (user) {
    profile = rowToProfile(user);
    const startIso = new Date(`${startDate}T00:00:00+08:00`).toISOString();
    const endIso = new Date(`${addDays(startDate, 7)}T00:00:00+08:00`).toISOString();
    const activities = await listActivitiesBetween(user.id, startIso, endIso);
    days = attachRuleWarnings(buildDaySummaries(activities, profile, startDate, 7), profile);
  } else if (sessionId === DEMO_SESSION_ID) {
    // 資料庫還沒 seed（例如本機沒有 D1）也要能示範：直接由 demo-scenario.json 換算
    profile = DEMO_PROFILE;
    days = attachRuleWarnings(demoDaySummaries(startDate), profile);
  } else {
    return null;
  }

  const week = days.map(toDto);
  return {
    generatedAt: new Date().toISOString(),
    demo: sessionId === DEMO_SESSION_ID,
    profile: {
      baseBatteryCapacity: profile.baseBatteryCapacity,
      summary: profile.summary,
      rechargeStyle: profile.rechargeStyle,
    },
    today: week[0],
    week,
    riskDays: days
      .filter((d) => d.isLow)
      .map((d) => ({ date: d.date, remainingBattery: d.remainingBattery, warning: d.warning ?? "" })),
  };
}

function toDto(d: DaySummary): BatteryDayDTO {
  return {
    date: d.date,
    startBattery: d.startBattery,
    remainingBattery: d.remainingBattery,
    totalDrain: d.totalDrain,
    activityCount: d.activities.length,
    isLow: d.isLow,
  };
}

/** 與 scripts/generate-seed.ts 相同的換算：dayOffset + time → 台北時間的 ISO。 */
function demoActivities(startDate: string): Activity[] {
  return DEMO_SCENARIO.activities
    .filter((a) => a.dayOffset >= 0 && a.dayOffset < 7)
    .map((a, i) => ({
      id: `demo-activity-${i}`,
      userId: "demo-user",
      type: a.type as Activity["type"],
      headcount: a.headcount,
      familiarity: a.familiarity as Activity["familiarity"],
      intensity: ("intensity" in a ? a.intensity : null) as Activity["intensity"],
      durationMinutes: a.durationMinutes,
      scheduledAt: new Date(`${addDays(startDate, a.dayOffset)}T${a.time}:00+08:00`).toISOString(),
      predictedDrain: a.predictedDrain,
      actualDrain: a.actualDrain,
      createdAt: new Date().toISOString(),
    }));
}

function demoDaySummaries(startDate: string): DaySummary[] {
  return buildDaySummaries(demoActivities(startDate), DEMO_PROFILE, startDate, 7);
}
