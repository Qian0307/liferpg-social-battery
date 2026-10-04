/**
 * 解析 Outlook（或任何行事曆）匯出的 .ics，取出指定期間內的行程。
 *
 * 只做本專案需要的子集：
 * - VEVENT 的 UID、SUMMARY、DTSTART、DTEND / DURATION、RRULE、EXDATE
 * - 時間格式：UTC（...Z）、帶 TZID 的當地時間、沒有時區的當地時間。
 *   本產品固定台北時區，帶 TZID 與沒有時區的時間一律視為台北時間（Outlook 匯出常用
 *   "Taipei Standard Time" 這類 Windows 時區名，無法直接交給 Intl 解析）。
 * - 整天行程（VALUE=DATE）略過：沒有具體時段，無法估算耗電。
 * - RRULE 只展開 FREQ=DAILY / WEEKLY（含 INTERVAL、BYDAY、UNTIL、COUNT），
 *   涵蓋課表、固定打工、每週例會這類最常見的重複行程；其他頻率只取第一次。
 */

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
/** 單一行事曆最多展開這麼多次重複，避免惡意或異常檔案拖垮 edge function。 */
const MAX_OCCURRENCES_PER_EVENT = 400;

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** RFC 5545：以空白或 tab 開頭的行是上一行的延續。 */
function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseLine(line: string): RawProp | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** 回傳 Date；整天行程回 "all-day"；看不懂回 null。 */
function parseDateTime(prop: RawProp): Date | "all-day" | null {
  const v = prop.value.trim();
  if (prop.params.VALUE === "DATE" || /^\d{8}$/.test(v)) return "all-day";
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  return new Date(z ? utc : utc - TAIPEI_OFFSET_MS);
}

/** ISO 8601 duration，例如 PT1H30M、P1D。 */
function parseDuration(value: string): number | null {
  const m = value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, w, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return (((w * 7 + d) * 24 + h) * 60 + mi) * 60_000 + s * 1000;
}

function parseRrule(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) out[k.toUpperCase()] = v;
  }
  return out;
}

/** 台北時間的星期幾（0=日）。 */
function taipeiWeekday(d: Date): number {
  return new Date(d.getTime() + TAIPEI_OFFSET_MS).getUTCDay();
}

/** 依 RRULE 展開出所有開始時間（只保留落在 [from, to) 的）。 */
function expandStarts(start: Date, rrule: Record<string, string> | null, exdates: Set<number>, from: Date, to: Date): Date[] {
  const keep = (d: Date) => d >= from && d < to && !exdates.has(d.getTime());
  if (!rrule || !["DAILY", "WEEKLY"].includes(rrule.FREQ)) return keep(start) ? [start] : [];

  const interval = Math.max(1, Number(rrule.INTERVAL ?? 1));
  const count = rrule.COUNT ? Number(rrule.COUNT) : Infinity;
  const untilProp = rrule.UNTIL ? parseDateTime({ name: "UNTIL", params: {}, value: rrule.UNTIL }) : null;
  const until = untilProp instanceof Date ? untilProp : null;
  const byDay = (rrule.BYDAY ?? "")
    .split(",")
    .map((x) => WEEKDAYS.indexOf(x.replace(/^[+-]?\d+/, "")))
    .filter((x) => x >= 0);

  const results: Date[] = [];
  let produced = 0;
  for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT * 7 && produced < count; i++) {
    const candidate = new Date(start.getTime() + i * DAY_MS);
    if (candidate >= to || (until && candidate > until)) break;
    let matches: boolean;
    if (rrule.FREQ === "DAILY") {
      matches = i % interval === 0;
    } else {
      const weekIndex = Math.floor(i / 7);
      const days = byDay.length > 0 ? byDay : [taipeiWeekday(start)];
      matches = weekIndex % interval === 0 && days.includes(taipeiWeekday(candidate));
    }
    if (!matches) continue;
    produced += 1;
    if (keep(candidate)) results.push(candidate);
    if (produced >= MAX_OCCURRENCES_PER_EVENT) break;
  }
  return results;
}

/** 取出 [from, to) 期間內、有具體時段的行程（已展開重複規則、依開始時間排序）。 */
export function parseIcsEvents(text: string, from: Date, to: Date): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: RawProp[] | null = null;

  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(...eventsFromProps(current, from, to));
      current = null;
      continue;
    }
    if (current) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function eventsFromProps(props: RawProp[], from: Date, to: Date): IcsEvent[] {
  const get = (name: string) => props.find((p) => p.name === name);
  const dtstart = get("DTSTART");
  if (!dtstart) return [];
  const start = parseDateTime(dtstart);
  if (!(start instanceof Date)) return [];

  // 被取消的單次行程與「空閒」標記的行程不算
  if (get("STATUS")?.value.toUpperCase() === "CANCELLED") return [];
  if (get("TRANSP")?.value.toUpperCase() === "TRANSPARENT" && get("X-MICROSOFT-CDO-BUSYSTATUS")?.value === "FREE") return [];

  let durationMs = 60 * 60_000;
  const dtend = get("DTEND");
  const endParsed = dtend ? parseDateTime(dtend) : null;
  if (endParsed instanceof Date) durationMs = endParsed.getTime() - start.getTime();
  else {
    const dur = get("DURATION");
    const parsed = dur ? parseDuration(dur.value.trim()) : null;
    if (parsed !== null) durationMs = parsed;
  }
  if (durationMs <= 0) return [];

  const exdates = new Set<number>();
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const value of p.value.split(",")) {
      const d = parseDateTime({ ...p, value });
      if (d instanceof Date) exdates.add(d.getTime());
    }
  }

  const rruleProp = get("RRULE");
  const starts = expandStarts(start, rruleProp ? parseRrule(rruleProp.value) : null, exdates, from, to);
  const uid = get("UID")?.value.trim() || `no-uid-${start.getTime()}`;
  const title = unescapeText(get("SUMMARY")?.value ?? "");

  return starts.map((s) => ({ uid, title, start: s, end: new Date(s.getTime() + durationMs) }));
}
