// Логика функции payments без привязки к среде запуска: зависимости передаются снаружи, поэтому её можно проверять тестами.
//
//  POST /payments/payme            — Merchant API, вызывает Payme
//  POST /payments/click/prepare    — SHOP API, вызывает Click
//  POST /payments/click/complete   — SHOP API, вызывает Click
//  POST /payments/link             — ссылка на оплату заказа, вызывают сайт и бот (ключ доступа — токен заказа)
//  POST /payments/status           — что настроено, для админ-панели (JWT администратора)
import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";

export interface Deps {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
  env: (key: string) => string | undefined;
  isAdmin: (jwt: string) => Promise<boolean>;
  fetch: typeof fetch;
}

type Lang = "uz" | "ru" | "en";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const md5 = (s: string) => createHash("md5").update(s).digest("hex");

// ---------- Payme ----------
const PAYME_TEXT: Record<string, { ru: string; uz: string; en: string }> = {
  unauthorized: { ru: "Недостаточно привилегий", uz: "Ruxsat yetarli emas", en: "Insufficient privileges" },
  bad_method: { ru: "Метод запроса не POST", uz: "So‘rov usuli POST emas", en: "Request method is not POST" },
  parse: { ru: "Ошибка разбора JSON", uz: "JSON tahlilida xato", en: "JSON parse error" },
  bad_request: { ru: "Неверный запрос", uz: "So‘rov noto‘g‘ri", en: "Invalid request" },
  method_not_found: { ru: "Метод не найден", uz: "Usul topilmadi", en: "Method not found" },
  system: { ru: "Системная ошибка", uz: "Tizim xatosi", en: "System error" },
  order_not_found: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
  order_not_payable: { ru: "Заказ нельзя оплатить: он уже оплачен, отменён или истёк", uz: "Buyurtmani to‘lab bo‘lmaydi: u to‘langan, bekor qilingan yoki muddati tugagan", en: "This order can’t be paid: it is already paid, cancelled or expired" },
  order_busy: { ru: "Оплата этого заказа уже выполняется", uz: "Bu buyurtma uchun to‘lov allaqachon bajarilmoqda", en: "A payment for this order is already in progress" },
  wrong_amount: { ru: "Неверная сумма", uz: "Summa noto‘g‘ri", en: "Incorrect amount" },
  cannot_perform: { ru: "Невозможно выполнить операцию", uz: "Amalni bajarib bo‘lmaydi", en: "Unable to perform the operation" },
  tx_not_found: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
  order_issued: { ru: "Заказ выполнен, отмена невозможна", uz: "Buyurtma bajarilgan, bekor qilib bo‘lmaydi", en: "The order is fulfilled and can’t be cancelled" },
};
const paymeError = (id: unknown, code: number, key: string, data?: string | null) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message: PAYME_TEXT[key] ?? PAYME_TEXT.system, data: data ?? null } });

const paymeTestMode = (d: Deps) => d.env("PAYME_TEST_MODE") === "1";
const paymeKey = (d: Deps) => (paymeTestMode(d) ? d.env("PAYME_TEST_KEY") : d.env("PAYME_KEY")) ?? "";

function paymeParamsValid(method: string, p: Record<string, unknown> | undefined) {
  if (!p || typeof p !== "object") return false;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 64;
  switch (method) {
    case "CheckPerformTransaction": return num(p.amount) && typeof p.account === "object" && p.account !== null;
    case "CreateTransaction": return str(p.id) && num(p.time) && num(p.amount) && typeof p.account === "object" && p.account !== null;
    case "PerformTransaction":
    case "CheckTransaction": return str(p.id);
    case "CancelTransaction": return str(p.id) && num(p.reason);
    case "GetStatement": return num(p.from) && num(p.to);
    default: return true;
  }
}

async function handlePayme(d: Deps, req: Request) {
  const key = paymeKey(d);
  const text = await req.text();
  let body: { id?: unknown; method?: unknown; params?: Record<string, unknown> } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  // Сначала авторизация: без верного ключа о системе ничего не сообщаем
  const expected = `Basic ${btoa(`Paycom:${key}`)}`;
  if (!key || !same(req.headers.get("authorization") ?? "", expected)) return paymeError(body?.id, -32504, "unauthorized");
  if (!body) return paymeError(null, -32700, "parse");
  if (typeof body.method !== "string") return paymeError(body.id, -32600, "bad_request");
  const known = ["CheckPerformTransaction", "CreateTransaction", "PerformTransaction", "CancelTransaction", "CheckTransaction", "GetStatement"];
  if (!known.includes(body.method)) return paymeError(body.id, -32601, "method_not_found", body.method);
  if (!paymeParamsValid(body.method, body.params)) return paymeError(body.id, -32600, "bad_request");

  const { data, error } = await d.rpc("pay_payme", { p_method: body.method, p_p: body.params });
  if (error || !data) {
    console.error("pay_payme failed", error?.message);
    return paymeError(body.id, -32400, "system");
  }
  if (data.error) return paymeError(body.id, data.error, data.key, data.data);
  if (data.paid_order) await notifyPaid(d, data.paid_order);
  return json({ jsonrpc: "2.0", id: body.id, result: data.result });
}

