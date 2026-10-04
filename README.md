# LifeRPG 生活電量冒險

一個「會累的 RPG 角色」：把人生目標變成 Boss 戰，同時用**生活電量**規劃挑戰與恢復。
社交、課業、工作、運動等行程讓角色的電量下降，完成「恢復與休息」讓電量回升、技能成長，
AI 嚮導依電量建議今天該挑戰哪個 Boss、何時安排恢復。

> 自我照顧工具，不是醫療診斷。

**網址（唯一入口）：https://liferpg-adventure.pages.dev** ・ 示範情境：`/?demo=1#demo`
・ 系統概述：[`docs/系統概述.md`](docs/系統概述.md)（Word 版 `docs/系統概述.docx`）

## 專案結構

```
apps/
├── liferpg/   App 介面：單一 index.html 的 PWA（冒險、技能、目標、生活電量、行事曆、AI 嚮導、語音輸入）
└── battery/   API 服務：Next.js 14 Route Handlers（edge runtime）＋ Cloudflare D1
               建置時 scripts/copy-liferpg.mjs 會把 apps/liferpg 複製到 public/，整個網站就是 LifeRPG
```

- 改畫面只改 `apps/liferpg/`；改 API 改 `apps/battery/`。兩者一起部署、同一個網域。
- AI：Workers AI（Meta Llama 3.3）＋規則式備援；`lib/ai.ts` 預留 Azure OpenAI 等供應商介面。
- 語音輸入：瀏覽器 Web Speech API（Edge／Chrome）轉文字，再由 AI 解析成行程。
- Outlook：一鍵訂閱（.ics）與從 Outlook 匯入未來七天行程。

## 本機開發

```bash
cd apps/battery          # node_modules 需在 WSL / Linux 安裝
npm install
npm run dev              # http://localhost:3000，會先把 LifeRPG 複製進 public/
```

## 部署

```bash
cd apps/battery
npm run deploy           # 建置（含 LifeRPG）並部署到 Cloudflare Pages 專案 liferpg-adventure
npm run db:seed:remote   # 重建示範資料（以當天為基準，錄影前要跑）
```

機密用 `npx wrangler pages secret put <名稱>` 設定。舊網址 social-battery-meter.pages.dev 與 liferpg-1h4.pages.dev 已 301 轉到新網址。

## 歷史

本 repo 由兩個專案（LifeRPG、社交電量計）以 `git subtree` 合併，保留各自完整的 commit 歷史，之後整合成單一 App。
