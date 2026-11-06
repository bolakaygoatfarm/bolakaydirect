"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Fridge, Product } from "@/lib/types";
import { ErrorNote, Field, Modal, Section, fmtDT, nowLocalInput, staffError, tashkentInputToISO } from "./ui";
import { sizeLabel } from "@/lib/format";
import { s, rich, staffLang } from "./i18n";

export interface StaffBatch {
  id: string;
  product_id: string;
  fridge_id: string;
  lot_code: string | null;
  produced_at: string;
  expires_at: string;
  sell_until: string;
  qty_received: number;
  qty_on_hand: number;
  qty_reserved: number;
  status: string;
  products: { name_ru: string; size_label: string; price: number } | null;
}

export function batchState(b: Pick<StaffBatch, "sell_until">, now = Date.now()) {
  const left = Date.parse(b.sell_until) - now;
  if (left <= 0) return { tone: "bg-danger-50 text-danger", label: s("Снято с продажи — изъять"), expired: true };
  if (left < 12 * 3600 * 1000) return { tone: "bg-aged-50 text-aged", label: s("Истекает срок реализации"), expired: false };
  return { tone: "bg-fresh-50 text-fresh", label: s("В продаже"), expired: false };
}

export function StockTab({ fridge }: { fridge: Fridge }) {
  const sb = browserClient();
  const [batches, setBatches] = useState<StaffBatch[] | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [removing, setRemoving] = useState<StaffBatch | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb
      .from("batches")
      .select("*,products(name_ru,size_label,price)")
      .eq("fridge_id", fridge.id)
      .eq("status", "active")
      .order("produced_at", { ascending: false });
    setBatches((data ?? []) as StaffBatch[]);
  }, [sb, fridge.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <Section title={s("Партии в {0}", fridge.name)} action={<button className="btn btn-primary min-h-10 text-sm" onClick={() => setReceiving(true)}>{s("+ Приёмка")}</button>}>
      {!batches ? <p className="text-muted">{s("Загрузка…")}</p> : !batches.length ? <p className="card p-5 text-muted">{s("Активных партий нет.")}</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-3">{s("Товар / партия")}</th>
                <th className="p-3">{s("Произведено")}</th>
                <th className="p-3">{s("В продаже до")}</th>
                <th className="p-3 text-right">{s("На месте")}</th>
                <th className="p-3 text-right">{s("Резерв")}</th>
                <th className="p-3 text-right">{s("Доступно")}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batches.map((b) => {
                const st = batchState(b);
                const free = b.qty_on_hand - b.qty_reserved;
                return (
                  <tr key={b.id}>
                    <td className="p-3">
                      <p className="font-bold">{b.products?.name_ru} · {sizeLabel(b.products?.size_label, staffLang())}</p>
                      <p className="text-xs text-muted">{b.lot_code || b.id.slice(0, 8)}</p>
                      <span className={`chip mt-1 ${st.tone}`}>{st.label}</span>
                    </td>
                    <td className="p-3">{fmtDT(b.produced_at)}</td>
                    <td className="p-3">{fmtDT(b.sell_until)}</td>
                    <td className="p-3 text-right font-bold tabular-nums">{b.qty_on_hand}</td>
                    <td className="p-3 text-right tabular-nums">{b.qty_reserved}</td>
                    <td className="p-3 text-right font-bold tabular-nums">{st.expired ? 0 : free}</td>
                    <td className="p-3 text-right">
                      {free > 0 && <button className={`btn min-h-9 px-3 text-xs ${st.expired ? "btn-danger" : "btn-ghost"}`} onClick={() => setRemoving(b)}>{s("Изъять / списать")}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {receiving && <ReceiveModal fridge={fridge} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); void load(); }} />}
      {removing && <RemoveModal batch={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); void load(); }} />}
    </Section>
  );
}

export function ReceiveModal({ fridge, onClose, onDone }: { fridge: Fridge; onClose: () => void; onDone: () => void }) {
  const sb = browserClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [produced, setProduced] = useState(nowLocalInput());
  const [qty, setQty] = useState(10);
  const [lot, setLot] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    sb.from("products").select("*").eq("is_active", true).order("sort").then(({ data }) => {
      const list = (data ?? []) as Product[];
      setProducts(list);
      setProductId((v) => v || list[0]?.id || "");
    });
  }, [sb]);

  const product = products.find((p) => p.id === productId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await sb.rpc("receive_batch", {
      p_fridge_id: fridge.id,
      p_product_id: productId,
      p_produced_at: tashkentInputToISO(produced),
      p_qty: qty,
      p_lot_code: lot || null,
      p_expires_at: expires ? `${expires}T23:59:00+05:00` : null,
    });
    setBusy(false);
    if (error) setErr(staffError(error.message));
    else onDone();
  }

  return (
    <Modal title={s("Приёмка в {0}", fridge.name)} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={s("Товар")}>
          <select className="field" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {sizeLabel(p.size_label, staffLang())}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={s("Дата и время производства")}><input className="field" type="datetime-local" value={produced} onChange={(e) => setProduced(e.target.value)} required /></Field>
          <Field label={s("Количество, шт.")}><input className="field" type="number" min={1} max={1000} value={qty} onChange={(e) => setQty(Number(e.target.value))} required /></Field>
        </div>
        <Field label={s("Номер партии (необязательно)")}><input className="field" value={lot} onChange={(e) => setLot(e.target.value)} /></Field>
        <Field label={s("Годен до (если отличается от правила товара)")}><input className="field" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
        {product && <p className="rounded-xl bg-brand-50 p-3 text-sm">{rich(s("Правило товара: продаётся **{0} дн.** с дня производства, затем автоматически снимается с продажи.", product.sell_days))}</p>}
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy || !productId}>{busy ? s("Сохраняем…") : s("Принять партию")}</button>
      </form>
    </Modal>
  );
}

export function RemoveModal({ batch, onClose, onDone }: { batch: StaffBatch; onClose: () => void; onDone: () => void }) {
  const free = batch.qty_on_hand - batch.qty_reserved;
  const [qty, setQty] = useState(free);
  const [kind, setKind] = useState<"withdraw" | "write_off">("withdraw");
  const [note, setNote] = useState(batchState(batch).expired ? s("Истёк срок реализации") : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await browserClient().rpc("remove_stock", { p_batch_id: batch.id, p_qty: qty, p_kind: kind, p_note: note || null });
    setBusy(false);
    if (error) setErr(staffError(error.message));
    else onDone();
  }

  return (
    <Modal title={`${batch.products?.name_ru} · ${sizeLabel(batch.products?.size_label, staffLang())}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="option" aria-pressed={kind === "withdraw"} onClick={() => setKind("withdraw")}>{s("Изъять (вернуть на ферму)")}</button>
          <button type="button" className="option" aria-pressed={kind === "write_off"} onClick={() => setKind("write_off")}>{s("Списать (утилизация)")}</button>
        </div>
        <Field label={s("Количество (можно до {0}; в резерве {1})", free, batch.qty_reserved)}>
          <input className="field" type="number" min={1} max={free} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
        </Field>
        <Field label={s("Комментарий")}><input className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy}>{s("Подтвердить")}</button>
      </form>
    </Modal>
  );
}
