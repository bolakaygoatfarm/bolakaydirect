"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CartLine } from "./types";

/** Корзина хранится в localStorage отдельно для каждой точки. */
const key = (code: string) => `bolakay-cart-${code}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();
const EMPTY: CartLine[] = [];

function read(code: string): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(code));
  } catch {
    raw = null;
  }
  const c = cache.get(code);
  if (c && c.raw === raw) return c.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) lines = parsed.filter((l) => l && typeof l.batch_id === "string" && l.qty > 0);
  } catch {
    lines = EMPTY;
  }
  cache.set(code, { raw, lines });
  return lines;
}

export function writeCart(code: string, lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(key(code), JSON.stringify(lines));
    else localStorage.removeItem(key(code));
  } catch {
    /* приватный режим — корзина живёт только в памяти */
    cache.set(code, { raw: JSON.stringify(lines), lines });
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(code: string) {
  const lines = useSyncExternalStore(subscribe, () => read(code), () => EMPTY);

  const setQty = useCallback(
    (batch_id: string, product_id: string, qty: number) => {
      const cur = read(code);
      const next = cur.filter((l) => l.batch_id !== batch_id);
      if (qty > 0) next.push({ batch_id, product_id, qty });
      writeCart(code, next);
    },
    [code],
  );

  const clear = useCallback(() => writeCart(code, []), [code]);

  return { lines, setQty, clear };
}

/** Сохранённые на устройстве заказы (для «Мои заказы») */
const ORDERS_KEY = "bolakay-orders";
export function rememberOrder(token: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    localStorage.setItem(ORDERS_KEY, JSON.stringify([token, ...list.filter((x) => x !== token)].slice(0, 30)));
  } catch {
    /* ignore */
  }
}
export function savedOrders(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
