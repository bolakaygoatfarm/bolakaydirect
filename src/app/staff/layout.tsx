import type { Metadata, Viewport } from "next";
import "../globals.css";
import { manrope, unbounded } from "../fonts";

export const metadata: Metadata = {
  title: "BOLAKAY · Сотрудники",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0c2f52", width: "device-width", initialScale: 1 };

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh bg-[#f5f8fb]">{children}</body>
    </html>
  );
}
