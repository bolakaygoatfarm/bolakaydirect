import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { t } from "@/lib/i18n";
import { isLang } from "@/lib/types";
import { Checkout } from "@/components/Checkout";

export async function generateMetadata({ params }: PageProps<"/[lang]/checkout">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLang(lang) ? t(lang).checkout_title : "Checkout", robots: { index: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[lang]/checkout">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <Suspense fallback={<p className="mx-auto max-w-lg px-4 py-10 text-muted">{t(lang).loading}</p>}>
      <Checkout lang={lang} />
    </Suspense>
  );
}
