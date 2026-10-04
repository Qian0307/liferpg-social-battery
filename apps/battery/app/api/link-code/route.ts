import { ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { getSessionIdFromRequest } from "@/lib/session";

export const runtime = "edge";

/**
 * GET /api/link-code — 取得自己的 LifeRPG 電量連結碼（就是匿名 session id）。
 * session cookie 是 httpOnly，前端讀不到，所以由同源的這支 API 回傳。
 * 只對本站（同源、帶 cookie）有效，不開 CORS。
 * 還沒做快篩時回 { code: null }（而不是 401），讓 LifeRPG 改為顯示快篩，瀏覽器也不會記錄錯誤。
 */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return ok({ code: null });
  return ok({ code: getSessionIdFromRequest(req) });
}
