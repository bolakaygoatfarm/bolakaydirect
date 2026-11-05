import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { t } from "@/lib/i18n";
import { isLang } from "@/lib/types";
import { OrderView } from "@/components/OrderView";

export const metadata: Metadata = { title: "Buyurtma / Заказ", robots: { index: false, follow: false } };

export default function OrderPage({ params }: PageProps<"/[lang]/order/[token]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-lg px-4 py-10 text-muted">…</p>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/[lang]/order/[token]">["params"] }) {
  const { lang, token } = await params;
  if (!isLang(lang) || !/^[0-9a-f-]{36}$/i.test(token)) notFound();
  return <OrderView lang={lang} token={token} loadingText={t(lang).loading} />;
}
