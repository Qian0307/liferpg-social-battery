import { readEnv } from "@/lib/env";

/**
 * LifeRPG 跨站呼叫用的 CORS 白名單。
 *
 * 正式網域放在 LIFERPG_ORIGINS（逗號分隔，例如
 * "https://liferpg.vercel.app,https://xxx.azurestaticapps.net"），換網域不用改程式碼。
 * localhost / 127.0.0.1 不論 port 一律允許，方便 `npx serve .` 本機開發。
 *
 * 刻意不開 Access-Control-Allow-Credentials：LifeRPG 走 ?session= 參數認人，
 * 不依賴第三方 cookie（跨站 cookie 會被瀏覽器擋）。
 */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

async function allowedOrigins(): Promise<string[]> {
  const raw = (await readEnv("LIFERPG_ORIGINS")) ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** 回傳要加在回應上的 CORS 標頭；來源不在白名單就回空物件（瀏覽器會擋下讀取）。 */
export async function corsHeaders(req: Request, methods = "GET, OPTIONS"): Promise<Record<string, string>> {
  const origin = req.headers.get("origin");
  const base = { Vary: "Origin" };
  if (!origin) return base;
  const allowed = LOCAL_ORIGIN.test(origin) || (await allowedOrigins()).includes(origin);
  if (!allowed) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** 有帶 Origin 但不在白名單——寫入類 API 用來直接拒絕。 */
export async function isForbiddenOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return !(LOCAL_ORIGIN.test(origin) || (await allowedOrigins()).includes(origin));
}

/** LifeRPG 貼上的連結碼格式：UUID 或 demo-session，擋掉奇怪字元。 */
export const LINK_CODE_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
