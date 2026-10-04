# CLAUDE.md — LifeRPG 社交電量冒險

## 專案背景

本專案要參加 InnoServe 2026 大專校院資訊應用服務創新競賽，報名組別是「Microsoft AI 及 Data 生態系應用組」，主題一 Agentic Frontier。
目標是把兩個既有作品整合成一個「會累的 RPG 角色」，兩者現在放在同一個 monorepo：

- `apps/liferpg/`：LifeRPG，遊戲化成長系統。功能包含專注 Boss 戰、七大領域技能樹、人生目標章節。
- `apps/battery/`：生活電量計（原「社交電量計」），預測社交與課業、工作、運動、通勤、家務的耗電。電量會跨日結轉，並提供 AI 預測、風險預警、排程建議、Outlook 行事曆訂閱與匯入，可安裝為 PWA。
  子目錄另有自己的 `CLAUDE.md`（早期開發規格）。

## 時程

- 10/5（一）16:00 前：上傳系統概述文件和 3 分鐘影片。影片必須拍到下方「P0」的功能實際運作。
- 11/7（六）：決賽，現場 demo 6 分鐘。系統概述文件裡寫到的功能都要能操作。

## 最高原則

文件寫了什麼，程式就要做到什麼。時間不夠時，寧可縮小範圍做穩，也不要做半套。做不完的功能告訴我，我會把它移到文件的「下一階段」。

## 現況：單一 App

- 網址（唯一入口）：https://liferpg-adventure.pages.dev（Cloudflare Pages 專案 `liferpg-adventure`），示範情境 `/?demo=1#demo`。
- `apps/liferpg/`：**整個 App 的介面**，純靜態 PWA，全部寫在一個 `index.html`，沒有 build step，遊戲資料存在 IndexedDB。
  分頁：冒險大廳（電量條、AI 嚮導、七天統計）、生活電量（新增行程、語音輸入＋AI 辨識、七天行程、AI 排程建議、AI 週回顧、Outlook 訂閱與匯入）、人生目標、成長軌跡、技能樹、角色檔案。第一次進入會跳出 6 題快篩。
  修改時沿用現有的程式風格和資料驗證寫法（「格式不正確」這類檢查），新增資料欄位要照同樣方式驗證；資料遷移絕對不能改變歷史 XP。
- `apps/battery/`：**只有 API**（Next.js 14 Route Handlers、edge runtime、D1＋Drizzle）。建置時 `scripts/copy-liferpg.mjs` 把 LifeRPG 複製到 `public/`（不進 git）；middleware 把 `/` 改送 `index.html` 並加上安全標頭，舊頁面 `/week` 等一律轉回 `/`。`node_modules` 在 WSL 安裝，npm 指令都在 WSL 執行。
- `lib/ai.ts` 是所有 AI 呼叫的唯一入口。目前實際運作的是 Workers AI（Meta Llama 3.3）；Azure OpenAI 程式已預留但未設定（移到「下一階段」；GitHub Models 已於 2026/7/30 停止服務，不可使用）。全部失敗時退回規則式估算。
- 電量模型 `lib/battery.ts`：每天起床電量 = min(基礎容量, 前一天剩餘 + 基礎容量 × 0.8)，低於 30% 為風險日；恢復活動（`type: recovery`）耗電量為負。
- 活動分兩類：社交（人數、熟悉度）與生活 `study`／`work`／`exercise`／`commute`／`chores`（`intensity` 1–5）。
- 使用者以匿名 cookie `sbm_session` 識別；示範帳號 `demo-session`，任何網址加 `?demo=1` 會切到示範帳號；快篩不會覆寫示範帳號。

## 下一階段（先不要做）

Microsoft Graph 串接 Outlook、Copilot Studio、Teams、把電量服務搬到 Azure。

## 競賽規則限制（違反會被取消資格）

- 禁止使用中國或中資的開源模型，包括 DeepSeek、Qwen 等，相關的 API 和 MCP 也不行。
  - 如果 `WORKERS_AI_MODEL` 或任何 fallback 會指向這類模型，一律移除。
  - 目前允許使用的模型：Azure OpenAI 的 GPT 系列、Meta 的 Llama。
- 匿名原則：UI、示範資料和影片畫面中，不能出現校名、校徽或指導老師的姓名。修改 seed 或 demo 文案時，也要檢查這一點。
- 作品不能已經商品化：不要加入付費、訂閱這類功能。

## 共通規範

- 機密資訊一律不進 git。社交電量計用 `wrangler pages secret put` 設定，本機開發用 `.dev.vars`。
- 任何 AI 呼叫失敗時，功能都不能中斷，必須維持「規則式估算 + AI 在背景修正」的設計。
- `/week?demo=1` 是決賽 demo 的主線，任何修改都不能弄壞它。每完成一項任務就實際打開檢查一次。
- 產品定位是「自我照顧工具，不是醫療診斷」。UI 文案不要出現診斷、症狀、治療這類字眼。
- UI 一律使用繁體中文。

## 常用指令

```bash
# 都在 WSL 的 apps/battery 執行
npm run dev              # http://localhost:3000（含 LifeRPG），不能和 deploy 同時執行
npm run deploy           # 建置（含 LifeRPG）並部署到 Cloudflare Pages 專案 liferpg-adventure
npm run db:seed:remote   # demo 資料依當天日期重建，錄影前要跑
npx wrangler pages secret put AZURE_OPENAI_API_KEY   # 設定完要重新 deploy

# 只看 LifeRPG 畫面（沒有 API）：在 apps/liferpg 執行 npx serve .，網址加 ?batteryApi=http://localhost:3000 可接本機 API
```

## 完成定義（影片要拍到的畫面）

1. LifeRPG 開啟一場專注 Boss 戰，打完拿到 XP。
2. 在社交電量計用語音新增一場「迎新」，回到 LifeRPG，電量條跟著下降。
3. AI 嚮導卡片顯示今天的建議和風險日，並能看出建議是由 Azure 產生的。
4. 完成一段「恢復與休息」後，電量條回升，技能也升級。
5. 拍到 Azure Portal 上的 Foundry 部署畫面和 Static Web Apps 畫面。

每完成一項任務，就回報「做了什麼、怎麼驗證、有什麼還沒做」，讓我能同步更新系統概述文件。
