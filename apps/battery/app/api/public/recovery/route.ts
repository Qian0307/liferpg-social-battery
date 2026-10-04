import { NextResponse } from "next/server";
import { z } from "zod";
import { corsHeaders, isForbiddenOrigin, LINK_CODE_PATTERN } from "@/lib/cors";
import { findActivityById, findUserBySession, insertActivity } from "@/lib/repo";

export const runtime = "edge";

/** 每分鐘恢復行動回充 0.5%，單筆 2%–30%。規則刻意簡單，好在文件和 demo 裡說明。 */
const RECOVERY_PER_MINUTE = 0.5;
const MIN_RECOVERY = 2;
const MAX_RECOVERY = 30;

const recoverySchema = z.object({
  session: z.string().regex(LINK_CODE_PATTERN, "連結碼格式不正確"),
  /** LifeRPG 的紀錄 ID，用來防止重送時重複回充 */
  clientId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/, "紀錄 ID 格式不正確"),
  minutes: z.number().int().min(1).max(1440),
  /** 恢復行動結束的時間（ISO 8601）；省略就用現在 */
  endedAt: z.string().datetime({ offset: true }).optional(),
});

function recoveryAmount(minutes: number): number {
  return Math.min(MAX_RECOVERY, Math.max(MIN_RECOVERY, Math.round(minutes * RECOVERY_PER_MINUTE)));
}

/**
 * POST /api/public/recovery — LifeRPG 完成「恢復與休息」後寫入一筆恢復活動，讓電量回升。
 *
 * - CORS 只開放 LifeRPG 網域與 localhost；其他來源直接 403。
 * - 用 body 裡的連結碼認人（不依賴跨站 cookie）。
 * - 以 clientId 做冪等：同一筆 LifeRPG 紀錄重送只會記一次。
 * - 限流由 middleware 的 /api/public/recovery 規則處理。
 */
export async function POST(req: Request) {
  const headers = await corsHeaders(req, "POST, OPTIONS");
  if (await isForbiddenOrigin(req)) {
    return NextResponse.json({ error: "此來源不允許寫入" }, { status: 403, headers });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "請求內容不是合法的 JSON" }, { status: 400, headers });
  }
  const parsed = recoverySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "輸入格式不正確" }, { status: 422, headers });
  }
  const { session, clientId, minutes, endedAt } = parsed.data;

  const ended = endedAt ? new Date(endedAt) : new Date();
  const now = Date.now();
  if (ended.getTime() > now + 5 * 60_000 || ended.getTime() < now - 3 * 86_400_000) {
    return NextResponse.json({ error: "只能記錄最近三天內的恢復行動" }, { status: 422, headers });
  }

  try {
    const user = await findUserBySession(session);
    if (!user) {
      return NextResponse.json({ error: "找不到這個連結碼" }, { status: 404, headers });
    }

    const id = `recovery-${clientId}`;
    const existing = await findActivityById(id);
    if (existing) {
      if (existing.userId !== user.id) {
        return NextResponse.json({ error: "紀錄 ID 重複" }, { status: 409, headers });
      }
      return NextResponse.json({ activity: existing, recovered: -existing.predictedDrain, duplicate: true }, { headers });
    }

    const recovered = recoveryAmount(minutes);
    const startedAt = new Date(ended.getTime() - minutes * 60_000);
    const activity = await insertActivity({
      id,
      userId: user.id,
      type: "recovery",
      headcount: 1,
      familiarity: 5,
      durationMinutes: minutes,
      scheduledAt: startedAt.toISOString(),
      predictedDrain: -recovered,
      actualDrain: null,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ activity, recovered, duplicate: false }, { status: 201, headers });
  } catch (err) {
    console.error("[public/recovery] 寫入失敗:", err);
    return NextResponse.json({ error: "記錄恢復行動失敗，請稍後再試" }, { status: 500, headers });
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: await corsHeaders(req, "POST, OPTIONS") });
}
