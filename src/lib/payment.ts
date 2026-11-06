import type { Lang } from "./types";

/** Ссылка на оплату заказа в Payme или Click. null — ссылку получить не удалось, покупатель останется на странице заказа */
export async function paymentUrl(token: string, lang: Lang): Promise<string | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payments/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, lang }),
      signal: AbortSignal.timeout(8000),
    });
    const res = await r.json();
    return res.ok && typeof res.url === "string" ? res.url : null;
  } catch {
    return null;
  }
}
