import { fail, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { listActivitiesBetween } from "@/lib/repo";
import { buildReviewSummary, computeAccuracy, computeTypeBreakdown } from "@/lib/review";
import { addDays, localDate } from "@/lib/time";

export const runtime = "edge";

/**
 * GET /api/review/week — 回顧系統
 * 回傳過去 7 天（不含今天）的活動、預測 vs 實際的準確度統計、
 * 依活動類型的偏差分析，以及一段 AI 生成的回顧。
 */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return fail("尚未完成人格快篩", 401);

  const url = new URL(req.url);
  const endDate = url.searchParams.get("end") ?? localDate(new Date());
  const startDate = addDays(endDate, -7);
  const skipSummary = url.searchParams.get("summary") === "0";

  try {
    const startIso = new Date(`${startDate}T00:00:00+08:00`).toISOString();
    const endIso = new Date(`${endDate}T00:00:00+08:00`).toISOString();

    // 回顧只看社交活動的預測準確度；LifeRPG 寫入的恢復活動沒有「實際消耗」可比
    const activities = (await listActivitiesBetween(user.row.id, startIso, endIso)).filter(
      (a) => a.type !== "recovery"
    );
    const accuracy = computeAccuracy(activities);
    const breakdown = computeTypeBreakdown(activities);
    const summary = skipSummary
      ? null
      : await buildReviewSummary(user.profile, activities, accuracy, breakdown);

    return ok({ profile: user.profile, startDate, endDate, activities, accuracy, breakdown, summary });
  } catch (err) {
    console.error("[review] 查詢失敗:", err);
    return fail("讀取回顧資料失敗，請稍後再試", 500);
  }
}
