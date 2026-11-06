"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Fridge } from "@/lib/types";
import { Section, fmtDT } from "./ui";
import { batchState, type StaffBatch } from "./StockTab";
import { sizeLabel } from "@/lib/format";
import { s, staffLang } from "./i18n";

interface Preorder {
  id: string;
  fridge_id: string;
  product_id: string;
  qty: number;
  status: "waiting" | "notified" | "fulfilled" | "cancelled";
  created_at: string;
  customers: { phone: string } | null;
  products: { name_ru: string; size_label: string } | null;
}

/** Маршрутный лист: что лежит в каждом холодильнике, что заказано заранее и что нужно забрать. */
export function DeliveryTab({ fridges }: { fridges: Fridge[] }) {
  const sb = browserClient();
  const [batches, setBatches] = useState<StaffBatch[] | null>(null);
  const [preorders, setPreorders] = useState<Preorder[]>([]);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const [b, p] = await Promise.all([
      sb.from("batches").select("*,products(name_ru,size_label,price)").eq("status", "active"),
      sb.from("preorders").select("id,fridge_id,product_id,qty,status,created_at,customers(phone),products(name_ru,size_label)").in("status", ["waiting", "notified"]).order("created_at"),
    ]);
    setBatches((b.data ?? []) as StaffBatch[]);
    setPreorders((p.data ?? []) as unknown as Preorder[]);
    setNow(Date.now());
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function setStatus(id: string, status: Preorder["status"]) {
    await sb.from("preorders").update({ status }).eq("id", id);
    void load();
  }

  if (!batches) return <p className="mt-5 text-muted">{s("Загрузка…")}</p>;

  return (
    <>
      {fridges.filter((f) => f.status !== "inactive").map((f) => {
        const fb = batches.filter((b) => b.fridge_id === f.id);
        const fp = preorders.filter((p) => p.fridge_id === f.id);
        const productIds = [...new Set([...fb.map((b) => b.product_id), ...fp.map((p) => p.product_id)])];
        const rows = productIds.map((pid) => {
          const bs = fb.filter((b) => b.product_id === pid);
          const name = bs[0]?.products ?? fp.find((p) => p.product_id === pid)?.products;
          const live = bs.filter((b) => !batchState(b, now).expired);
          return {
            pid,
            name: name ? `${name.name_ru} · ${sizeLabel(name.size_label, staffLang())}` : pid,
            stock: live.reduce((s, b) => s + b.qty_on_hand - b.qty_reserved, 0),
            reserved: bs.reduce((s, b) => s + b.qty_reserved, 0),
            pre: fp.filter((p) => p.product_id === pid && p.status === "waiting").reduce((s, p) => s + p.qty, 0),
            pickup: bs.filter((b) => batchState(b, now).expired).reduce((s, b) => s + b.qty_on_hand - b.qty_reserved, 0),
          };
        });
        return (
          <Section key={f.id} title={s("{0} — маршрутный лист", f.name)}>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="p-3">{s("Товар")}</th>
                    <th className="p-3 text-right">{s("Остаток")}</th>
                    <th className="p-3 text-right">{s("Резерв")}</th>
                    <th className="p-3 text-right">{s("Предзаказы")}</th>
                    <th className="p-3 text-right">{s("Забрать (истёк срок)")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.length ? rows.map((r) => (
                    <tr key={r.pid}>
                      <td className="p-3 font-bold">{r.name}</td>
                      <td className={`p-3 text-right tabular-nums ${r.stock === 0 ? "font-bold text-danger" : ""}`}>{r.stock}</td>
                      <td className="p-3 text-right tabular-nums">{r.reserved}</td>
                      <td className={`p-3 text-right tabular-nums ${r.pre ? "font-bold text-brand-700" : ""}`}>{r.pre}</td>
                      <td className={`p-3 text-right tabular-nums ${r.pickup ? "font-bold text-danger" : ""}`}>{r.pickup}</td>
                    </tr>
                  )) : <tr><td className="p-4 text-muted" colSpan={5}>{s("Холодильник пуст, предзаказов нет.")}</td></tr>}
                </tbody>
              </table>
            </div>
            {fp.length > 0 && (
              <ul className="mt-3 grid gap-2">
                {fp.map((p) => (
                  <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span>
                      <b>{p.products?.name_ru} · {sizeLabel(p.products?.size_label, staffLang())} × {p.qty}</b>
                      <span className="text-muted"> · {fmtDT(p.created_at)} · </span>
                      <a className="font-bold text-brand-700" href={`tel:${p.customers?.phone}`}>{p.customers?.phone}</a>
                      {p.status === "notified" && <span className="chip ml-2 bg-brand-50 text-brand-700">{s("уведомлён")}</span>}
                    </span>
                    <span className="flex gap-2">
                      {p.status === "waiting" && <button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => setStatus(p.id, "notified")}>{s("Уведомлён")}</button>}
                      <button className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => setStatus(p.id, "fulfilled")}>{s("Выполнен")}</button>
                      <button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => setStatus(p.id, "cancelled")}>{s("Отмена")}</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}
      <p className="mt-4 text-xs text-muted">{s("Приёмка новых партий и изъятие просрочки — во вкладке «Остатки» выбранной точки.")}</p>
    </>
  );
}
