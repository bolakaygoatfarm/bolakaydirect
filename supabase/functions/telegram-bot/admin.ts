// Чат администратора: тексты и кнопки списка заказов и уведомлений об отмене. Без обращений к сети, поэтому проверяется тестами.

export type AdminButton = { text: string; callback_data: string };

export const ORDERS_BTN = "📋 Все заказы";
export const ADMIN_KEYBOARD = { keyboard: [[{ text: ORDERS_BTN }]], resize_keyboard: true };
export const OPEN_LIST: AdminButton[][] = [[{ text: ORDERS_BTN, callback_data: "adm:l:all:0" }]];

const PAGE_SIZE = 8;
const STATUS: Record<string, string> = {
  pending_payment: "💳 Ждёт оплаты", confirmed: "🟢 Резерв", issued: "✅ Выдан", cancelled: "❌ Отменён", expired: "⌛ Истёк",
};
const FILTERS: [string, string][] = [["all", "Все"], ["active", "Резерв"], ["pending", "Ждут оплаты"], ["issued", "Выданы"], ["cancelled", "Отменены"]];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (v: number) => `${new Intl.NumberFormat("ru-RU").format(v).replace(/\s/g, " ")} сум`;
const day = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const slot = (s: string) => s.replace("-", "–");

export const isFilter = (f: string) => FILTERS.some(([k]) => k === f);

function reasonText(r: unknown) {
  if (r === "customer") return "отменил покупатель";
  if (r === "reservation timeout") return "истёк срок резерва";
  if (r === "payme refund") return "возврат в кабинете Payme";
  return esc(r);
}

/** Строка оплаты: нужна там, где от неё зависит, что делать дальше */
function payText(method: string, status: string) {
  if (status === "paid") return "оплачен";
  if (status === "refunded") return "возврат";
  return method === "on_pickup" ? "при получении" : "не оплачен";
}

export interface AdminListData {
  orders: { number: number; status: string; payment_method: string; payment_status: string; total: number; pickup_date: string; pickup_slot: string; phone: string }[];
  total: number;
  counts: Record<string, number>;
}

export function listView(data: AdminListData, filter: string, page: number) {
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const title = FILTERS.find(([k]) => k === filter)?.[1] ?? "Все";
  const lines = [`📋 <b>Заказы · ${title}</b> (${data.total})${pages > 1 ? ` · стр. ${page + 1} из ${pages}` : ""}`];
  if (!data.orders.length) lines.push("", "Заказов нет.");
  for (const o of data.orders) {
    lines.push("", `<b>№ ${o.number}</b> · ${STATUS[o.status] ?? esc(o.status)}`, `${money(o.total)} · ${payText(o.payment_method, o.payment_status)}`, `${day(o.pickup_date)}, ${slot(o.pickup_slot)} · ${esc(o.phone)}`);
  }

  const rows: AdminButton[][] = [];
  const tabs = FILTERS.map(([k, label]): AdminButton => ({
    text: `${k === filter ? "● " : ""}${label} ${data.counts[k] ?? 0}`,
    callback_data: `adm:l:${k}:0`,
  }));
  rows.push(tabs.slice(0, 2), tabs.slice(2));
  // Кнопки с номерами открывают карточку заказа
  const nums = data.orders.map((o): AdminButton => ({ text: `№ ${o.number}`, callback_data: `adm:o:${o.number}:${filter}:${page}` }));
  for (let i = 0; i < nums.length; i += 4) rows.push(nums.slice(i, i + 4));
  const nav: AdminButton[] = [];
  if (page > 0) nav.push({ text: "← Назад", callback_data: `adm:l:${filter}:${page - 1}` });
  nav.push({ text: "🔄 Обновить", callback_data: `adm:l:${filter}:${page}` });
  if (page + 1 < pages) nav.push({ text: "Вперёд →", callback_data: `adm:l:${filter}:${page + 1}` });
  rows.push(nav);
  return { text: lines.join("\n"), rows };
}

export interface AdminOrderExtra { status: string; payment_method: string; payment_status: string; phone: string; comment: string | null; cancel_reason: string | null }

/** card — карточка заказа, которую бот уже умеет собирать */
export function orderView(o: AdminOrderExtra, card: string, filter: string, page: number) {
  const lines = [card, "", `☎️ ${esc(o.phone)}`, `💳 Оплата: ${payText(o.payment_method, o.payment_status)}`];
  if (o.comment) lines.push(`💬 ${esc(o.comment)}`);
  if (o.cancel_reason && (o.status === "cancelled" || o.status === "expired")) lines.push(`Причина: ${reasonText(o.cancel_reason)}`);
  return { text: lines.join("\n"), rows: [[{ text: "← К списку", callback_data: `adm:l:${filter}:${page}` }]] as AdminButton[][] };
}

/** Уведомление администратору об отмене или истёкшем резерве */
export function cancelNotice(status: string, paymentStatus: string, phone: string, reason: unknown, card: string) {
  const head = status === "expired" ? "⌛ <b>Резерв истёк, заказ снят</b>" : "❌ <b>Заказ отменён</b>";
  const lines = [`${head} · ☎️ ${esc(phone)}`, `Причина: ${reasonText(reason)}`];
  // Возврат в кабинете Payme уже сделан, иначе о нём напоминаем
  if (paymentStatus === "refunded" && reason !== "payme refund") lines.push("⚠️ Заказ был оплачен онлайн: верните деньги в кабинете Payme или Click.");
  lines.push("", card);
  return lines.join("\n");
}
