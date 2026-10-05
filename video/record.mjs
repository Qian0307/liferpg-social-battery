// 用電腦上的 Microsoft Edge 實際操作正式站，逐段錄下示範畫面（clips/*.webm）。
// 用法：node record.mjs [片段 id 前綴…]，例如 node record.mjs 06 只重錄語音那段。
// 會寫入示範帳號的行程，錄完請在 WSL 執行 npm run db:seed:remote 清掉。
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.LIFERPG_URL || "https://liferpg-adventure.pages.dev";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CLIPS = join(ROOT, "clips");
mkdirSync(CLIPS, { recursive: true });
mkdirSync(join(ROOT, "build"), { recursive: true });
const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 用連續截圖錄影：無頭模式的畫面串流只會送出第一格，所以改成約每 100ms 截一張，
// 依實際時間組回影片，確保每個操作都被錄下來。
async function record(page, id, fn) {
  if (!want(id)) return;
  const dir = join(ROOT, "build", "frames", id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const t0 = Date.now();
  let running = true;
  const loop = (async () => {
    while (running) {
      const started = Date.now();
      const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`).split("\\").join("/");
      writeFileSync(file, await page.screenshot({ type: "jpeg", quality: 88 }));
      frames.push({ file, t: started - t0 });
      const spent = Date.now() - started;
      if (spent < 100) await wait(100 - spent);
    }
  })();
  try { await fn(); } finally { running = false; await loop; }
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    lines.push(`file '${f.file}'`, `duration ${(next ? (next.t - f.t) / 1000 : 0.1).toFixed(3)}`);
  });
  lines.push(`file '${frames.at(-1).file}'`);
  const list = lines.join("\n") + "\n";
  writeFileSync(join(dir, "list.txt"), list, "utf8");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", join(CLIPS, `${id}.mp4`)]);
  console.log("recorded", id, `${frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
async function smoothTo(page, selector, block = "start") {
  await page.evaluate((s, b) => document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: b }), selector, block);
  await wait(1200);
}
// 直接觸發元素：放大 1.5 倍錄影時，用座標點擊會偏移
async function act(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await page.evaluate((s) => { const el = document.querySelector(s); el.scrollIntoView({ block: "center" }); el.click(); }, selector);
}
async function focusSelect(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.select?.(); }, selector);
}
async function nav(page, tabName) {
  await act(page, `.nav-stack [data-act="nav"][data-tab="${tabName}"]`);
  await wait(1500);
}
const taipeiLocal = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 16);

function sampleIcs() {
  const day = (offset) => new Date(Date.now() + 8 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN",
    "BEGIN:VEVENT", "UID:demo-class-weekly", "SUMMARY:統計學 上課",
    `DTSTART;TZID=Taipei Standard Time:${day(1)}T100000`, `DTEND;TZID=Taipei Standard Time:${day(1)}T120000`,
    "RRULE:FREQ=WEEKLY;COUNT=4", "END:VEVENT",
    "BEGIN:VEVENT", "UID:demo-shift", "SUMMARY:咖啡店打工",
    `DTSTART;TZID=Taipei Standard Time:${day(5)}T130000`, `DTEND;TZID=Taipei Standard Time:${day(5)}T180000`, "END:VEVENT",
    "BEGIN:VEVENT", "UID:demo-gym", "SUMMARY:健身房 重訓",
    `DTSTART;TZID=Taipei Standard Time:${day(6)}T080000`, "DURATION:PT1H", "END:VEVENT",
    "END:VCALENDAR", "",
  ].join("\r\n");
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  // 1280×720 版面、放大 1.5 倍：輸出仍是 1920×1080，但介面文字在影片裡大一半
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 },
  // 獨立的暫存設定檔：電腦上已開著的 Edge 不會接手這個程序，也不會帶入個人帳號或書籤
  userDataDir: join(ROOT, "build", `edge-profile-${Date.now()}`),
  args: ["--window-size=1280,720", "--lang=zh-TW", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check"],
});

