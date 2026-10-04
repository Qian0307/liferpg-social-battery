import { NextResponse } from "next/server";
import { getBatterySnapshot } from "@/lib/battery-snapshot";
import { corsHeaders, isForbiddenOrigin } from "@/lib/cors";
import { buildGuide, guideRequestSchema } from "@/lib/guide";

export const runtime = "edge";

/**
 * POST /api/guide/today — LifeRPG 的 AI 嚮導卡片。
 * body: { session: 連結碼, goals: 進行中的目標名稱（最多 5 個） }
 * 回傳今天電量、風險日與今日建議；建議走 chatJson()（Azure 優先），失敗退回規則式。
 * 不寫入任何資料。
 */
export async function POST(req: Request) {
  const headers = { ...(await corsHeaders(req, "POST, OPTIONS")), "Cache-Control": "no-store" };
  if (await isForbiddenOrigin(req)) {
    return NextResponse.json({ error: "此來源不允許呼叫" }, { status: 403, headers });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "請求內容不是合法的 JSON" }, { status: 400, headers });
  }
  const parsed = guideRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "輸入格式不正確" }, { status: 422, headers });
  }

  try {
    const snapshot = await getBatterySnapshot(parsed.data.session);
    if (!snapshot) {
      return NextResponse.json({ error: "找不到這個連結碼" }, { status: 404, headers });
    }
    const guide = await buildGuide(snapshot, parsed.data.goals);
    return NextResponse.json(
      { today: snapshot.today, riskDays: snapshot.riskDays, ...guide },
      { headers }
    );
  } catch (err) {
    console.error("[guide/today] 失敗:", err);
    return NextResponse.json({ error: "嚮導暫時無法回應，請稍後再試" }, { status: 500, headers });
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: await corsHeaders(req, "POST, OPTIONS") });
}
