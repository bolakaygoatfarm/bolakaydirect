"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { ErrorNote, Section } from "./ui";
import { s, rich } from "./i18n";

interface Status { bot_username: string | null; admin_chat_linked: boolean; admin_name?: string | null; site_url: string; linked_customers: number }

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-bot`;

const SETUP_ERRORS: Record<string, string> = {
  NO_TOKEN: "Токен бота не задан. Добавьте секрет TELEGRAM_BOT_TOKEN в Supabase → Edge Functions → Secrets (шаг 2 ниже).",
  BAD_TOKEN: "Telegram не принял токен. Проверьте, что скопировали его из @BotFather полностью.",
  WEBHOOK_FAILED: "Telegram не смог подключить webhook.",
  FORBIDDEN: "Подключать бота может только администратор.",
  UNAUTHORIZED: "Сессия истекла — войдите заново.",
};

export function TelegramSettings() {
  const sb = browserClient();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("admin_tg_status");
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
      else setOk(s("Бот @{0} подключён. Адрес сайта для ссылок: {1}", res.bot_username, window.location.origin));
    } catch {
      setErr(s("Не удалось связаться с функцией telegram-bot."));
    }
    setBusy(false);
    void load();
  }

  async function unbind() {
    if (!window.confirm(s("Отключить чат администратора? Заказы перестанут приходить в Telegram, пока кто-то из администраторов снова не войдёт в боте."))) return;
    setErr(null);
    const { error } = await sb.rpc("admin_tg_unbind");
    if (error) setErr(error.message);
    void load();
  }

  if (!st) return <Section title={s("Telegram-бот")}><p className="text-muted">{s("Загрузка…")}</p><ErrorNote text={err} /></Section>;

  const isLocal = /localhost|127\.0\.0\.1/.test(st.site_url);

  return (
    <Section title={s("Telegram-бот")}>
      <div className="card grid gap-4 p-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${st.bot_username ? "bg-fresh-50 text-fresh" : "bg-aged-50 text-aged"}`}>
            {st.bot_username ? s("Бот: @{0}", st.bot_username) : s("Бот не подключён")}
          </span>
          <span className={`chip ${st.admin_chat_linked ? "bg-fresh-50 text-fresh" : "bg-aged-50 text-aged"}`}>
            {st.admin_chat_linked
              ? st.admin_name ? s("Чат администратора: {0}", st.admin_name) : s("Чат администратора подключён")
              : s("Чат администратора не подключён")}
          </span>
          <span className="chip bg-brand-50 text-brand-700">{s("Покупателей в боте: {0}", st.linked_customers)}</span>
        </div>

        <ol className="grid list-decimal gap-2 pl-5">
          <li>{rich(s("В Telegram откройте **@BotFather** → `/newbot` → задайте имя (например, «BOLAKAY») и username (например, `bolakay_direct_bot`). Скопируйте токен."))}</li>
          <li>{rich(s("Supabase → проект **bolakay-direct** → **Edge Functions → Secrets** → добавьте секрет `TELEGRAM_BOT_TOKEN` со значением токена."))}</li>
          <li>
            {rich(s("Откройте эту панель на **боевом адресе сайта** и нажмите кнопку ниже: бот получит webhook, команды и ссылки на сайт."))}
            {isLocal && <span className="mt-1 block text-aged">{s("Сейчас адрес сайта — {0}. С localhost бот будет присылать ссылки текстом: Telegram не принимает кнопки на localhost.", st.site_url)}</span>}
          </li>
        </ol>
        <button className="btn btn-primary w-fit" onClick={connect} disabled={busy}>
          {busy ? s("Подключаем…") : st.bot_username ? s("Обновить подключение бота") : s("Подключить бота")}
        </button>

        {st.bot_username && (
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="font-bold">{s("Чат администратора")}</p>
            <p className="mt-1 text-muted">{s("Сюда приходят новые заказы и вопросы покупателей. Отвечайте на вопрос через Reply — ответ уйдёт покупателю.")}</p>
            <p className="mt-2 text-muted">{rich(s("Чтобы подключить свой личный чат, отправьте боту `/admin` и войдите: email, пароль и код из письма. Подключить чат может только администратор. Если его отключат в панели или сменят роль, чат отключится сам. Отключить вручную: команда `/logout` в боте или кнопка ниже."))}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a className="btn btn-primary w-fit" href={`https://t.me/${st.bot_username}?start=admin`} target="_blank" rel="noopener noreferrer">{s("Открыть бота и войти")}</a>
              {st.admin_chat_linked && <button className="btn btn-ghost w-fit" onClick={unbind}>{s("Отключить чат")}</button>}
            </div>
          </div>
        )}
        {ok && <p className="rounded-xl bg-fresh-50 p-3 font-bold text-fresh">{ok}</p>}
        <ErrorNote text={err} />
      </div>
    </Section>
  );
}
