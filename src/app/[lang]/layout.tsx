import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import "../globals.css";
import { manrope, unbounded } from "../fonts";
import { Logo } from "@/components/Logo";
import { Wave } from "@/components/Backdrop";
import { LangSwitch } from "@/components/LangSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { t } from "@/lib/i18n";
import { isLang, LANGS } from "@/lib/types";
import { SITE_URL } from "@/lib/supabase";

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#04a9e4" }, { media: "(prefers-color-scheme: dark)", color: "#06111f" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const d = t(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `BOLAKAY — ${d.tagline}`, template: "%s · BOLAKAY" },
    description: d.hero_text,
    manifest: "/manifest.webmanifest",
    alternates: { canonical: `/${lang}`, languages: { uz: "/uz", ru: "/ru", en: "/en" } },
    openGraph: { type: "website", siteName: "BOLAKAY", title: `BOLAKAY — ${d.tagline}`, description: d.hero_text, locale: { uz: "uz_UZ", ru: "ru_RU", en: "en_US" }[lang] },
    icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  };
}

export default async function LangLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  return (
    <html lang={lang} data-scroll-behavior="smooth" suppressHydrationWarning className={`${manrope.variable} ${unbounded.variable}`}>
      <head>
        {/* Тема ставится до отрисовки — без вспышки белого */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 btn btn-primary">
          {{ uz: "Asosiy qismga o‘tish", ru: "К содержимому", en: "Skip to content" }[lang]}
        </a>
        <header className="sticky top-0 z-30">
          {/* Прогрессивное размытие: плотный слой под шапкой + затухающая «вуаль» ниже неё */}
          <div aria-hidden className="header-glass" />
          <div aria-hidden className="header-fade" />
          <div className="relative mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
            <Link href={`/${lang}`} aria-label="BOLAKAY">
              <Logo sub="Direct" />
            </Link>
            <nav className="flex items-center gap-0.5 text-sm font-bold sm:gap-1">
              <Link href={`/${lang}/points`} className="hidden rounded-full px-3 py-2 text-ink/80 hover:bg-brand-50 sm:block">
                {d.nav_points}
              </Link>
              <Link href={`/${lang}/orders`} aria-label={d.nav_orders} className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-ink/80 hover:bg-brand-50 sm:px-3">
                <svg viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
                <span className="hidden sm:inline">{d.nav_orders}</span>
              </Link>
              <ThemeToggle labels={{ light: d.theme_light, dark: d.theme_dark }} />
              <Suspense fallback={<span className="w-[6.5rem]" />}>
                <LangSwitch lang={lang} />
              </Suspense>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <Wave className="bg-page text-night" />
        <footer className="night -mt-px">
          <div className="relative mx-auto grid max-w-5xl gap-6 px-4 py-12 text-sm text-white/65 sm:grid-cols-3">
            <div>
              <Logo onDark />
              <p className="mt-3 max-w-xs">{d.footer_text}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Link className="hover:text-white" href={`/${lang}/points`}>{d.nav_points}</Link>
              <Link className="hover:text-white" href={`/${lang}#farm`}>{d.nav_about}</Link>
              <Link className="hover:text-white" href={`/${lang}/orders`}>{d.nav_orders}</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-bold text-butter">{d.support}</span>
              <a className="hover:text-white" href="tel:+998900000000">+998 90 000 00 00</a>
              <span>© BOLAKAY GOAT FARM</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
