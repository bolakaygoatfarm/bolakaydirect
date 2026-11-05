"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { browserClient, SITE_URL } from "@/lib/supabase";
import type { Fridge } from "@/lib/types";
import { ErrorNote, Field, Modal, Section } from "./ui";
import { s } from "./i18n";

const EMPTY: Partial<Fridge> = {
  code: "", name: "", address_ru: "", address_uz: "", address_en: "", landmark_ru: "", landmark_uz: "", landmark_en: "",
  lat: null, lng: null, open_time: "08:00", close_time: "21:00", status: "active",
};

export const pointUrl = (code: string) => `${SITE_URL.replace(/\/$/, "")}/point/${code}`;

export function FridgesTab({ fridges, onChange }: { fridges: Fridge[]; onChange: () => void }) {
  const [edit, setEdit] = useState<Partial<Fridge> | null>(null);
  const [qr, setQr] = useState<Fridge | null>(null);
  return (
    <Section title={s("Точки (холодильники)")} action={<button className="btn btn-primary min-h-10 text-sm" onClick={() => setEdit({ ...EMPTY })}>{s("+ Точка")}</button>}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {fridges.map((f) => (
          <li key={f.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-bold">{f.name}</p>
                <p className="text-xs text-muted">{pointUrl(f.code)}</p>
              </div>
              <span className={`chip ${f.status === "active" ? "bg-fresh-50 text-fresh" : f.status === "maintenance" ? "bg-aged-50 text-aged" : "bg-danger-50 text-danger"}`}>
                {s({ active: "Работает", maintenance: "Обслуживание", inactive: "Отключена" }[f.status])}
              </span>
            </div>
            <p className="mt-2 text-sm">{f.address_ru}</p>
            <p className="text-sm text-muted">{f.open_time.slice(0, 5)}–{f.close_time.slice(0, 5)}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-soft min-h-9 flex-1 text-xs" onClick={() => setQr(f)}>{s("QR-код")}</button>
              <button className="btn btn-ghost min-h-9 flex-1 text-xs" onClick={() => setEdit(f)}>{s("Изменить")}</button>
            </div>
          </li>
        ))}
      </ul>
      {edit && <FridgeForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChange(); }} />}
      {qr && <QrModal fridge={qr} onClose={() => setQr(null)} />}
    </Section>
  );
}

function QrModal({ fridge, onClose }: { fridge: Fridge; onClose: () => void }) {
  const [src, setSrc] = useState("");
  const url = pointUrl(fridge.code);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "H", color: { dark: "#0c2f52", light: "#ffffff" } }).then(setSrc);
  }, [url]);
  return (
    <Modal title={s("QR-код · {0}", fridge.name)} onClose={onClose}>
      <div className="grid gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={`QR ${url}`} className="mx-auto w-64 rounded-xl ring-1 ring-line" />}
        <p className="break-all text-sm font-bold">{url}</p>
        <p className="text-xs text-muted">{s("Ссылка постоянная: при смене адреса сайта или товаров QR перепечатывать не нужно — только если меняется домен.")}</p>
        {src && <a className="btn btn-primary" href={src} download={`bolakay-qr-${fridge.code}.png`}>{s("Скачать PNG для печати")}</a>}
      </div>
    </Modal>
  );
}

function FridgeForm({ initial, onClose, onSaved }: { initial: Partial<Fridge>; onClose: () => void; onSaved: () => void }) {
  const sb = browserClient();
  const [f, setF] = useState<Partial<Fridge>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Fridge>(k: K, v: Fridge[K]) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Fridge) => ({ className: "field", value: (f[k] as string | null) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { id, ...rest } = f as Fridge & { created_at?: string };
    delete (rest as { created_at?: string }).created_at;
    const payload = { ...rest, code: (rest.code || "").trim().toLowerCase(), lat: rest.lat ? Number(rest.lat) : null, lng: rest.lng ? Number(rest.lng) : null };
    const res = id ? await sb.from("fridges").update(payload).eq("id", id) : await sb.from("fridges").insert(payload);
    setBusy(false);
    if (res.error) setErr(res.error.code === "23505" ? s("Такой код точки уже есть") : res.error.message);
    else onSaved();
  }

  return (
    <Modal title={f.id ? s("Изменить точку") : s("Новая точка")} onClose={onClose}>
      <form onSubmit={save} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={s("Код (в QR-ссылке)")}><input {...txt("code")} pattern="[a-z0-9-]+" placeholder="chilonzor-01" required disabled={!!f.id} /></Field>
          <Field label={s("Название")}><input {...txt("name")} required /></Field>
        </div>
        <Field label={s("Адрес (UZ)")}><input {...txt("address_uz")} /></Field>
        <Field label={s("Адрес (RU)")}><input {...txt("address_ru")} /></Field>
        <Field label={s("Адрес (EN)")}><input {...txt("address_en")} /></Field>
        <Field label={s("Ориентир (UZ)")}><input {...txt("landmark_uz")} /></Field>
        <Field label={s("Ориентир (RU)")}><input {...txt("landmark_ru")} /></Field>
        <Field label={s("Ориентир (EN)")}><input {...txt("landmark_en")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={s("Широта")}><input className="field" inputMode="decimal" value={f.lat ?? ""} onChange={(e) => set("lat", (e.target.value as unknown) as number)} /></Field>
          <Field label={s("Долгота")}><input className="field" inputMode="decimal" value={f.lng ?? ""} onChange={(e) => set("lng", (e.target.value as unknown) as number)} /></Field>
          <Field label={s("Открытие")}><input className="field" type="time" value={f.open_time?.slice(0, 5)} onChange={(e) => set("open_time", e.target.value)} required /></Field>
          <Field label={s("Закрытие")}><input className="field" type="time" value={f.close_time?.slice(0, 5)} onChange={(e) => set("close_time", e.target.value)} required /></Field>
        </div>
        <Field label={s("Статус")}>
          <select className="field" value={f.status} onChange={(e) => set("status", e.target.value as Fridge["status"])}>
            <option value="active">{s("Работает — принимает заказы")}</option>
            <option value="maintenance">{s("Обслуживание — витрина видна, заказы закрыты")}</option>
            <option value="inactive">{s("Отключена — скрыта")}</option>
          </select>
        </Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy}>{busy ? s("Сохраняем…") : s("Сохранить")}</button>
      </form>
    </Modal>
  );
}
