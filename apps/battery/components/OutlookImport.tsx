"use client";

import * as React from "react";
import { CalendarArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMonthDay } from "@/lib/activity-meta";
import { importOutlookCalendar, type OutlookImportResult } from "@/lib/client-api";

const MAX_FILE_BYTES = 2_000_000;

/**
 * 從 Outlook 匯入未來 7 天的行程。
 * 兩種來源：Outlook「發佈行事曆」的 ICS 連結，或從 Outlook 匯出的 .ics 檔案。
 * 行程標題只在伺服器端用來判斷類型，不會被儲存。
 */
export function OutlookImport({ onImported }: { onImported?: (result: OutlookImportResult) => void }) {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<OutlookImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function run(input: { url: string } | { ics: string }) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await importOutlookCalendar(input);
      setResult(r);
      onImported?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("檔案太大，請在 Outlook 匯出較短期間的行事曆");
      return;
    }
    await run({ ics: await file.text() });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <CalendarArrowDown className="h-4 w-4 text-[#0F6CBD]" />
          <h3 className="text-sm font-semibold">從 Outlook 匯入行程</h3>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          把 Outlook 行事曆未來 7 天的課、會議、打工、運動帶進來，自動判斷類型並估算耗電。行程標題只用來分類，不會被儲存。
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void run({ url: url.trim() });
          }}
        >
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="貼上 Outlook 發佈的 ICS 連結"
            className="h-10 min-w-0 flex-1 rounded-2xl border border-input bg-white/80 px-3 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" variant="outline" disabled={loading || !url.trim()}>
            {loading ? "匯入中…" : "匯入"}
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={handleFile} />
          <Button variant="ghost" size="sm" disabled={loading} onClick={() => fileRef.current?.click()}>
            或選擇從 Outlook 匯出的 .ics 檔案
          </Button>
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">怎麼取得 Outlook 的 ICS 連結？</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
            <li>Outlook 網頁版：設定 → 行事曆 → 共用行事曆 → 發佈行事曆</li>
            <li>選擇要發佈的行事曆與「可檢視所有詳細資料」，按「發佈」</li>
            <li>複製 ICS 連結，貼到上面的欄位</li>
          </ol>
        </details>

        {result && (
          <div className="space-y-1.5 rounded-2xl bg-mint-50/80 p-3 text-xs">
            <p className="font-medium text-mint-600">
              找到 {result.found} 個行程，新增 {result.imported} 個{result.skipped > 0 ? `，${result.skipped} 個先前已匯入` : ""}。
            </p>
            {result.items.slice(0, 6).map((item, i) => (
              <p key={i} className="text-muted-foreground">
                {formatMonthDay(item.date)} {item.time} · {item.label} · -{item.predictedDrain}%
              </p>
            ))}
            {result.items.length > 6 && <p className="text-muted-foreground">…還有 {result.items.length - 6} 個</p>}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default OutlookImport;
