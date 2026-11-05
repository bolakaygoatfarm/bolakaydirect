"use client";

import { useEffect } from "react";

/**
 * Ссылки из писем Supabase (смена пароля) возвращают на адрес вида …#access_token=…&type=recovery.
 * Если в Supabase не разрешён адрес /staff, письмо ведёт на главную (Site URL) — и там ничего не происходит.
 * Этот компонент на любой странице сайта замечает такую ссылку и переносит её в панель /staff,
 * где открывается экран «Новый пароль» (или сообщение, что ссылка устарела).
 */
export function AuthLinkForwarder() {
  useEffect(() => {
    const h = window.location.hash;
    const isRecovery = /type=recovery/.test(h);
    const isAuthError = /error_code=|error=access_denied/.test(h);
    if (isRecovery || isAuthError) window.location.replace(`/staff${h}`);
  }, []);
  return null;
}
