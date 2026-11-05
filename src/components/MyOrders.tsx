"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { savedOrders } from "@/lib/cart";
import { money, shortDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase";
import type { Lang, PublicOrder } from "@/lib/types";

export function MyOrders({ lang }: { lang: Lang }) {
  const d = t(lang);
  const [orders, setOrders] = useState<PublicOrder[] | null>(null);

  useEffect(() => {
    const tokens = savedOrders();
    const sb = browserClient();
    Promise.all(tokens.map((tk) => sb.rpc("get_order", { p_token: tk }).then((r) => r.data as PublicOrder | null))).then((list) =>
      setOrders(list.filter((o): o is PublicOrder => !!o)),
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

  return (
    <ul className="mt-6 grid gap-3">
      {orders.map((o) => (
        <li key={o.token}>
          <Link href={`/${lang}/order/${o.token}`} className="card flex items-center justify-between gap-3 p-4 transition hover:border-brand-200">
            <div>
              <p className="font-extrabold">{d.order} № {o.number}</p>
              <p className="text-sm text-muted">{o.fridge.name} · {shortDate(`${o.pickup_date}T12:00:00+05:00`, lang)}</p>
              <p className="mt-1 text-xs font-bold text-brand-700">{d[`st_${o.status}`]}</p>
            </div>
            <span className="font-extrabold">{money(o.total, lang)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
