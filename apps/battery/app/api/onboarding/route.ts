import { NextResponse } from "next/server";
import { fail, parseBody } from "@/lib/api";
import { computeProfile, ONBOARDING_QUESTIONS } from "@/lib/onboarding";
import { findUserBySession, upsertUser } from "@/lib/repo";
import { onboardingRequestSchema } from "@/lib/schemas";
import { getSessionIdFromRequest, newSessionId, withSessionCookie } from "@/lib/session";

export const runtime = "edge";

/**
 * GET /api/onboarding — 快篩題目（只有題目與選項文字，不含計分權重）。
 * LifeRPG 在同一個網站內直接顯示快篩時使用。
 */
export async function GET() {
  return NextResponse.json({
    questions: ONBOARDING_QUESTIONS.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o) => o.label) })),
  });
}

/** POST /api/onboarding — 送出 6 題快篩答案，回傳 PersonalityProfile。 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, onboardingRequestSchema);
  if ("response" in parsed) return parsed.response;

  const profile = computeProfile(parsed.data.answers);

  const sessionId = getSessionIdFromRequest(req) ?? newSessionId();
  const existing = await findUserBySession(sessionId);
  const now = new Date().toISOString();

  try {
    const user = await upsertUser({
      id: existing?.id ?? crypto.randomUUID(),
      anonymousSessionId: sessionId,
      personalityProfile: JSON.stringify(profile),
      baseBatteryCapacity: profile.baseBatteryCapacity,
      // 日曆訂閱 token 等使用者第一次開啟訂閱時才產生
      calendarToken: existing?.calendarToken ?? null,
      createdAt: existing?.createdAt ?? now,
    });

    return withSessionCookie(NextResponse.json({ profile, userId: user.id }), sessionId);
  } catch (err) {
    console.error("[onboarding] 寫入失敗:", err);
    return fail("儲存人格檔案失敗，請稍後再試", 500);
  }
}
