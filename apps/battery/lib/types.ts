/** 社交活動：用人數與熟悉度估算消耗。 */
export type SocialActivityType = "meal" | "meeting" | "date" | "class" | "party" | "other";

/** 社交以外的生活活動：不看人數與熟悉度，改用強度（1-5）估算消耗。 */
export type LifeActivityType = "study" | "work" | "exercise" | "commute" | "chores";

/** 使用者可自行新增的活動類型。 */
export type UserActivityType = SocialActivityType | LifeActivityType;

/**
 * recovery = 由 LifeRPG 完成「恢復與休息」寫入的恢復活動，predictedDrain 為負值（電量回升）。
 * 只能透過 /api/public/recovery 產生，不會出現在新增活動的選單裡。
 */
export type ActivityType = UserActivityType | "recovery";

export type Intensity = 1 | 2 | 3 | 4 | 5;

export interface PersonalityProfile {
  baseBatteryCapacity: number; // 0-100
  summary: string; // 一句話人格摘要
  rechargeStyle: "solitude" | "specific_people" | "mixed";
}

export interface Activity {
  id: string;
  userId: string;
  type: ActivityType;
  headcount: number;
  familiarity: 1 | 2 | 3 | 4 | 5; // 1=陌生人, 5=最親密（社交活動才有意義）
  /** 生活活動的強度：1=很輕鬆 … 5=非常吃力；社交活動為 null */
  intensity: Intensity | null;
  durationMinutes: number;
  scheduledAt: string; // ISO 8601
  predictedDrain: number; // 0-100；recovery 為 -30 到 -1
  actualDrain: number | null;
  createdAt: string;
}

export interface DrainPredictionRequest {
  activity: Pick<Activity, "type" | "headcount" | "familiarity" | "durationMinutes"> & { intensity?: number | null };
  profile: PersonalityProfile;
}

export interface DrainPredictionResponse {
  predictedDrain: number; // 0-100
  reason: string; // 一句話說明
}
