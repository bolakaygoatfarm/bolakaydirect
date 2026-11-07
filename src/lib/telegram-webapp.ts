/**
 * Сайт внутри Telegram Web App. Telegram передаёт подпись пользователя в адресе (#tgWebAppData=…).
 * Скрипт telegram-web-app.js не подключаем: нужны всего два сообщения приложению, а лишний внешний файл замедлил бы сайт.
 */
const KEY = "tg-init-data";

type TgWindow = Window & { TelegramWebviewProxy?: { postEvent: (type: string, data: string) => void } };

function postEvent(type: string) {
  const w = window as TgWindow;
  if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent(type, "");
  else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: "" }), "https://web.telegram.org");
}

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // хранилище может быть запрещено настройками браузера
  }
}

export function initTelegramWebApp() {
  const hash = window.location.hash.slice(1);
  if (!hash.includes("tgWebAppData=")) return;
  const initData = new URLSearchParams(hash).get("tgWebAppData");
  if (initData) storage()?.setItem(KEY, initData);
  postEvent("web_app_ready");
  postEvent("web_app_expand");
  // Подпись не должна оставаться в адресе: страницей заказа можно поделиться
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
}

/** Подпись Telegram для этой вкладки или null вне Telegram */
export function webAppInitData(): string | null {
  return typeof window === "undefined" ? null : storage()?.getItem(KEY) ?? null;
}

export function closeWebApp() {
  postEvent("web_app_close");
}

/** Заказ с сайта появится в «Моих заказах» бота, и туда придут уведомления. Вне Telegram ничего не делает */
export async function linkOrderToBot(token: string) {
  const initData = typeof window === "undefined" ? null : storage()?.getItem(KEY);
  if (!initData) return;
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-shop/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, init_data: initData }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // заказ уже создан: без привязки покупатель всё равно видит его и код на странице заказа
  }
}
