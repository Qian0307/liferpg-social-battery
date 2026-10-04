"use client";

import * as React from "react";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchCalendarSubscription, type CalendarSubscription } from "@/lib/client-api";

/**
 * Apple 日曆 / Google 日曆訂閱。
 *
 * 訂閱是「拉」的模式：行事曆用戶端會定時來抓 .ics，且不會帶 cookie，
 * 所以網址裡含一段隨機 token 當憑證。
 */
/** Outlook 網頁版「從網路訂閱」的深層連結。 */
function outlookAddUrl(origin: string, icsUrl: string): string {
  return `${origin}/calendar/0/addfromweb?url=${encodeURIComponent(icsUrl)}&name=${encodeURIComponent("生活電量計")}`;
}

export function CalendarSubscribe() {
  const [sub, setSub] = React.useState<CalendarSubscription | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function enable() {
    setLoading(true);
    setError(null);
    try {
      setSub(await fetchCalendarSubscription());
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法取得訂閱網址");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!sub) return;
    try {
      await navigator.clipboard.writeText(sub.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("複製失敗，請手動選取網址");
    }
  }

  const isLocalhost =
    typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-mint-600" />
          <h3 className="text-sm font-semibold">同步到 Outlook／Apple 行事曆</h3>
        </div>

        {!sub ? (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              把行程與電量預警訂閱到 Outlook 或 iPhone / Mac 的行事曆，行程和電量就在同一個地方看。
            </p>
            <Button variant="outline" className="w-full" disabled={loading} onClick={enable}>
              {loading ? "產生中…" : "產生訂閱網址"}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            {/* Outlook 網頁版的「從網路訂閱」深層連結：按下去直接帶入訂閱網址 */}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={outlookAddUrl("https://outlook.live.com", sub.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center rounded-2xl bg-[#0F6CBD] px-2 text-center text-xs font-medium text-white transition hover:brightness-110"
              >
                加入 Outlook（個人帳號）
              </a>
              <a
                href={outlookAddUrl("https://outlook.office.com", sub.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center rounded-2xl border border-[#0F6CBD] px-2 text-center text-xs font-medium text-[#0F6CBD] transition hover:bg-[#0F6CBD]/5"
              >
                加入 Outlook（學校／公司）
              </a>
            </div>
            <a
              href={sub.webcalUrl}
              className="flex h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-mint-500 to-sky-400 text-sm font-medium text-white transition hover:brightness-105"
            >
              在 Apple 行事曆中打開
            </a>

            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">或手動貼上這個網址：</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 text-[11px]">{sub.url}</code>
                <Button variant="ghost" size="icon" onClick={copy} aria-label="複製網址">
                  {copied ? <Check className="h-4 w-4 text-mint-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">怎麼在 Outlook／iPhone／Mac 訂閱？</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>Outlook 網頁版：行事曆 → 新增行事曆 → 從網路訂閱 → 貼上網址 → 匯入</li>
                <li>Outlook 桌面版：行事曆 → 新增行事曆 → 從網際網路 → 貼上網址</li>
                <li>iPhone：設定 → 應用程式 → 行事曆 → 帳號 → 加入帳號 → 其他 → 加入已訂閱的行事曆</li>
                <li>Mac：行事曆 App → 檔案 → 新增行事曆訂閱項目</li>
                <li>貼上上面的網址，重新整理頻率建議設為「每小時」</li>
              </ol>
            </details>

            {isLocalhost && (
              <p className="rounded-xl bg-coral-300/15 p-2.5 text-[11px] leading-relaxed text-coral-500">
                目前是 localhost，手機上的行事曆連不到。要真的訂閱，請先部署到 Cloudflare Pages 再產生一次網址。
              </p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default CalendarSubscribe;
