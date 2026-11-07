import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import "../globals.css";
import { onest } from "../fonts";
import { Logo } from "@/components/Logo";
import { Wave } from "@/components/Backdrop";
import { LangSwitch } from "@/components/LangSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthLinkForwarder } from "@/components/AuthLinkForwarder";
import { TelegramWebApp } from "@/components/TelegramWebApp";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getSupportPhone } from "@/lib/data";
import { formatPhone } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isLang, LANGS } from "@/lib/types";
import { SITE_URL } from "@/lib/supabase";

const CONTACT_PHONE = "+998974504434";

const ICONS = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  telegram: <path d="m21 4-3 16-6-4.5-3 3v-5l9-8-11 7-4-1.5Z" />,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" /></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" fill="currentColor" /></>,
};

function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-3 sm:col-span-1">
      <span className="font-bold text-butter">{title}</span>
      {children}
    </div>
  );
}

/** Ссылка подвала с иконкой. Внешние адреса открываются в новой вкладке, телефон — звонком */
function FooterLink({ href, icon, service, label }: { href: string; icon: keyof typeof ICONS; service: string; label: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className="group flex min-w-0 items-center gap-2.5 font-bold text-white/85 hover:text-white"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition group-hover:bg-white/20">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-xs font-normal text-white/50">{service}</span>
        <span className="block truncate">{label}</span>
      </span>
    </a>
  );
}

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
  // Телефон из настроек панели, если его там поменяют; иначе основной номер фермы
  const contactPhone = (await getSupportPhone()) ?? CONTACT_PHONE;
  return (
    <html lang={lang} data-scroll-behavior="smooth" suppressHydrationWarning className={onest.variable}>
      <head>
        {/* Тема ставится до отрисовки — без вспышки белого */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="site-body flex min-h-dvh flex-col">
        <AuthLinkForwarder />
        <TelegramWebApp />
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
              <Link href={`/${lang}/about`} className="hidden rounded-full px-3 py-2 text-ink/80 hover:bg-brand-50 md:block">
                {d.nav_about}
              </Link>
              <Link prefetch={false} href={`/${lang}/orders`} aria-label={d.nav_orders} className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-ink/80 hover:bg-brand-50 sm:px-3">
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
          <div className="relative mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-8 px-4 pt-12 pb-8 text-sm text-white/65 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr]">
            <div className="col-span-2 lg:col-span-1">
              <Logo onDark />
              <p className="mt-3 max-w-xs">{d.footer_text}</p>
            </div>
            <nav className="col-span-2 flex flex-wrap gap-x-6 gap-y-2 lg:col-span-1 lg:flex-col" aria-label="BOLAKAY">
              <Link className="hover:text-white" href={`/${lang}/points`}>{d.nav_points}</Link>
              <Link className="hover:text-white" href={`/${lang}/about`}>{d.nav_about}</Link>
              <Link prefetch={false} className="hover:text-white" href={`/${lang}/orders`}>{d.nav_orders}</Link>
            </nav>
            <FooterGroup title={d.contact_us}>
              <FooterLink href={`tel:${contactPhone}`} icon="phone" service={{ uz: "Telefon", ru: "Телефон", en: "Phone" }[lang]} label={formatPhone(contactPhone)} />
              <FooterLink href="https://t.me/contactbolakay" icon="telegram" service="Telegram" label="@contactbolakay" />
            </FooterGroup>
            <FooterGroup title={d.our_channels}>
              <FooterLink href="https://t.me/bolakayschool" icon="telegram" service="Telegram" label="@bolakayschool" />
              <FooterLink href="https://www.instagram.com/bolakaygoatfarm/" icon="instagram" service="Instagram" label="@bolakaygoatfarm" />
              <FooterLink href="https://www.youtube.com/@bolakaygoatfarm" icon="youtube" service="YouTube" label="@bolakaygoatfarm" />
            </FooterGroup>
          </div>
          <p className="relative mx-auto max-w-5xl border-t border-white/10 px-4 py-5 text-xs text-white/45">© BOLAKAY GOAT FARM</p>
        </footer>
      </body>
    </html>
  );
}
