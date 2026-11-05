"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Fridge } from "@/lib/types";
import { Section, fmtSum } from "./ui";

interface O { fridge_id: string; status: string; total: number; payment_status: string; customer_id: string; issued_at: string | null; created_at: string }
interface M { kind: string; qty: number; batches: { fridge_id: string; products: { price: number } | null } | null }

const PERIODS = [
  { id: 1, label: "Сегодня" },
  { id: 7, label: "7 дней" },
  { id: 30, label: "30 дней" },
];

export function ReportsTab({ fridges }: { fridges: Fridge[] }) {
  const sb = browserClient();
  const [days, setDays] = useState(7);
  const [orders, setOrders] = useState<O[] | null>(null);
  const [moves, setMoves] = useState<M[]>([]);

  const load = useCallback(async () => {
    const from = new Date();
    if (days === 1) {
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(from);
      from.setTime(Date.parse(`${ymd}T00:00:00+05:00`));
    } else from.setTime(from.getTime() - days * 86400000);
    const iso = from.toISOString();
    const [o, m] = await Promise.all([
      sb.from("orders").select("fridge_id,status,total,payment_status,customer_id,issued_at,created_at").gte("created_at", iso).limit(5000),
      sb.from("stock_movements").select("kind,qty,batches(fridge_id,products(price))").in("kind", ["write_off", "withdraw"]).gte("created_at", iso).limit(5000),
    ]);
    setOrders((o.data ?? []) as O[]);
    setMoves((m.data ?? []) as unknown as M[]);
  }, [sb, days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rows = fridges.map((f) => {
    const fo = (orders ?? []).filter((o) => o.fridge_id === f.id);
    const issued = fo.filter((o) => o.status === "issued");
    const revenue = issued.reduce((s, o) => s + o.total, 0);
    const byCustomer = new Map<string, number>();
    issued.forEach((o) => byCustomer.set(o.customer_id, (byCustomer.get(o.customer_id) ?? 0) + 1));
    const fm = moves.filter((m) => m.batches?.fridge_id === f.id);
    return {
      f,
      revenue,
      issued: issued.length,
      avg: issued.length ? Math.round(revenue / issued.length) : 0,
      cancelled: fo.filter((o) => o.status === "cancelled").length,
      expired: fo.filter((o) => o.status === "expired").length,
      refunds: fo.filter((o) => o.payment_status === "refunded").reduce((s, o) => s + o.total, 0),
      repeat: [...byCustomer.values()].filter((n) => n > 1).length,
      woQty: fm.filter((m) => m.kind === "write_off").reduce((s, m) => s + m.qty, 0),
      woSum: fm.filter((m) => m.kind === "write_off").reduce((s, m) => s + m.qty * (m.batches?.products?.price ?? 0), 0),
      wdQty: fm.filter((m) => m.kind === "withdraw").reduce((s, m) => s + m.qty, 0),
    };
  });
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const totalIssued = sum("issued");

  return (
    <Section
      title="Отчёты"
      action={
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setDays(p.id)} className={`chip px-3 py-2 ${days === p.id ? "bg-brand-900 text-white" : "bg-white ring-1 ring-line"}`}>{p.label}</button>
          ))}
        </div>
      }
    >
      {!orders ? <p className="text-muted">Загрузка…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Выручка (выдано)" value={fmtSum(sum("revenue"))} />
            <Kpi label="Выдано заказов" value={String(totalIssued)} />
            <Kpi label="Средний чек" value={fmtSum(totalIssued ? Math.round(sum("revenue") / totalIssued) : 0)} />
            <Kpi label="Списано на сумму" value={fmtSum(sum("woSum"))} tone="danger" />
          </div>
          <div className="card mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-3">Точка</th><th className="p-3 text-right">Выручка</th><th className="p-3 text-right">Заказы</th>
                  <th className="p-3 text-right">Ср. чек</th><th className="p-3 text-right">Повторные покупатели</th>
                  <th className="p-3 text-right">Отмены / истекли</th><th className="p-3 text-right">Возвраты</th>
                  <th className="p-3 text-right">Списано, шт.</th><th className="p-3 text-right">Изъято, шт.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.f.id}>
                    <td className="p-3 font-bold">{r.f.name}</td>
                    <td className="p-3 text-right font-bold tabular-nums">{fmtSum(r.revenue)}</td>
                    <td className="p-3 text-right tabular-nums">{r.issued}</td>
                    <td className="p-3 text-right tabular-nums">{fmtSum(r.avg)}</td>
                    <td className="p-3 text-right tabular-nums">{r.repeat}</td>
                    <td className="p-3 text-right tabular-nums">{r.cancelled} / {r.expired}</td>
                    <td className="p-3 text-right tabular-nums">{fmtSum(r.refunds)}</td>
                    <td className="p-3 text-right tabular-nums">{r.woQty}</td>
                    <td className="p-3 text-right tabular-nums">{r.wdQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display mt-1.5 text-xl font-bold ${tone === "danger" ? "text-danger" : "text-brand-900"}`}>{value}</p>
    </div>
  );
}
