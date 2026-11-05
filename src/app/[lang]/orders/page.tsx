import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { t } from "@/lib/i18n";
import { isLang } from "@/lib/types";
import { MyOrders } from "@/components/MyOrders";

export const metadata: Metadata = { robots: { index: false } };

export default async function OrdersPage({ params }: PageProps<"/[lang]/orders">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-8">
      <h1 className="font-display text-2xl font-bold text-brand-900">{d.my_orders_title}</h1>
      <p className="mt-1 text-sm text-muted">{d.my_orders_note}</p>
      <MyOrders lang={lang} />
    </div>
  );
}
