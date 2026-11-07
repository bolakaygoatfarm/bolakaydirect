"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, useSyncExternalStore } from "react";
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
import { STAFF_LANG_KEY, STAFF_LANGS, s, setStaffLang, type StaffLang } from "./i18n";
import { ThemeToggle } from "../ThemeToggle";
import { EmailCodeScreen, useStaffCode } from "./EmailCodeScreen";
import { STAFF_PATH_KEY } from "../AuthLinkForwarder";

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
  // Язык панели: сохранённый выбор → иначе русский. Ставим до отрисовки вкладок.
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "ru" as StaffLang);
  setStaffLang(lang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const changeLang = (l: StaffLang) => {
    try { localStorage.setItem(STAFF_LANG_KEY, l); } catch { /* ignore */ }
    langListeners.forEach((f) => f());
  };

  useEffect(() => {
    // Адрес панели запоминается на устройстве: по нему ссылка из письма о смене пароля найдёт панель
    try { localStorage.setItem(STAFF_PATH_KEY, window.location.pathname); } catch { /* ignore */ }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((event, sess) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(sess);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);
  const recovery = useRecovery();
  const { code, pass } = useStaffCode(session);
  const codeVerified = !!code?.verified;

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      const [m, f] = await Promise.all([
        sb.from("staff").select("user_id,full_name,role,is_active").eq("user_id", session.user.id).maybeSingle(),
        sb.from("fridges").select("*").order("sort").order("code"),
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
    // После кода данные загружаются заново: до него база отдаёт только публичное
  }, [session, sb, codeVerified]);

  const reloadFridges = async () => {
    const { data } = await sb.from("fridges").select("*").order("sort").order("code");
    setFridges((data ?? []) as Fridge[]);
  };

  if (session === undefined) return <Center>{s("Загрузка…")}</Center>;
  // Пришли по ссылке из письма — сначала новый пароль, потом панель
  if (session && recovery) return <NewPassword lang={lang} onLang={changeLang} onDone={() => setRecovery(false)} />;
  if (!session) return <Login lang={lang} onLang={changeLang} />;
  if (me === undefined) return <Center>{s("Загрузка…")}</Center>;
  if (me === null)
    return (
      <Center>
        <p className="font-bold">{s("У аккаунта {0} нет доступа к панели.", session.user.email ?? "")}</p>
        <p className="mt-2 text-sm text-muted">{s("Попросите администратора добавить вас в сотрудники.")}</p>
        <button className="btn btn-ghost mt-5" onClick={() => sb.auth.signOut()}>{s("Выйти")}</button>
      </Center>
    );
  if (code === undefined) return <Center>{s("Загрузка…")}</Center>;
  if (code.failed)
    return (
      <Center>
        <p className="font-bold">{s("Не удалось проверить вход. Проверьте интернет и попробуйте снова.")}</p>
        <button className="btn btn-primary mt-5" onClick={() => window.location.reload()}>{s("Попробовать ещё раз")}</button>
        <button className="btn btn-ghost mt-2" onClick={() => sb.auth.signOut()}>{s("Выйти")}</button>
      </Center>
    );
  // Панель открывается только после кода из письма
  if (!code.verified)
    return <AuthShell lang={lang} onLang={changeLang}><EmailCodeScreen email={session.user.email ?? ""} onDone={pass} /></AuthShell>;

  const tabs = TABS.filter((t) => (t.roles as readonly string[]).includes(me.role));
  const fridge = fridges.find((f) => f.id === fridgeId) ?? null;
  const needsFridge = ["orders", "stock", "temp"].includes(tab);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Logo sub={s("Персонал")} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="hidden font-bold sm:inline">{me.full_name}</span>
          <span className="chip bg-brand-50 text-brand-700">{s({ admin: "Админ", operator: "Оператор", courier: "Курьер" }[me.role])}</span>
          <StaffLangSwitch lang={lang} onChange={changeLang} />
          <ThemeToggle labels={{ light: s("Светлая тема"), dark: s("Тёмная тема") }} />
          <button className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => sb.auth.signOut()}>{s("Выйти")}</button>
        </div>
      </header>

      {code.skipped && me.role === "admin" && (
        <p className="mb-3 rounded-xl bg-aged-50 p-3 text-sm font-bold text-aged">{s("Код на почту ещё не включён: вход защищён только паролем. Добавьте секреты BREVO_API_KEY и BREVO_SENDER_EMAIL в Supabase.")}</p>
      )}

      <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`chip shrink-0 px-4 py-2.5 text-sm ${tab === t.id ? "bg-night text-white" : "bg-white text-ink ring-1 ring-line"}`}>
            {s(t.label)}
          </button>
        ))}
      </nav>

      {needsFridge && (
        <div className="mt-4 max-w-sm">
          <Field label={s("Точка")}>
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
        <p className="mt-6 text-muted">{s("Нет точек. Администратор может добавить их во вкладке «Точки и QR».")}</p>
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

const langListeners = new Set<() => void>();
function subscribeLang(cb: () => void) { langListeners.add(cb); return () => { langListeners.delete(cb); }; }
function readLang(): StaffLang {
  try { const v = localStorage.getItem(STAFF_LANG_KEY); if (v === "uz" || v === "ru" || v === "en") return v; } catch { /* ignore */ }
  return "ru";
}

function StaffLangSwitch({ lang, onChange }: { lang: StaffLang; onChange: (l: StaffLang) => void }) {
  return (
    <div className="flex rounded-full bg-brand-50 p-1 text-xs font-extrabold" role="group" aria-label={s("Язык")}>
      {STAFF_LANGS.map((l) => (
        <button key={l} type="button" onClick={() => onChange(l)} aria-pressed={l === lang} className={`rounded-full px-2.5 py-1 uppercase transition ${l === lang ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}>
          {{ uz: "O‘z", ru: "Ру", en: "En" }[l]}
        </button>
      ))}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">{children}</div>;
}

/** Обёртка экранов без панели: логотип + язык + тема */
function AuthShell({ lang, onLang, children }: { lang: StaffLang; onLang: (l: StaffLang) => void; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="flex items-center justify-between gap-3">
        <Logo sub={s("Персонал")} />
        <span className="flex items-center gap-1"><StaffLangSwitch lang={lang} onChange={onLang} /><ThemeToggle labels={{ light: s("Светлая тема"), dark: s("Тёмная тема") }} /></span>
      </div>
      {children}
    </div>
  );
}

/** Понятный текст для ошибок Supabase Auth */
function authError(e: { message: string; status?: number; code?: string }) {
  if (e.message === "Invalid login credentials") return s("Неверный email или пароль");
  if (e.status === 429 || /rate limit|security purposes/i.test(e.message)) return s("Слишком много попыток. Подождите несколько минут и попробуйте снова.");
  if (e.code === "same_password" || /different from the old/i.test(e.message)) return s("Новый пароль должен отличаться от старого.");
  if (e.code === "weak_password" || /password should be/i.test(e.message)) return s("Пароль слишком простой. Используйте не меньше 8 символов.");
  return e.message;
}

function Login({ lang, onLang }: { lang: StaffLang; onLang: (l: StaffLang) => void }) {
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(recoveryError());
  // Убираем из адреса служебный хвост #error=… после того, как показали сообщение
  useEffect(() => {
    if (/error=/.test(window.location.hash)) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(authError(error));
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    // Ссылка из письма вернёт на эту же страницу; там откроется экран «Новый пароль»
    // Ссылка из письма вернёт на тот же адрес панели, по которому сотрудник её открыл (он может быть секретным)
    const { error } = await browserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${window.location.pathname}` });
    setBusy(false);
    // Не сообщаем, есть ли такой аккаунт — одинаковый ответ для любого адреса
    if (error && (error.status === 429 || /rate limit|security purposes/i.test(error.message))) return setErr(authError(error));
    setMode("sent");
  }

  if (mode === "sent")
    return (
      <AuthShell lang={lang} onLang={onLang}>
        <div className="card mt-6 grid gap-3 p-5">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-fresh-50 text-fresh">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </span>
          <h1 className="font-display text-xl font-bold">{s("Проверьте почту")}</h1>
          <p className="text-sm text-muted">{s("Если аккаунт с адресом {0} существует, мы отправили на него письмо со ссылкой для смены пароля. Ссылка действует 1 час.", email.trim())}</p>
          <p className="text-sm text-muted">{s("Письма нет? Проверьте папку «Спам» или запросите ещё раз через минуту.")}</p>
          <button className="btn btn-ghost" onClick={() => { setMode("login"); setErr(null); }}>{s("← Ко входу")}</button>
        </div>
      </AuthShell>
    );

  if (mode === "forgot")
    return (
      <AuthShell lang={lang} onLang={onLang}>
        <form onSubmit={sendReset} className="card mt-6 grid gap-4 p-5">
          <h1 className="font-display text-xl font-bold">{s("Восстановление пароля")}</h1>
          <p className="text-sm text-muted">{s("Введите email вашего аккаунта — пришлём ссылку для смены пароля.")}</p>
          <Field label="Email"><input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <ErrorNote text={err} />
          <button className="btn btn-primary" disabled={busy}>{busy ? s("Отправляем…") : s("Отправить ссылку")}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode("login"); setErr(null); }}>{s("← Ко входу")}</button>
        </form>
      </AuthShell>
    );

  return (
    <AuthShell lang={lang} onLang={onLang}>
      <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
        <h1 className="font-display text-xl font-bold">{s("Вход для сотрудников")}</h1>
        <Field label="Email"><input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label={s("Пароль")}><input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy}>{busy ? s("Входим…") : s("Войти")}</button>
        <button type="button" className="text-sm font-bold text-brand-700 hover:underline" onClick={() => { setMode("forgot"); setErr(null); }}>
          {s("Забыли пароль?")}
        </button>
      </form>
    </AuthShell>
  );
}

/** Экран после перехода по ссылке из письма: задать новый пароль */
function NewPassword({ lang, onLang, onDone }: { lang: StaffLang; onLang: (l: StaffLang) => void; onDone: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 8) return setErr(s("Пароль слишком простой. Используйте не меньше 8 символов."));
    if (p1 !== p2) return setErr(s("Пароли не совпадают."));
    setBusy(true);
    setErr(null);
    const { error } = await browserClient().auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return setErr(authError(error));
    setOk(true);
  }

  return (
    <AuthShell lang={lang} onLang={onLang}>
      {ok ? (
        <div className="card mt-6 grid gap-3 p-5">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-fresh-50 text-fresh">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path className="draw-check" d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </span>
          <h1 className="font-display text-xl font-bold">{s("Пароль изменён")}</h1>
          <p className="text-sm text-muted">{s("Теперь входите с новым паролем.")}</p>
          <button className="btn btn-primary" onClick={onDone}>{s("Перейти в панель")}</button>
        </div>
      ) : (
        <form onSubmit={save} className="card mt-6 grid gap-4 p-5">
          <h1 className="font-display text-xl font-bold">{s("Новый пароль")}</h1>
          <Field label={s("Новый пароль (не меньше 8 символов)")}>
            <input className="field" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} value={p1} onChange={(e) => setP1(e.target.value)} required autoFocus />
          </Field>
          <Field label={s("Повторите пароль")}>
            <input className="field" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} value={p2} onChange={(e) => setP2(e.target.value)} required />
          </Field>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={show} onChange={(e) => setShow(e.target.checked)} />
            {s("Показать пароль")}
          </label>
          <ErrorNote text={err} />
          <button className="btn btn-primary" disabled={busy}>{busy ? s("Сохраняем…") : s("Сохранить пароль")}</button>
        </form>
      )}
    </AuthShell>
  );
}

/* ---------- Состояние «пришли по ссылке восстановления» ----------
   Supabase кладёт в адрес #access_token=…&type=recovery (или #error=…, если ссылка просрочена).
   Читаем это при загрузке модуля — до того, как клиент Supabase очистит адрес. */
const INITIAL_HASH = typeof window !== "undefined" ? window.location.hash : "";
let recoveryMode = /type=recovery/.test(INITIAL_HASH);
const recoveryListeners = new Set<() => void>();
export function setRecovery(v: boolean) {
  recoveryMode = v;
  recoveryListeners.forEach((f) => f());
}
function subscribeRecovery(cb: () => void) { recoveryListeners.add(cb); return () => { recoveryListeners.delete(cb); }; }
function useRecovery() {
  return useSyncExternalStore(subscribeRecovery, () => recoveryMode, () => false);
}
/** Ошибка из ссылки (просрочена / уже использована) — показываем на экране входа */
function recoveryError(): string | null {
  if (!/error=/.test(INITIAL_HASH)) return null;
  return /otp_expired|expired/i.test(INITIAL_HASH)
    ? s("Ссылка для смены пароля устарела или уже использована. Запросите новую.")
    : s("Не удалось открыть ссылку из письма. Запросите новую.");
}
