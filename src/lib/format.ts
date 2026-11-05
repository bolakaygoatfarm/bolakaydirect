import type { Lang } from "./types";

export const TZ = "Asia/Tashkent";

export function money(v: number, lang: Lang) {
  const n = new Intl.NumberFormat("ru-RU").format(v).replace(/ /g, " ");
  return `${n} ${lang === "uz" ? "so‘m" : "сум"}`;
}

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** Дата по Ташкенту в виде YYYY-MM-DD */
export function tashkentDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function tashkentTime(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function shortDate(iso: string, lang: Lang) {
  const d = new Date(iso);
  if (lang === "uz") {
    const [, m, day] = tashkentDate(d).split("-").map(Number);
    return `${day}-${UZ_MONTHS[m - 1]}`;
  }
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
}

export function dateTime(iso: string, lang: Lang) {
  return `${shortDate(iso, lang)}, ${tashkentTime(new Date(iso))}`;
}

/** Сколько дней назад произведено (по календарю Ташкента) */
export function daysAgo(iso: string) {
  const a = Date.parse(tashkentDate(new Date(iso)));
  const b = Date.parse(tashkentDate());
  return Math.round((b - a) / 86400000);
}

export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Нормализация узбекского номера в +998XXXXXXXXX */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let d = digits;
  if (d.length === 9) d = "998" + d;
  if (d.length === 12 && d.startsWith("998")) return "+" + d;
  return null;
}

export function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(" ");
}

/** 2-часовые интервалы выдачи в рамках графика точки, начиная с ближайшего доступного */
export function pickupSlots(open: string, close: string, ymd: string): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const o = toMin(open.slice(0, 5));
  const c = toMin(close.slice(0, 5));
  const isToday = ymd === tashkentDate();
  const now = toMin(tashkentTime());
  const res: string[] = [];
  for (let s = o; s < c; s += 120) {
    const e = Math.min(s + 120, c);
    if (isToday && e <= now + 15) continue;
    res.push(`${fmt(s)}-${fmt(e)}`);
  }
  return res;
}

/** Берёт локализованное поле: pick(product, "name", "uz") → product.name_uz (с фолбэком на ru) */
export function pick(obj: object, field: string, lang: Lang): string {
  const o = obj as Record<string, unknown>;
  return ((o[`${field}_${lang}`] as string | null) ?? (o[`${field}_ru`] as string | null) ?? "") as string;
}
