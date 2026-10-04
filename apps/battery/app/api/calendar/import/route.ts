import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { ACTIVITY_META, isLifeType } from "@/lib/activity-meta";
import { getCurrentUser } from "@/lib/current-user";
import { ruleBasedDrain } from "@/lib/drain-rules";
import { parseIcsEvents } from "@/lib/ics-import";
import { findActivityById, insertActivity } from "@/lib/repo";
import { addDays, localDate, localTime } from "@/lib/time";
import { DEFAULT_HEADCOUNT, matchIntensity, matchType } from "@/lib/voice-parse";

export const runtime = "edge";

/** Outlook 發佈行事曆產生的 .ics 連結只會在這些網域；其他網址一律不抓，避免被當成跳板。 */
const OUTLOOK_HOSTS = new Set(["outlook.live.com", "outlook.office365.com", "outlook.office.com"]);
const MAX_ICS_BYTES = 2_000_000;
const MAX_EVENTS = 60;

const importSchema = z
  .object({
    url: z.string().url().max(2000).optional(),
    ics: z.string().min(1).max(MAX_ICS_BYTES).optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.ics), { message: "請提供 Outlook 行事曆連結或 .ics 檔案其中一個" });

/**
 * POST /api/calendar/import — 把 Outlook 行事曆未來 7 天的行程匯入成活動。
 *
 * - 來源：Outlook「發佈行事曆」的 ICS 連結，或使用者從 Outlook 匯出的 .ics 檔案內容。
 * - 行程標題只用來判斷活動類型（關鍵字規則），不寫入資料庫，也不送給 AI。
 * - 耗電一律用規則式估算：一次匯入幾十筆時不逐筆呼叫 AI。
 * - 以「使用者 + 行程 UID + 開始時間」產生固定 ID，重複匯入不會重複建立。
 */
export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return fail("尚未完成人格快篩", 401);

  const parsed = await parseBody(req, importSchema);
  if ("response" in parsed) return parsed.response;

  let text: string;
  if (parsed.data.url) {
    const loaded = await fetchOutlookIcs(parsed.data.url);
    if ("error" in loaded) return fail(loaded.error, 422);
    text = loaded.text;
  } else {
    text = parsed.data.ics!;
  }
  if (!text.includes("BEGIN:VCALENDAR")) return fail("這不是行事曆（.ics）格式", 422);

  const startDate = localDate(new Date());
  const from = new Date(`${startDate}T00:00:00+08:00`);
  const to = new Date(`${addDays(startDate, 7)}T00:00:00+08:00`);
  const events = parseIcsEvents(text, from, to).slice(0, MAX_EVENTS);

  const items: { date: string; time: string; label: string; predictedDrain: number; duplicate: boolean }[] = [];
  try {
    for (const event of events) {
      const id = `outlook-${await shortHash(`${user.row.id}|${event.uid}|${event.start.toISOString()}`)}`;
      const type = matchType(event.title.toLowerCase()) ?? "other";
      const life = isLifeType(type);
      const durationMinutes = Math.max(5, Math.min(1440, Math.round((event.end.getTime() - event.start.getTime()) / 60_000)));
      const activity = {
        type,
        headcount: life ? 1 : DEFAULT_HEADCOUNT[type],
        familiarity: 3 as const,
        intensity: life ? (matchIntensity(event.title) ?? 3) : null,
        durationMinutes,
      };
      const base = { date: localDate(event.start), time: localTime(event.start), label: ACTIVITY_META[type].label };

      const existing = await findActivityById(id);
      if (existing) {
        items.push({ ...base, predictedDrain: existing.predictedDrain, duplicate: true });
        continue;
      }
      const { predictedDrain } = ruleBasedDrain({ activity, profile: user.profile });
      await insertActivity({
        id,
        userId: user.row.id,
        ...activity,
        scheduledAt: event.start.toISOString(),
        predictedDrain,
        actualDrain: null,
        createdAt: new Date().toISOString(),
      });
      items.push({ ...base, predictedDrain, duplicate: false });
    }
  } catch (err) {
    console.error("[calendar/import] 寫入失敗:", err);
    return fail("匯入失敗，請稍後再試", 500);
  }

  return ok({
    found: events.length,
    imported: items.filter((i) => !i.duplicate).length,
    skipped: items.filter((i) => i.duplicate).length,
    items,
  });
}

async function fetchOutlookIcs(raw: string): Promise<{ text: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(raw.replace(/^webcal:/i, "https:"));
  } catch {
    return { error: "連結格式不正確" };
  }
  if (url.protocol !== "https:" || !OUTLOOK_HOSTS.has(url.hostname)) {
    return { error: "只支援 Outlook 發佈的行事曆連結（outlook.live.com 或 outlook.office365.com）" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return { error: `Outlook 回應 ${res.status}，請確認行事曆已發佈且連結正確` };
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_ICS_BYTES) return { error: "行事曆太大，請改匯出近期的 .ics 檔案" };
    const text = await res.text();
    if (text.length > MAX_ICS_BYTES) return { error: "行事曆太大，請改匯出近期的 .ics 檔案" };
    return { text };
  } catch {
    return { error: "連不到 Outlook，請稍後再試" };
  } finally {
    clearTimeout(timer);
  }
}

async function shortHash(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}
