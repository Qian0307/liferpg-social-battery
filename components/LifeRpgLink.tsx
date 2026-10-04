"use client";

import * as React from "react";
import { Check, Copy, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/http";

/**
 * 顯示 LifeRPG 的電量連結碼。
 * 使用者把它貼到 LifeRPG 設定裡，LifeRPG 就能讀取（唯讀）這裡的電量。
 */
export function LifeRpgLink() {
  const [code, setCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/link-code", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorMessage(res, "無法取得連結碼"));
      setCode(((await res.json()) as { code: string }).code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法取得連結碼");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("複製失敗，請手動選取連結碼");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-mint-600" />
          <h3 className="text-sm font-semibold">連結 LifeRPG</h3>
        </div>
        {!code ? (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              把連結碼貼到 LifeRPG 的「電量連結碼」，角色就會顯示你的社交電量。LifeRPG 只能讀取電量，不能改你的行程。
            </p>
            <Button variant="outline" className="w-full" disabled={loading} onClick={reveal}>
              {loading ? "讀取中…" : "顯示連結碼"}
            </Button>
          </>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 text-[11px]">{code}</code>
              <Button variant="ghost" size="icon" onClick={copy} aria-label="複製連結碼">
                {copied ? <Check className="h-4 w-4 text-mint-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">連結碼等同你的匿名身分，請不要公開分享。</p>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default LifeRpgLink;
