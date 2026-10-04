# CLAUDE.md — LifeRPG 社交電量冒險

## 專案背景

本專案要參加 InnoServe 2026 大專校院資訊應用服務創新競賽，報名組別是「Microsoft AI 及 Data 生態系應用組」，主題一 Agentic Frontier。
目標是把兩個既有作品整合成一個「會累的 RPG 角色」，兩者現在放在同一個 monorepo：

- `apps/liferpg/`：LifeRPG，遊戲化成長系統。功能包含專注 Boss 戰、七大領域技能樹、人生目標章節。
- `apps/battery/`：社交電量計，社交能量預測工具。電量會跨日結轉，並提供 AI 預測、風險預警與排程建議。
  子目錄另有自己的 `CLAUDE.md`（早期開發規格）。

## 時程

- 10/5（一）16:00 前：上傳系統概述文件和 3 分鐘影片。影片必須拍到下方「P0」的功能實際運作。
- 11/7（六）：決賽，現場 demo 6 分鐘。系統概述文件裡寫到的功能都要能操作。

## 最高原則

文件寫了什麼，程式就要做到什麼。時間不夠時，寧可縮小範圍做穩，也不要做半套。做不完的功能告訴我，我會把它移到文件的「下一階段」。

## 兩個 app 的現況

### LifeRPG（`apps/liferpg/`）

- 純靜態 PWA，整個應用程式寫在一個約 200KB 的 `index.html` 裡，沒有 build step。
- 資料存在瀏覽器的 IndexedDB，只放本機。另外有 `sw.js`（Service Worker）和 `manifest.webmanifest`。
- 部署在 Vercel（Root Directory 為 `apps/liferpg`）與 Azure Static Web Apps。CSP 的 `connect-src` 已開放社交電量計網域，`vercel.json` 與 `staticwebapp.config.json` 兩邊要保持一致。
- 七大領域之一「健康與身體」底下的「恢復與休息」（`health.recovery`）分類：放鬆練習、離屏休息、休息安排。完成這類專注或補登會回報社交電量計。
- 修改 `index.html` 時，請沿用現有的程式風格和資料驗證寫法。檔案裡有大量格式檢查，例如「格式不正確」這類錯誤訊息，新增的資料欄位也要照同樣方式驗證。如果需要遷移資料，絕對不能改變歷史 XP。

### 社交電量計（`apps/battery/`）

- Next.js 14（App Router）加 TypeScript，所有 route 都跑在 edge runtime，部署在 Cloudflare Pages，資料庫用 D1 搭配 Drizzle。
- `node_modules` 在 WSL（Linux）安裝，所有 npm 指令請在 WSL 裡執行。
- `lib/ai.ts` 是所有 AI 呼叫的唯一入口，依序嘗試 Azure OpenAI → Workers AI → Groq → OpenAI，全部失敗時退回規則式估算（`lib/drain-rules.ts`）。回應的 `provider` 欄位標示實際回答的供應商。
- `lib/battery.ts` 的 `simulateWeek()` 是電量模型：每天起床電量 = min(基礎容量, 前一天剩餘 + 基礎容量 × 0.8)，當天結束時低於 30% 就判定為風險日。恢復活動（`type: recovery`）的耗電量為負值。
- 使用者用匿名 session 識別，cookie 名稱是 `sbm_session`。demo 資料綁在 `demo-session`，網址 `/week?demo=1` 會自動載入。
- LifeRPG 串接用的 API：`GET /api/public/battery`、`POST /api/public/recovery`、`POST /api/guide/today`，用連結碼認人、不依賴跨站 cookie，CORS 白名單由 `LIFERPG_ORIGINS` 設定。

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
# 社交電量計（在 WSL 的 apps/battery 執行）
npm run dev              # http://localhost:3000，不能和 deploy 同時執行
npm run deploy           # 建置並部署到 Cloudflare Pages
npm run db:seed:remote   # demo 資料依當天日期重建，錄影前要跑
npx wrangler pages secret put AZURE_OPENAI_API_KEY   # 設定完要重新 deploy

# LifeRPG（在 apps/liferpg 執行，沒有 build step）
npx serve .              # IndexedDB 和 Service Worker 不能用 file:// 開啟
                         # 接本機電量計：網址加 ?batteryApi=http://localhost:3000
```

## 完成定義（影片要拍到的畫面）

1. LifeRPG 開啟一場專注 Boss 戰，打完拿到 XP。
2. 在社交電量計用語音新增一場「迎新」，回到 LifeRPG，電量條跟著下降。
3. AI 嚮導卡片顯示今天的建議和風險日，並能看出建議是由 Azure 產生的。
4. 完成一段「恢復與休息」後，電量條回升，技能也升級。
5. 拍到 Azure Portal 上的 Foundry 部署畫面和 Static Web Apps 畫面。

每完成一項任務，就回報「做了什麼、怎麼驗證、有什麼還沒做」，讓我能同步更新系統概述文件。
