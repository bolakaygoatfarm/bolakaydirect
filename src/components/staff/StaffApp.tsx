"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Fridge } from "@/lib/types";
import { Logo } from "../Logo";
import { ErrorNote, Field } from "./ui";
import { OrdersTab } from "./OrdersTab";
import { StockTab } from "./StockTab";
import { DeliveryTab } from "./DeliveryTab";
import { TempTab } from "./TempTab";
import { ProductsTab } from "./ProductsTab";
import { FridgesTab } from "./FridgesTab";
import { ReportsTab } from "./ReportsTab";
import { SettingsTab } from "./SettingsTab";

export interface Me { user_id: string; full_name: string; role: "admin" | "operator" | "courier" }

const TABS = [
  { id: "orders", label: "Выдача", roles: ["admin", "operator", "courier"] },
  { id: "stock", label: "Остатки", roles: ["admin", "operator", "courier"] },
  { id: "delivery", label: "Маршрут", roles: ["admin", "operator", "courier"] },
  { id: "temp", label: "Температура", roles: ["admin", "operator", "courier"] },
  { id: "products", label: "Товары", roles: ["admin"] },
  { id: "fridges", label: "Точки и QR", roles: ["admin"] },
  { id: "reports", label: "Отчёты", roles: ["admin"] },
  { id: "settings", label: "Настройки", roles: ["admin"] },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function StaffApp() {
  const sb = browserClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [fridges, setFridges] = useState<Fridge[]>([]);
  const [fridgeId, setFridgeId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("orders");

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      const [m, f] = await Promise.all([
        sb.from("staff").select("user_id,full_name,role,is_active").eq("user_id", session.user.id).maybeSingle(),
        sb.from("fridges").select("*").order("code"),
      ]);
      if (!alive) return;
      setMe(m.data && m.data.is_active ? (m.data as Me) : null);
      const list = (f.data ?? []) as Fridge[];
      setFridges(list);
      let saved = "";
      try { saved = localStorage.getItem("bolakay-staff-fridge") || ""; } catch { /* ignore */ }
      setFridgeId(list.find((x) => x.id === saved)?.id ?? list[0]?.id ?? "");
    })();
    return () => { alive = false; };
  }, [session, sb]);

  const reloadFridges = async () => {
    const { data } = await sb.from("fridges").select("*").order("code");
    setFridges((data ?? []) as Fridge[]);
  };

  if (session === undefined) return <Center>Загрузка…</Center>;
  if (!session) return <Login />;
  if (me === undefined) return <Center>Загрузка…</Center>;
  if (me === null)
    return (
      <Center>
        <p className="font-bold">У аккаунта {session.user.email} нет доступа к панели.</p>
        <p className="mt-2 text-sm text-muted">Попросите администратора добавить вас в сотрудники.</p>
        <button className="btn btn-ghost mt-5" onClick={() => sb.auth.signOut()}>Выйти</button>
      </Center>
    );

  const tabs = TABS.filter((t) => (t.roles as readonly string[]).includes(me.role));
  const fridge = fridges.find((f) => f.id === fridgeId) ?? null;
  const needsFridge = ["orders", "stock", "temp"].includes(tab);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Logo sub="Персонал" />
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden font-bold sm:inline">{me.full_name}</span>
          <span className="chip bg-brand-50 text-brand-700">{{ admin: "Админ", operator: "Оператор", courier: "Курьер" }[me.role]}</span>
          <button className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => sb.auth.signOut()}>Выйти</button>
        </div>
      </header>

      <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`chip shrink-0 px-4 py-2.5 text-sm ${tab === t.id ? "bg-brand-900 text-white" : "bg-white text-ink ring-1 ring-line"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {needsFridge && (
        <div className="mt-4 max-w-sm">
          <Field label="Точка">
            <select
              className="field"
              value={fridgeId}
              onChange={(e) => {
                setFridgeId(e.target.value);
                try { localStorage.setItem("bolakay-staff-fridge", e.target.value); } catch { /* ignore */ }
              }}
            >
              {fridges.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
            </select>
          </Field>
        </div>
      )}

      {needsFridge && !fridge ? (
        <p className="mt-6 text-muted">Нет точек. Администратор может добавить их во вкладке «Точки и QR».</p>
      ) : (
        <>
          {tab === "orders" && fridge && <OrdersTab fridge={fridge} me={me} />}
          {tab === "stock" && fridge && <StockTab fridge={fridge} />}
          {tab === "delivery" && <DeliveryTab fridges={fridges} />}
          {tab === "temp" && fridge && <TempTab fridge={fridge} />}
          {tab === "products" && <ProductsTab />}
          {tab === "fridges" && <FridgesTab fridges={fridges} onChange={reloadFridges} />}
          {tab === "reports" && <ReportsTab fridges={fridges} />}
          {tab === "settings" && <SettingsTab me={me} />}
        </>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">{children}</div>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message === "Invalid login credentials" ? "Неверный email или пароль" : error.message);
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <Logo sub="Персонал" />
      <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
        <h1 className="font-display text-xl font-bold">Вход для сотрудников</h1>
        <Field label="Email"><input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Пароль"><input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
      </form>
    </div>
  );
}