try {
  // ---------- 03 快篩：全新的瀏覽環境（等同無痕視窗） ----------
  if (want("03")) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
    await page.goto(BASE + "/", { waitUntil: "networkidle2" });
    await page.waitForSelector("#quiz-form", { visible: true, timeout: 30000 });
    await wait(800);
    await record(page, "03-quiz", async () => {
      await wait(1500);
      const picks = [1, 1, 1, 0, 1, 1, 0, 0, 0, 1];
      for (let i = 0; i < picks.length; i++) {
        const sel = `#quiz-form input[name="q${i}"][value="${picks[i]}"]`;
        await page.evaluate((s) => document.querySelector(s).closest(".quiz-q").scrollIntoView({ behavior: "smooth", block: "center" }), sel);
        await wait(420);
        await page.evaluate((s) => document.querySelector(s).closest("label").click(), sel);
        await wait(260);
      }
      await page.evaluate(() => document.querySelector('#quiz-form button[type="submit"]').scrollIntoView({ behavior: "smooth", block: "center" }));
      await wait(500);
      await act(page, '#quiz-form button[type="submit"]');
      await page.waitForFunction(() => document.querySelector("#modal-title")?.textContent.includes("你的生活電量"), { timeout: 20000 });
      await wait(4200);
    });
    await ctx.close();
  }

  // ---------- 示範情境（只重錄 03 時略過） ----------
  if (!["04", "05", "06", "07", "08", "09"].some((p) => want(p))) throw Object.assign(new Error("skip"), { skip: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  await page.goto(BASE + "/?demo=1#demo", { waitUntil: "networkidle2" });
  await page.waitForSelector(".guide-advice", { visible: true, timeout: 60000 });
  await wait(1000);

  // ---------- 04 冒險大廳 ----------
  await page.evaluate(() => window.scrollTo(0, 0));
  await record(page, "04-lobby", async () => {
    await wait(3000);
    await smoothTo(page, "[data-guide-slot]");
    await wait(5200);
    await smoothTo(page, ".week-bars", "center");
    await wait(5500);
  });

  // ---------- 05 Boss 戰 → 成長軌跡 ----------
  await page.evaluate(() => window.scrollTo(0, 0));
  await record(page, "05a-battle", async () => {
    await wait(800);
    await page.evaluate(() => [...document.querySelectorAll('[data-act="focus-new"]')].find((b) => b.offsetParent !== null)?.click());
    await wait(1000);
    await page.evaluate(() => { const f = document.querySelector("#focus-form"); if (f?.elements.task && !f.elements.task.value) f.elements.task.value = "整理本週重點"; });
    await page.waitForSelector('#focus-form [data-act="quick-demo"]', { timeout: 20000 });
    await page.evaluate(() => document.querySelector('#focus-form [data-act="quick-demo"]').click());
    await wait(7500);
  });
  // 結算（不錄）：快速示範只有 30 秒，存檔不會得到 XP
  await page.waitForFunction(() => window.LifeRPGDebug?.snapshot()?.active?.state === "review", { timeout: 60000 });
  await act(page, '[data-act="finish"]');
  await wait(800);
  await act(page, '#review-form button[type="submit"]').catch(() => {});
  await wait(1500);
  await page.evaluate(() => document.querySelector('[data-act="close-modal"]')?.click());
  await wait(800);
  await record(page, "05b-growth", async () => {
    await wait(500);
    await nav(page, "growth");
    await wait(2500);
    await page.evaluate(() => window.scrollBy({ top: 320, behavior: "smooth" }));
    await wait(2500);
  });

  // ---------- 06 語音／文字輸入＋AI 辨識 ----------
  await nav(page, "energy");
  await page.waitForSelector(".energy-hero", { visible: true, timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await record(page, "06-voice", async () => {
    await wait(1500);
    await act(page, '.energy-hero [data-act="activity-new"]:not([data-manual])');
    await wait(900);
    await wait(700);
    await focusSelect(page, "#activity-describe");
    await page.type("#activity-describe", "後天晚上八點要準備期末考讀書三小時", { delay: 90 });
    await wait(400);
    await act(page, '[data-act="ai-parse"]');
    await page.waitForFunction(() => document.querySelector("#voice-status")?.textContent.includes("已由"), { timeout: 40000 });
    await wait(2600);
    await act(page, '#activity-form button[type="submit"]');
    await wait(3000);
    await page.evaluate(() => document.querySelectorAll(".day-pill")[2]?.click());
    await wait(600);
    await smoothTo(page, ".day-pills", "start");
    await wait(3000);
  });

  // ---------- 07 恢復即成長 ----------
  await nav(page, "growth");
  await page.evaluate(() => window.scrollTo(0, 0));
  await record(page, "07-recovery", async () => {
    await wait(800);
    await act(page, '[data-act="manual"]');
    await page.waitForSelector("#manual-form", { visible: true });
    await wait(600);
    await focusSelect(page, "#subject-name");
    await page.type("#subject-name", "放鬆練習", { delay: 110 });
    await page.type('#manual-form input[name="task"]', "深呼吸與伸展", { delay: 90 });
    const end = Date.now() - 12 * 60e3;
    await page.evaluate((s, e) => { const f = document.querySelector("#manual-form"); f.elements.start.value = s; f.elements.end.value = e; },
      taipeiLocal(end - 30 * 60e3), taipeiLocal(end));
    await wait(700);
    await act(page, '#manual-form button[type="submit"]');
    await wait(3800);
    await nav(page, "today");
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(3500);
  });

  // ---------- 08 AI 排程建議＋週回顧 ----------
  await nav(page, "energy");
  await page.waitForSelector("#plan-form", { visible: true, timeout: 30000 });
  await smoothTo(page, "#plan-form", "center");
  await record(page, "08a-plan", async () => {
    await wait(600);
    await focusSelect(page, '#plan-form textarea');
    await page.type('#plan-form textarea', "想跟五個同學吃飯，大概兩小時", { delay: 90 });
    await act(page, '#plan-form button[type="submit"]');
    await wait(1200);
  });
  await page.waitForSelector(".suggest-line", { visible: true, timeout: 60000 });
  await record(page, "08b-plan-result", async () => {
    await smoothTo(page, ".suggest-line", "center");
    await wait(3500);
    await act(page, '[data-act="review-load"]');
    await wait(900);
  });
  await page.waitForFunction(() => /回報 \d+ 筆/.test(document.querySelector("[data-energy-root]")?.innerText || ""), { timeout: 60000 });
  await record(page, "08c-review", async () => {
    await page.evaluate(() => { const c = [...document.querySelectorAll("[data-energy-root] .card")].find((x) => x.innerText.includes("過去七天回顧")); c?.scrollIntoView({ behavior: "smooth", block: "center" }); });
    await wait(4500);
  });

  // ---------- 09 Outlook ----------
  const icsPath = join(ROOT, "build", "outlook-demo.ics");
  mkdirSync(join(ROOT, "build"), { recursive: true });
  writeFileSync(icsPath, sampleIcs(), "utf8");
  await page.evaluate(() => { const c = [...document.querySelectorAll("[data-energy-root] .card")].find((x) => x.innerText.includes("Outlook 行事曆")); c?.scrollIntoView({ block: "center" }); });
  await wait(800);
  await record(page, "09-outlook", async () => {
    await wait(1000);
    await act(page, '[data-act="calendar-sub"]');
    await wait(2800);
    const input = await page.$("#ics-file");
    await input.uploadFile(icsPath);
    await wait(4500);
  });
} catch (err) {
  if (!err.skip) throw err;
} finally {
  await browser.close();
}
console.log("完成。請在 WSL 的 apps/battery 執行 npm run db:seed:remote，清掉錄影寫入示範帳號的行程。");
