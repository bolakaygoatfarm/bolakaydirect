import type { Metadata, Viewport } from "next";
import "../globals.css";
import { onest } from "../fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "BOLAKAY · Telegram",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0a2747" }, { media: "(prefers-color-scheme: dark)", color: "#06111f" }],
  width: "device-width",
  initialScale: 1,
};

/** Вход администратора, открывается кнопкой бота внутри Telegram */
export default function TgAdminLayout({ children }: LayoutProps<"/tg-admin">) {
  return (
    <html lang="ru" suppressHydrationWarning className={onest.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas">{children}</body>
    </html>
  );
}
