"use client";

import { useEffect, type ReactNode } from "react";
import { s, staffLang } from "./i18n";

export const STAFF_ERRORS: Record<string, string> = {
  FORBIDDEN: "Недостаточно прав",
  ORDER_NOT_FOUND: "Заказ не найден",
  ORDER_NOT_ISSUABLE: "Заказ нельзя выдать в текущем статусе",
  NOT_PAID: "Заказ не оплачен",
  WRONG_CODE: "Код не совпадает. Попросите покупателя показать экран заказа.",
  BATCH_EXPIRED: "Срок продажи товара истёк — выдавать нельзя. Отмените заказ и изымите партию.",
  CANNOT_CANCEL: "Этот заказ нельзя отменить",
  REASON_REQUIRED: "Укажите причину",
  INVALID_QTY: "Неверное количество",
  INVALID_PRODUCED_AT: "Неверная дата производства",
  INVALID_EXPIRES_AT: "Срок годности раньше даты производства",
  PRODUCT_NOT_FOUND: "Товар не найден",
  FRIDGE_UNAVAILABLE: "Точка неактивна",
  BATCH_NOT_FOUND: "Партия не найдена",
  USER_NOT_FOUND: "Пользователь с таким email не зарегистрирован в Supabase Auth",
  CANNOT_DEMOTE_SELF: "Нельзя снять права администратора с самого себя",
};

export function staffError(msg?: string) {
  const code = (msg || "").trim();
  return STAFF_ERRORS[code] ? s(STAFF_ERRORS[code]) : code || s("Ошибка");
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={s("Закрыть")} className="animate-fade absolute inset-0 bg-night/55" onClick={onClose} />
      <div className="animate-sheet relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.5rem] bg-white p-5 sm:rounded-[1.5rem]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label={s("Закрыть")} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-lg font-bold">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded-xl bg-danger-50 p-3 text-sm font-bold text-danger" role="alert">{text}</p>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-brand-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const fmtSum = (v: number) => {
  const l = staffLang();
  if (l === "en") return `${new Intl.NumberFormat("en-US").format(v)} UZS`;
  return new Intl.NumberFormat("ru-RU").format(v).replace(/\s/g, " ") + (l === "uz" ? " so‘m" : " сум");
};
export const fmtDT = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Локальное время Ташкента для <input type="datetime-local"> */
export function nowLocalInput() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
  return parts.replace(" ", "T");
}
/** "2026-11-05T06:00" (Ташкент) → ISO с часовым поясом */
export const tashkentInputToISO = (v: string) => `${v}:00+05:00`;
