import { NextResponse } from "next/server";
import { getBatterySnapshot } from "@/lib/battery-snapshot";
import { corsHeaders, LINK_CODE_PATTERN } from "@/lib/cors";

export const runtime = "edge";

/**
 * GET /api/public/battery?session=<連結碼>
 * 給 LifeRPG 讀取的唯讀電量快照：今天電量、七天電量、風險日、人格摘要。
 *
 * - 只有 GET：這支路由不寫入任何資料。
 * - 用網址參數認人、不用 cookie：LifeRPG 在別的網域，跨站 cookie 會被瀏覽器擋。
 * - CORS 只開放 LifeRPG 的正式網域（LIFERPG_ORIGINS）與 localhost。
 * - session=demo-session 直接回示範資料。
 */
export async function GET(req: Request) {
  const headers = { ...(await corsHeaders(req)), "Cache-Control": "no-store" };
  const session = new URL(req.url).searchParams.get("session")?.trim() ?? "";

  if (!LINK_CODE_PATTERN.test(session)) {
    return NextResponse.json({ error: "連結碼格式不正確" }, { status: 400, headers });
  }

  try {
    const snapshot = await getBatterySnapshot(session);
    if (!snapshot) {
      return NextResponse.json({ error: "找不到這個連結碼，請確認是否已完成人格快篩" }, { status: 404, headers });
    }
    return NextResponse.json(snapshot, { headers });
  } catch (err) {
    console.error("[public/battery] 讀取失敗:", err);
    return NextResponse.json({ error: "讀取電量失敗，請稍後再試" }, { status: 500, headers });
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: await corsHeaders(req) });
}
