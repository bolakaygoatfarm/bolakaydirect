"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { savedOrders } from "@/lib/cart";
import { money, shortDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase";
import type { Lang, PublicOrder } from "@/lib/types";

/**
 * Заказы с этого устройства. Сверху активные, ниже выданные, отменённые и истёкшие свёрнуты.
 * Заказ попадает в нужную группу сам, по статусу. Из базы ничего не удаляется.
 */
export function MyOrders({ lang }: { lang: Lang }) {
  const d = t(lang);
  const [orders, setOrders] = useState<PublicOrder[] | null>(null);

  useEffect(() => {
    const tokens = savedOrders();
    const sb = browserClient();
    Promise.all(tokens.map((tk) => sb.rpc("get_order", { p_token: tk }).then((r) => r.data as PublicOrder | null))).then((list) =>
      // Просмотр заказа поднимает его в сохранённом списке, поэтому порядок задаём по дате создания
      setOrders(list.filter((o): o is PublicOrder => !!o).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))),
    );
  }, []);

  if (!orders) return <p className="mt-6 text-muted">{d.loading}</p>;
  if (!orders.length)
    return (
      <div className="mt-8 text-center">
        <p className="font-bold">{d.my_orders_empty}</p>
        <Link href={`/${lang}/points`} className="btn btn-primary mt-5">{d.hero_cta}</Link>
      </div>
    );

  const active = orders.filter((o) => o.status === "confirmed" || o.status === "pending_payment");
  const issued = orders.filter((o) => o.status === "issued");
  const closed = orders.filter((o) => o.status === "cancelled" || o.status === "expired");

  return (
    <div className="mt-6 grid gap-6">
      {active.length > 0 && <Group title={d.orders_active} orders={active} lang={lang} />}
      {issued.length > 0 && <Group title={d.orders_issued} orders={issued} lang={lang} repeat />}
      {closed.length > 0 && (
        <details className="group">
          <summary className="card flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-extrabold [&::-webkit-details-marker]:hidden">
            <span>{d.orders_closed} ({closed.length})</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <OrderList orders={closed} lang={lang} repeat className="mt-3" />
        </details>
      )}
    </div>
  );
}

function Group({ title, orders, lang, repeat = false }: { title: string; orders: PublicOrder[]; lang: Lang; repeat?: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-extrabold text-muted">{title} ({orders.length})</h2>
      <OrderList orders={orders} lang={lang} repeat={repeat} className="mt-2" />
    </section>
  );
}

function OrderList({ orders, lang, repeat, className = "" }: { orders: PublicOrder[]; lang: Lang; repeat: boolean; className?: string }) {
  const d = t(lang);
  return (
    <ul className={`grid gap-3 ${className}`}>
      {orders.map((o) => (
        <li key={o.token} className="card overflow-hidden transition hover:border-brand-200">
          <Link href={`/${lang}/order/${o.token}`} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-extrabold">{d.order} № {o.number}</p>
              <p className="text-sm text-muted">{o.fridge.name} · {shortDate(`${o.pickup_date}T12:00:00+05:00`, lang)}</p>
              <p className="mt-1 text-xs font-bold text-brand-700">{d[`st_${o.status}`]}</p>
            </div>
            <span className="font-extrabold">{money(o.total, lang)}</span>
          </Link>
          {repeat && (
            <Link href={`/${lang}/point/${o.fridge.code}?repeat=${o.token}`} className="block border-t border-line px-4 py-3 text-sm font-bold text-brand-700 hover:bg-brand-50">
              🔁 {d.orders_repeat}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
