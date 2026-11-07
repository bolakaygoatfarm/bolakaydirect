"use client";

import { useEffect } from "react";

/** Адрес панели на этом устройстве. Его записывает сама панель, потому что он может быть секретным */
export const STAFF_PATH_KEY = "bolakay-staff-path";

/**
 * Ссылки из писем Supabase (смена пароля) возвращают на адрес вида …#access_token=…&type=recovery.
 * Если в Supabase не разрешён адрес панели, письмо ведёт на главную (Site URL) — и там ничего не происходит.
 * Этот компонент на любой странице сайта замечает такую ссылку и переносит её в панель,
 * где открывается экран «Новый пароль» (или сообщение, что ссылка устарела).
 * Секретный адрес панели сайт не знает: берём тот, что запомнила панель на этом устройстве.
 */
export function AuthLinkForwarder() {
  useEffect(() => {
    const h = window.location.hash;
    const isRecovery = /type=recovery/.test(h);
    const isAuthError = /error_code=|error=access_denied/.test(h);
    if (!isRecovery && !isAuthError) return;
    let path = "/staff";
    try {
      const saved = localStorage.getItem(STAFF_PATH_KEY);
      if (saved && /^\/[A-Za-z0-9_-]+$/.test(saved)) path = saved;
    } catch { /* ignore */ }
    window.location.replace(`${path}${h}`);
  }, []);
  return null;
}
