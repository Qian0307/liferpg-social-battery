// 依 scenes.json 產生標題卡圖片（cards/<id>.png，1920×1080），配色沿用 LifeRPG。
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const { scenes } = JSON.parse(readFileSync(join(ROOT, "scenes.json"), "utf8").replace(/^\uFEFF/, ""));
mkdirSync(join(ROOT, "cards"), { recursive: true });
mkdirSync(join(ROOT, "build"), { recursive: true });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const html = (card) => `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;
    font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;color:#24233c;
    background:radial-gradient(circle at 18% 22%,#e8e2ff 0,transparent 42%),radial-gradient(circle at 85% 80%,#dff4ec 0,transparent 40%),#f5f3fa}
  .card{width:1380px;padding:90px 110px;border-radius:44px;background:#fff;box-shadow:0 40px 120px #34324f1a}
  .eyebrow{font-size:28px;letter-spacing:6px;color:#6853db;font-weight:700;margin-bottom:28px}
  h1{font-size:92px;line-height:1.15;font-weight:800;margin-bottom:28px}
  p{font-size:40px;color:#5b5a72;line-height:1.6}
  ul{list-style:none;padding:0;margin-top:20px}
  li{font-size:40px;line-height:1.5;margin:22px 0;padding-left:64px;position:relative;color:#3a3955}
  li::before{content:"";position:absolute;left:0;top:14px;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#8676ea,#3fb68f)}
  .bar{height:16px;border-radius:12px;background:#eeedf5;overflow:hidden;margin-top:46px}
  .bar span{display:block;height:100%;width:42%;background:linear-gradient(90deg,#3fb68f,#167969)}
</style></head><body><div class="card">
  <div class="eyebrow">${esc(card.eyebrow)}</div><h1>${esc(card.title)}</h1>
  ${card.sub ? `<p>${esc(card.sub)}</p>` : ""}
  ${card.bullets ? `<ul>${card.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : `<div class="bar"><span></span></div>`}
</div></body></html>`;

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  userDataDir: join(ROOT, "build", `edge-cards-${Date.now()}`),
  args: ["--no-first-run", "--hide-scrollbars"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  for (const s of scenes.filter((x) => x.kind === "card")) {
    await page.setContent(html(s.card), { waitUntil: "load" });
    await page.screenshot({ path: join(ROOT, "cards", `${s.id}.png`) });
    console.log("card", s.id);
  }
} finally {
  await browser.close();
}