// ---------- Click ----------
const CLICK_NOTE: Record<number, string> = {
  0: "Success", [-1]: "SIGN CHECK FAILED!", [-2]: "Incorrect parameter amount", [-3]: "Action not found", [-4]: "Already paid",
  [-5]: "User does not exist", [-6]: "Transaction does not exist", [-7]: "Failed to update user", [-8]: "Error in request from click", [-9]: "Transaction cancelled",
};

async function clickParams(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  if ((req.headers.get("content-type") ?? "").includes("json")) {
    try {
      return Object.fromEntries(Object.entries(JSON.parse(text)).map(([k, v]) => [k, String(v)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

async function handleClick(d: Deps, req: Request, stage: "prepare" | "complete") {
  const p = await clickParams(req);
  const answer = (error: number, extra: Record<string, unknown> = {}) =>
    json({ click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id, error, error_note: CLICK_NOTE[error] ?? "Error", ...extra });

  const required = ["click_trans_id", "service_id", "merchant_trans_id", "amount", "action", "sign_time", "sign_string"];
  if (required.some((k) => !p[k]) || !Number.isFinite(Number(p.amount))) return answer(-8);
  const secret = d.env("CLICK_SECRET_KEY") ?? "";
  const serviceId = d.env("CLICK_SERVICE_ID") ?? "";
  if (!secret || !serviceId) return answer(-1);

  // Подпись считается по строке суммы в том виде, как её прислал Click
  const prepareId = stage === "complete" ? p.merchant_prepare_id ?? "" : "";
  const sign = md5(`${p.click_trans_id}${p.service_id}${secret}${p.merchant_trans_id}${prepareId}${p.amount}${p.action}${p.sign_time}`);
  if (!same(sign, p.sign_string.toLowerCase()) || p.service_id !== serviceId) return answer(-1);
  if (p.action !== (stage === "prepare" ? "0" : "1")) return answer(-3);

  const raw = { click_paydoc_id: p.click_paydoc_id, sign_time: p.sign_time, error: p.error, error_note: p.error_note };
  if (stage === "prepare") {
    const { data, error } = await d.rpc("pay_click_prepare", { p_trans: p.click_trans_id, p_order: p.merchant_trans_id, p_amount: Number(p.amount), p_raw: raw });
    if (error || !data) {
      console.error("pay_click_prepare failed", error?.message);
      return answer(-7);
    }
    return data.error ? answer(data.error) : answer(0, { merchant_prepare_id: data.id });
  }

  const { data, error } = await d.rpc("pay_click_complete", {
    p_trans: p.click_trans_id, p_prepare: p.merchant_prepare_id ?? "", p_order: p.merchant_trans_id,
    p_amount: Number(p.amount), p_error: Number(p.error ?? 0), p_raw: raw,
  });
  if (error || !data) {
    console.error("pay_click_complete failed", error?.message);
    return answer(-7);
  }
  if (data.error) return answer(data.error);
  if (data.paid_order) await notifyPaid(d, data.paid_order);
  if (data.late_order) await alertLatePayment(d, data.late_order, p.amount, p.click_trans_id);
  return answer(0, { merchant_confirm_id: data.id });
}

// ---------- ссылка на оплату ----------
function configured(d: Deps) {
  return {
    payme: { ready: !!d.env("PAYME_MERCHANT_ID") && !!paymeKey(d), test_mode: paymeTestMode(d) },
    click: { ready: !!d.env("CLICK_SERVICE_ID") && !!d.env("CLICK_MERCHANT_ID") && !!d.env("CLICK_SECRET_KEY") },
  };
}

async function handleLink(d: Deps, req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!UUID.test(body.token ?? "")) return json({ ok: false, error: "BAD_TOKEN" }, 400);
  const lang: Lang = body.lang === "ru" || body.lang === "en" ? body.lang : "uz";
  const { data: order } = await d.rpc("get_order", { p_token: body.token });
  if (!order) return json({ ok: false, error: "NOT_FOUND" }, 404);
  if (order.status !== "pending_payment" || order.payment_status !== "unpaid") return json({ ok: false, error: "NOT_PAYABLE" }, 409);
  const { data: cfg } = await d.rpc("pay_config");
  const back = `${cfg?.site_url ?? ""}/${lang}/order/${order.token}`;
  const ok = configured(d);

  if (order.payment_method === "payme") {
    if (!ok.payme.ready) return json({ ok: false, error: "NOT_CONFIGURED" }, 503);
    const params = `m=${d.env("PAYME_MERCHANT_ID")};ac.order_id=${order.number};a=${order.total * 100};l=${lang};c=${back}`;
    const host = ok.payme.test_mode ? "https://checkout.test.paycom.uz" : "https://checkout.paycom.uz";
    return json({ ok: true, url: `${host}/${btoa(params)}` });
  }
  if (order.payment_method === "click") {
    if (!ok.click.ready) return json({ ok: false, error: "NOT_CONFIGURED" }, 503);
    const q = new URLSearchParams({
      service_id: d.env("CLICK_SERVICE_ID")!, merchant_id: d.env("CLICK_MERCHANT_ID")!,
      amount: Number(order.total).toFixed(2), transaction_param: String(order.number), return_url: back,
    });
    return json({ ok: true, url: `https://my.click.uz/services/pay/?${q}` });
  }
  return json({ ok: false, error: "NOT_PAYABLE" }, 409);
}

// ---------- уведомления ----------
async function telegram(d: Deps, token: string | undefined, chatId: unknown, text: string) {
  if (!token || !chatId) return;
  try {
    const r = await d.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) console.error("telegram notify failed", r.status);
  } catch (e) {
    console.error("telegram notify failed", e); // уведомление не должно мешать подтверждению платежа
  }
}

const PAID_TEXT: Record<Lang, (n: unknown, code: unknown, slot: string) => string> = {
  uz: (n, code, slot) => `✅ <b>To‘lov qabul qilindi.</b> Buyurtma № ${n}.\n🔑 Olish kodi: <b>${code}</b>\n🕒 Olib ketish: ${slot}`,
  ru: (n, code, slot) => `✅ <b>Оплата получена.</b> Заказ № ${n}.\n🔑 Код получения: <b>${code}</b>\n🕒 Получение: ${slot}`,
  en: (n, code, slot) => `✅ <b>Payment received.</b> Order № ${n}.\n🔑 Pickup code: <b>${code}</b>\n🕒 Pickup: ${slot}`,
};

async function notifyPaid(d: Deps, orderId: string) {
  const { data: e, error } = await d.rpc("pay_paid_event", { p_order_id: orderId });
  if (error || !e) return;
  const slot = `${e.pickup_date}, ${String(e.pickup_slot).replace("-", "–")}`;
  await Promise.all([
    telegram(d, d.env("TELEGRAM_SHOP_BOT_TOKEN"), e.shop_chat_id, PAID_TEXT[e.shop_lang as Lang](e.number, e.pickup_code, slot)),
    telegram(d, d.env("TELEGRAM_BOT_TOKEN"), e.tg_chat_id, PAID_TEXT[e.tg_lang as Lang](e.number, e.pickup_code, slot)),
    telegram(d, d.env("TELEGRAM_BOT_TOKEN"), e.admin_chat_id, `💳 <b>Заказ № ${e.number} оплачен</b> через ${String(e.provider).toUpperCase()} · ${e.total} сум · ☎️ ${e.phone}`),
  ]);
}

async function alertLatePayment(d: Deps, number: unknown, amount: string, txn: string) {
  const { data: cfg } = await d.rpc("pay_config");
  await telegram(d, d.env("TELEGRAM_BOT_TOKEN"), cfg?.admin_chat_id,
    `⚠️ <b>Нужен возврат денег.</b> Click провёл оплату заказа № ${number} (${amount} сум, транзакция ${txn}), но заказ уже снят. Верните деньги в кабинете Click.`);
}

// ---------- статус для админ-панели ----------
async function handleStatus(d: Deps, req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || !(await d.isAdmin(jwt))) return json({ ok: false, error: "FORBIDDEN" }, 403);
  return json({ ok: true, ...configured(d) });
}

// ---------- маршруты ----------
export function createHandler(d: Deps) {
  return async (req: Request): Promise<Response> => {
    const path = new URL(req.url).pathname.replace(/^.*\/payments/, "") || "/";
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (path === "/payme" && req.method !== "POST") return paymeError(null, -32300, "bad_method");
    if (req.method !== "POST") return json({ ok: false }, 405);
    try {
      if (path === "/payme") return await handlePayme(d, req);
      if (path === "/click/prepare") return await handleClick(d, req, "prepare");
      if (path === "/click/complete") return await handleClick(d, req, "complete");
      if (path === "/link") return await handleLink(d, req);
      if (path === "/status") return await handleStatus(d, req);
      return json({ ok: false }, 404);
    } catch (e) {
      console.error(e);
      if (path === "/payme") return paymeError(null, -32400, "system");
      if (path.startsWith("/click")) return json({ error: -7, error_note: CLICK_NOTE[-7] });
      return json({ ok: false, error: "INTERNAL" }, 500);
    }
  };
}
