"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Me } from "./StaffApp";
import { ErrorNote, Field, Section, staffError } from "./ui";
import { TelegramSettings } from "./TelegramSettings";
import { ShopBotSettings } from "./ShopBotSettings";
import { PaymentSettings } from "./PaymentSettings";
import { s } from "./i18n";

interface S { payment_hold_minutes: number; pickup_grace_minutes: number; support_phone: string | null; click_enabled: boolean; payme_enabled: boolean }
interface StaffRow { user_id: string; email: string; full_name: string; role: Me["role"]; is_active: boolean }

const ROLE_RU = { admin: "Администратор", operator: "Оператор точки", courier: "Курьер / работник фермы" };

export function SettingsTab({ me }: { me: Me }) {
  const sb = browserClient();
  const [st, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [nf, setNf] = useState({ email: "", full_name: "", role: "operator" as Me["role"] });

  const loadStaff = useCallback(async () => {
    const { data } = await sb.rpc("admin_list_staff");
    setStaff((data ?? []) as StaffRow[]);
  }, [sb]);

  useEffect(() => {
    sb.from("settings").select("*").eq("id", 1).single().then(({ data }) => setS(data as S));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStaff();
  }, [sb, loadStaff]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!st) return;
    setErr(null);
    const { error } = await sb.from("settings").update({
      payment_hold_minutes: Number(st.payment_hold_minutes),
      pickup_grace_minutes: Number(st.pickup_grace_minutes),
      support_phone: st.support_phone || null,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) setErr(error.message);
    else setMsg(s("Сохранено"));
  }

  async function upsert(email: string, full_name: string, role: Me["role"], active: boolean) {
    setErr(null);
    const { error } = await sb.rpc("admin_upsert_staff", { p_email: email, p_full_name: full_name, p_role: role, p_active: active });
    if (error) return setErr(staffError(error.message));
    setNf({ email: "", full_name: "", role: "operator" });
    void loadStaff();
  }

  if (!st) return <p className="mt-5 text-muted">{s("Загрузка…")}</p>;

  return (
    <>
      <Section title={s("Параметры заказов")}>
        <form onSubmit={save} className="card grid gap-4 p-4 sm:grid-cols-2">
          <Field label={s("Резерв до онлайн-оплаты, мин")}><input className="field" type="number" min={3} max={60} value={st.payment_hold_minutes} onChange={(e) => setS({ ...st, payment_hold_minutes: Number(e.target.value) })} /></Field>
          <Field label={s("Ожидание после интервала выдачи, мин")}><input className="field" type="number" min={0} max={600} value={st.pickup_grace_minutes} onChange={(e) => setS({ ...st, pickup_grace_minutes: Number(e.target.value) })} /></Field>
          <Field label={s("Телефон поддержки")}><input className="field" value={st.support_phone ?? ""} onChange={(e) => setS({ ...st, support_phone: e.target.value })} /></Field>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button className="btn btn-primary">{s("Сохранить")}</button>
            {msg && <span className="text-sm font-bold text-fresh">{msg}</span>}
          </div>
        </form>
      </Section>

      <PaymentSettings flags={{ click_enabled: st.click_enabled, payme_enabled: st.payme_enabled }} onChange={(f) => setS({ ...st, ...f })} />
      <TelegramSettings />
      <ShopBotSettings />

      <Section title={s("Сотрудники")}>
        <ul className="grid gap-2">
          {staff.map((r) => (
            <li key={r.user_id} className={`card flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${r.is_active ? "" : "opacity-60"}`}>
              <span><b>{r.full_name}</b> <span className="text-muted">· {r.email}</span></span>
              <span className="flex items-center gap-2">
                <select className="field min-h-9 w-auto py-1 text-sm" value={r.role} disabled={r.user_id === me.user_id} onChange={(e) => upsert(r.email, r.full_name, e.target.value as Me["role"], r.is_active)}>
                  {Object.entries(ROLE_RU).map(([k, v]) => <option key={k} value={k}>{s(v)}</option>)}
                </select>
                {r.user_id !== me.user_id && (
                  <button className={`btn min-h-9 px-3 text-xs ${r.is_active ? "btn-danger" : "btn-soft"}`} onClick={() => upsert(r.email, r.full_name, r.role, !r.is_active)}>
                    {r.is_active ? s("Отключить") : s("Включить")}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); void upsert(nf.email, nf.full_name, nf.role, true); }} className="card mt-3 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end">
          <Field label={s("Email сотрудника")}><input className="field" type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} required /></Field>
          <Field label={s("Имя")}><input className="field" value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} required /></Field>
          <Field label={s("Роль")}>
            <select className="field" value={nf.role} onChange={(e) => setNf({ ...nf, role: e.target.value as Me["role"] })}>
              {Object.entries(ROLE_RU).map(([k, v]) => <option key={k} value={k}>{s(v)}</option>)}
            </select>
          </Field>
          <button className="btn btn-primary">{s("Добавить")}</button>
          <p className="text-xs text-muted sm:col-span-4">{s("Сначала создайте пользователя в Supabase → Authentication → Users → Add user (email + пароль), затем добавьте его здесь.")}</p>
        </form>
        <div className="mt-3"><ErrorNote text={err} /></div>
      </Section>
    </>
  );
}
