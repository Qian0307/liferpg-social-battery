"use client";

import * as React from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * 註冊 Service Worker，並在瀏覽器允許安裝時顯示「安裝 App」按鈕。
 * 只在正式環境註冊，避免 next dev 的熱更新被快取干擾。
 */
export function PwaRegister() {
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[pwa] Service Worker 註冊失敗:", err));
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await installEvent.prompt();
        await installEvent.userChoice;
        setInstallEvent(null);
      }}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-xs font-medium text-white shadow-lg transition hover:brightness-110"
    >
      <Download className="h-3.5 w-3.5" />
      安裝 App
    </button>
  );
}

export default PwaRegister;
