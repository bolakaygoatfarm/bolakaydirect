"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Fridge, OrderStatus } from "@/lib/types";
import type { Me } from "./StaffApp";
import { ErrorNote, Field, Modal, Section, fmtDT, fmtSum, staffError } from "./ui";

interface StaffOrder {
  id: string;
  number: number;
  pickup_code: string;
  status: OrderStatus;
  payment_method: "on_pickup" | "click" | "payme";
  payment_status: "unpaid" | "paid" | "refunded" | "failed";
  total: number;
  pickup_date: string;
  pickup_slot: string;
  reserved_until: string;
  customer_name: string | null;
  comment: string | null;
  created_at: string;
  customers: { phone: string } | null;
  order_items: { qty: number; price: number; products: { name_ru: string; size_label: string } | null; batches: { produced_at: string; lot_code: string | null } | null }[];
}

const STATUS_RU: Record<OrderStatus, string> = {
  pending_payment: "Ждёт оплаты", confirmed: "Резерв", issued: "Выдан", cancelled: "Отменён", expired: "Истёк",
};

export function OrdersTab({ fridge, me }: { fridge: Fridge; me: Me }) {
  const sb = browserClient();
  const [orders, setOrders] = useState<StaffOrder[] | null>(null);
  const [history, setHistory] = useState(false);
  const [q, setQ] = useState("");
  const [issuing, setIssuing] = useState<StaffOrder | null>(null);
  const [cancelling, setCancelling] = useState<StaffOrder | null>(null);

  const load = useCallback(async () => {
    let query = sb
      .from("orders")
      .select("id,number,pickup_code,status,payment_method,payment_status,total,pickup_date,pickup_slot,reserved_until,customer_name,comment,created_at,customers(phone),order_items(qty,price,products(name_ru,size_label),batches(produced_at,lot_code))")
      .eq("fridge_id", fridge.id);
    query = history
      ? query.in("status", ["issued", "cancelled", "expired"]).order("created_at", { ascending: false }).limit(50)
      : query.in("status", ["confirmed", "pending_payment"]).order("pickup_date").order("pickup_slot");
    const { data } = await query;
    setOrders((data ?? []) as unknown as StaffOrder[]);
  }, [sb, fridge.id, history]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  const term = q.trim();
  const shown = (orders ?? []).filter((o) => !term || String(o.number).includes(term) || o.pickup_code === term || o.customers?.phone.includes(term));

  return (
    <Section
      title={history ? "История заказов" : "Заказы к выдаче"}
      action={<button className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => setHistory(!history)}>{history ? "← Активные" : "История"}</button>}
    >
      <input className="field mb-3" inputMode="numeric" placeholder="Поиск: № заказа, код или телефон" value={q} onChange={(e) => setQ(e.target.value)} />
      {!orders ? <p className="text-muted">Загрузка…</p> : !shown.length ? <p className="card p-5 text-muted">Заказов нет.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((o) => (
            <li key={o.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-bold">№ {o.number}</p>
                  <p className="text-sm text-muted">{o.pickup_date.split("-").reverse().slice(0, 2).join(".")} · {o.pickup_slot.replace("-", "–")}</p>
                </div>
                <div className="text-right">
                  <span className={`chip ${o.status === "confirmed" ? "bg-fresh-50 text-fresh" : o.status === "issued" ? "bg-brand-50 text-brand-700" : "bg-aged-50 text-aged"}`}>{STATUS_RU[o.status]}</span>
                  <p className="mt-1 text-xs font-bold text-muted">{o.payment_status === "paid" ? "Оплачен" : o.payment_status === "refunded" ? "Возврат" : "Не оплачен"}</p>
                </div>
              </div>
              <ul className="mt-3 grid gap-1 text-sm">
                {o.order_items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-2">
                    <span>{i.products?.name_ru} · {i.products?.size_label} <span className="text-muted">({i.batches ? fmtDT(i.batches.produced_at) : ""})</span></span>
                    <b className="shrink-0">× {i.qty}</b>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                <a className="font-bold text-brand-700" href={`tel:${o.customers?.phone}`}>{o.customers?.phone}</a>
                <span className="font-extrabold">{fmtSum(o.total)}</span>
              </div>
              {o.customer_name && <p className="mt-1 text-sm text-muted">{o.customer_name}</p>}
              {o.comment && <p className="mt-1 rounded-lg bg-milk p-2 text-sm">💬 {o.comment}</p>}
              {o.status === "confirmed" && (
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary flex-1" onClick={() => setIssuing(o)}>Выдать</button>
                  {me.role !== "courier" && <button className="btn btn-danger" onClick={() => setCancelling(o)}>Отменить</button>}
                </div>
              )}
              {o.status === "pending_payment" && me.role !== "courier" && (
                <button className="btn btn-danger mt-3 w-full" onClick={() => setCancelling(o)}>Отменить</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {issuing && <IssueModal order={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); void load(); }} />}
      {cancelling && <CancelModal order={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); void load(); }} />}
    </Section>
  );
}

function IssueModal({ order, onClose, onDone }: { order: StaffOrder; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [pay, setPay] = useState<"cash" | "card_terminal">("cash");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsPayment = order.payment_status !== "paid";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim() !== order.pickup_code) return setErr("Код не совпадает. Попросите покупателя показать экран заказа.");
    setBusy(true);
    setErr(null);
    const { error } = await browserClient().rpc("issue_order", { p_order_id: order.id, p_payment_provider: needsPayment ? pay : null });
    setBusy(false);
    if (error) setErr(staffError(error.message));
    else onDone();
  }

  return (
    <Modal title={`Выдача заказа № ${order.number}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Код получения от покупателя">
          <input className="field font-display text-center text-3xl tracking-[0.3em]" inputMode="numeric" maxLength={4} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
        </Field>
        {needsPayment && (
          <fieldset>
            <legend className="label">Получена оплата {fmtSum(order.total)}</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="option" aria-pressed={pay === "cash"} onClick={() => setPay("cash")}>Наличные</button>
              <button type="button" className="option" aria-pressed={pay === "card_terminal"} onClick={() => setPay("card_terminal")}>Карта (терминал)</button>
            </div>
          </fieldset>
        )}
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy || code.length !== 4}>{busy ? "Сохраняем…" : needsPayment ? "Оплата получена, товар выдан" : "Товар выдан"}</button>
      </form>
    </Modal>
  );
}

function CancelModal({ order, onClose, onDone }: { order: StaffOrder; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await browserClient().rpc("staff_cancel_order", { p_order_id: order.id, p_reason: reason });
    setBusy(false);
    if (error) setErr(staffError(error.message));
    else onDone();
  }
  return (
    <Modal title={`Отмена заказа № ${order.number}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-muted">Резерв будет снят, товар вернётся в продажу.{order.payment_status === "paid" && " Заказ оплачен — будет зафиксирован возврат, верните деньги покупателю."}</p>
        <Field label="Причина"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required /></Field>
        <ErrorNote text={err} />
        <button className="btn btn-danger" disabled={busy}>Отменить заказ</button>
      </form>
    </Modal>
  );
}
