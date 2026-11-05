"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { ErrorNote, Section } from "./ui";

interface Status { bot_username: string | null; admin_chat_linked: boolean; site_url: string; linked_customers: number }

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
  const [code, setCode] = useState<string | null>(null);

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
    const { data: s } = await sb.auth.getSession();
    try {
      const r = await fetch(`${FUNCTION_URL}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ site_url: window.location.origin }),
      });
      const res = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      if (!res.ok) setErr(SETUP_ERRORS[res.error] ?? `${res.error ?? "Ошибка"}${res.detail ? `: ${res.detail}` : ""}`);
      else setOk(`Бот @${res.bot_username} подключён. Адрес сайта для ссылок: ${window.location.origin}`);
    } catch {
      setErr("Не удалось связаться с функцией telegram-bot.");
    }
    setBusy(false);
    void load();
  }

  async function bindCode() {
    setErr(null);
    const { data, error } = await sb.rpc("admin_tg_bind_code");
    if (error) setErr(error.message);
    else setCode(data as string);
  }

  if (!st) return <Section title="Telegram-бот"><p className="text-muted">Загрузка…</p><ErrorNote text={err} /></Section>;

  const isLocal = /localhost|127\.0\.0\.1/.test(st.site_url);

  return (
    <Section title="Telegram-бот">
      <div className="card grid gap-4 p-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${st.bot_username ? "bg-fresh-50 text-fresh" : "bg-aged-50 text-aged"}`}>
            {st.bot_username ? `Бот: @${st.bot_username}` : "Бот не подключён"}
          </span>
          <span className={`chip ${st.admin_chat_linked ? "bg-fresh-50 text-fresh" : "bg-aged-50 text-aged"}`}>
            {st.admin_chat_linked ? "Чат администратора подключён" : "Чат администратора не подключён"}
          </span>
          <span className="chip bg-brand-50 text-brand-700">Покупателей в боте: {st.linked_customers}</span>
        </div>

        <ol className="grid list-decimal gap-2 pl-5">
          <li>В Telegram откройте <b>@BotFather</b> → <code>/newbot</code> → задайте имя (например, «BOLAKAY») и username (например, <code>bolakay_direct_bot</code>). Скопируйте токен.</li>
          <li>
            Supabase → проект <b>bolakay-direct</b> → <b>Edge Functions → Secrets</b> → добавьте секрет <code>TELEGRAM_BOT_TOKEN</code> со значением токена.
          </li>
          <li>
            Откройте эту панель на <b>боевом адресе сайта</b> и нажмите кнопку ниже: бот получит webhook, команды и ссылки на сайт.
            {isLocal && <span className="mt-1 block text-aged">Сейчас адрес сайта — {st.site_url}. С localhost бот будет присылать ссылки текстом: Telegram не принимает кнопки на localhost.</span>}
          </li>
        </ol>
        <button className="btn btn-primary w-fit" onClick={connect} disabled={busy}>
          {busy ? "Подключаем…" : st.bot_username ? "Обновить подключение бота" : "Подключить бота"}
        </button>

        {st.bot_username && (
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="font-bold">Чат администратора</p>
            <p className="mt-1 text-muted">Сюда приходят новые заказы и вопросы покупателей. Отвечайте на вопрос через Reply — ответ уйдёт покупателю. Можно подключить личный чат или группу сотрудников.</p>
            {code ? (
              <div className="mt-2 grid gap-2">
                <a className="btn btn-primary w-fit" href={`https://t.me/${st.bot_username}?start=admin_${code}`} target="_blank" rel="noopener noreferrer">Подключить личный чат</a>
                <a className="btn btn-soft w-fit" href={`https://t.me/${st.bot_username}?startgroup=admin_${code}`} target="_blank" rel="noopener noreferrer">Добавить бота в группу</a>
                <p className="text-xs text-muted">Или отправьте боту команду <code>/admin {code}</code>. Код действует 15 минут.</p>
              </div>
            ) : (
              <button className="btn btn-soft mt-2" onClick={bindCode}>Получить код подключения</button>
            )}
          </div>
        )}
        {ok && <p className="rounded-xl bg-fresh-50 p-3 font-bold text-fresh">{ok}</p>}
        <ErrorNote text={err} />
      </div>
    </Section>
  );
}
