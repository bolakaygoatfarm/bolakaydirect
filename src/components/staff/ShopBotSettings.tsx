"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { ErrorNote, Section } from "./ui";
import { s, rich } from "./i18n";

interface Status { bot_username: string | null; site_url: string; users: number; orders: number }

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-shop`;

const SETUP_ERRORS: Record<string, string> = {
  NO_TOKEN: "Токен не задан. Добавьте секрет TELEGRAM_SHOP_BOT_TOKEN в Supabase → Edge Functions → Secrets (шаг 2 ниже).",
  BAD_TOKEN: "Telegram не принял токен. Проверьте, что скопировали его из @BotFather полностью.",
  SAME_TOKEN: "Это токен первого бота. Для бота заказов создайте в @BotFather отдельного бота.",
  WEBHOOK_FAILED: "Telegram не смог подключить webhook.",
  FORBIDDEN: "Подключать бота может только администратор.",
  UNAUTHORIZED: "Сессия истекла — войдите заново.",
};

/** Второй бот: заказы прямо в чате и кнопка Web App, открывающая сайт */
export function ShopBotSettings() {
  const sb = browserClient();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("admin_shop_status");
    if (error) setErr(error.message);
    else setSt(data as Status);
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    setErr(null);
    setOk(null);
    const { data: sess } = await sb.auth.getSession();
    try {
      const r = await fetch(`${FUNCTION_URL}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        body: JSON.stringify({ site_url: window.location.origin }),
      });
      const res = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      if (!res.ok) setErr(SETUP_ERRORS[res.error] ? s(SETUP_ERRORS[res.error]) : `${res.error ?? s("Ошибка")}${res.detail ? `: ${res.detail}` : ""}`);
      else setOk(s("Бот @{0} подключён. Кнопка Web App открывает: {1}", res.bot_username, res.site_url));
    } catch {
      setErr(s("Не удалось связаться с функцией telegram-shop."));
    }
    setBusy(false);
    void load();
  }

  if (!st) return <Section title={s("Бот для заказов")}><p className="text-muted">{s("Загрузка…")}</p><ErrorNote text={err} /></Section>;

  const webAppOff = !st.site_url.startsWith("https://");

  return (
    <Section title={s("Бот для заказов")}>
      <div className="card grid gap-4 p-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${st.bot_username ? "bg-fresh-50 text-fresh" : "bg-aged-50 text-aged"}`}>
            {st.bot_username ? s("Бот: @{0}", st.bot_username) : s("Бот не подключён")}
          </span>
          <span className="chip bg-brand-50 text-brand-700">{s("Покупателей: {0}", st.users)}</span>
          <span className="chip bg-brand-50 text-brand-700">{s("Заказов из бота: {0}", st.orders)}</span>
        </div>

        <ol className="grid list-decimal gap-2 pl-5">
          <li>{rich(s("В Telegram откройте **@BotFather** → `/newbot` → задайте имя и username нового бота. Скопируйте токен."))}</li>
          <li>{rich(s("Supabase → проект **bolakay-direct** → **Edge Functions → Secrets** → добавьте секрет `TELEGRAM_SHOP_BOT_TOKEN` со значением токена."))}</li>
          <li>
            {rich(s("Откройте эту панель на **боевом адресе сайта** и нажмите кнопку ниже: бот получит webhook, команды и кнопку Web App."))}
            {webAppOff && <span className="mt-1 block text-aged">{s("Сейчас адрес сайта — {0}. Кнопка Web App работает только с адресом https.", st.site_url)}</span>}
          </li>
        </ol>
        <button className="btn btn-primary w-fit" onClick={connect} disabled={busy}>
          {busy ? s("Подключаем…") : st.bot_username ? s("Обновить подключение бота") : s("Подключить бота")}
        </button>

        {st.bot_username && (
          <p className="text-muted">{rich(s("Ссылка на бота: **t.me/{0}**. Новые заказы и вопросы покупателей приходят в чат администратора первого бота, там же отвечайте через Reply.", st.bot_username))}</p>
        )}
        {ok && <p className="rounded-xl bg-fresh-50 p-3 font-bold text-fresh">{ok}</p>}
        <ErrorNote text={err} />
      </div>
    </Section>
  );
}
