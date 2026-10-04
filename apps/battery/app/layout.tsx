import type { Metadata } from "next";
import "./globals.css";

/**
 * 整個網站的介面是 LifeRPG（public/index.html，建置時由 apps/liferpg 複製進來）。
 * Next.js 只提供 API；這個 layout 只會用在 404 之類的系統頁面。
 */
export const metadata: Metadata = {
  title: "LifeRPG 生活電量冒險",
  description: "把人生目標變成 Boss 戰，用生活電量規劃挑戰與恢復。",
  icons: { icon: "/icons/icon-192.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="font-sans antialiased">
        <main className="mx-auto max-w-lg px-5 py-16 text-center">
          {children}
          <p className="mt-6 text-sm">
            <a href="/" className="text-mint-600 underline underline-offset-4">回到 LifeRPG</a>
          </p>
        </main>
      </body>
    </html>
  );
}
