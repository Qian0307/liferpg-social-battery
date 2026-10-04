# LifeRPG 社交電量冒險

一個「會累的 RPG 角色」：把人生目標變成 Boss 戰的 **LifeRPG**，接上預測生活能量的 **生活電量計**。
社交、課業、工作、運動等行程讓角色的電量下降，完成「恢復與休息」讓電量回升、技能成長，AI 嚮導依電量建議今天該挑戰哪個 Boss。

> 自我照顧工具，不是醫療診斷。

## 專案結構

```
apps/
├── battery/   生活電量計：Next.js 14 + TypeScript，edge runtime，Cloudflare Pages + D1，PWA
│              AI：Workers AI（Meta Llama 3.3）＋規則式備援；Outlook 行事曆訂閱與匯入
└── liferpg/   LifeRPG：純靜態 PWA（單一 index.html），沒有 build step，資料存在 IndexedDB
```

兩個 app 各自部署、各自的網域，透過以下 API 串接（皆在 `apps/battery`）：

| API | 用途 |
|---|---|
| `GET /api/public/battery?session=<連結碼>` | LifeRPG 讀取今天與七天電量、風險日（唯讀） |
| `POST /api/public/recovery` | LifeRPG 完成「恢復與休息」後回報恢復行動，電量回升 |
| `POST /api/guide/today` | AI 嚮導：依電量與目標名稱給今日建議（Azure OpenAI 優先） |

詳細說明見 [`apps/battery/README.md`](apps/battery/README.md)，系統概述見 [`docs/系統概述.md`](docs/系統概述.md)。

正式網址：LifeRPG https://liferpg-1h4.pages.dev ・ 生活電量計 https://social-battery-meter.pages.dev

## 本機開發

```bash
# 社交電量計（node_modules 需在 WSL / Linux 安裝）
cd apps/battery
npm install
npm run dev                # http://localhost:3000

# LifeRPG（IndexedDB 與 Service Worker 不能用 file:// 開啟）
cd apps/liferpg
npx serve .
# 本機要接本機電量計時，網址加上 ?batteryApi=http://localhost:3000
```

## 部署

| App | 平台 | 設定 |
|---|---|---|
| `apps/battery` | Cloudflare Pages | 在 `apps/battery` 執行 `npm run deploy`；機密用 `npx wrangler pages secret put` 設定 |
| `apps/liferpg` | Cloudflare Pages | `npx wrangler pages deploy apps/liferpg --project-name liferpg`；安全標頭在 `_headers` |
| `apps/liferpg` | Vercel | 專案設定的 Root Directory 設為 `apps/liferpg`，Framework 選 Other |
| `apps/liferpg` | Azure Static Web Apps | GitHub Actions workflow 的 `app_location: "apps/liferpg"`，`output_location` 留空 |

LifeRPG 的安全標頭在 `_headers`（Cloudflare）、`vercel.json`、`staticwebapp.config.json` 三個檔案，內容要保持一致。

## 歷史

本 repo 由兩個專案以 `git subtree` 合併，保留各自完整的 commit 歷史。
