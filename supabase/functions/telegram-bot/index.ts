// BOLAKAY DIRECT · Telegram-бот (Supabase Edge Function)
//
//  POST /telegram-bot          — webhook от Telegram (заголовок X-Telegram-Bot-Api-Secret-Token)
//  POST /telegram-bot/notify   — события из базы через pg_net (заголовок x-bolakay-secret)
//  POST /telegram-bot/setup    — подключение бота из админ-панели (JWT администратора)
//
// Секрет TELEGRAM_BOT_TOKEN задаётся в Supabase → Edge Functions → Secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

type Lang = "uz" | "ru";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined;
  } catch {
    return undefined;
  }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- конфигурация ----------
interface Cfg {
  webhook_secret: string;
  function_url: string;
  site_url: string;
  admin_chat_id: number | null;
  bot_username: string | null;
  support_phone: string | null;
}
let cfgCache: { v: Cfg; at: number } | null = null;
async function cfg(fresh = false): Promise<Cfg> {
  if (!fresh && cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.v;
  const { data, error } = await db.rpc("tg_config");
  if (error) throw new Error(`tg_config: ${error.message}`);
  cfgCache = { v: data as Cfg, at: Date.now() };
  return cfgCache.v;
}

// ---------- Telegram API ----------
// outbox — для отладки: что бот отправил бы в Telegram за этот запрос
let outbox: { method: string; payload: Record<string, unknown> }[] = [];
async function tg(method: string, payload: Record<string, unknown>) {
  outbox.push({ method, payload });
  if (!TOKEN) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await r.json().catch(() => ({ ok: false }));
  if (!res.ok) console.error(`telegram ${method} failed`, JSON.stringify(res));
  return res;
}

type Button = { text: string; url?: string; callback_data?: string };
const isPublicUrl = (u: string) => /^https:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u);

/** Отправка сообщения. URL-кнопки на localhost Telegram не принимает — тогда ссылка уходит текстом. */
async function send(chatId: number, text: string, rows: Button[][] = []) {
  const extra: string[] = [];
  const kb = rows
    .map((row) =>
      row.filter((b) => {
        if (b.url && !isPublicUrl(b.url)) {
          extra.push(`${esc(b.text)}: ${esc(b.url)}`);
          return false;
        }
        return true;
      }),
    )
    .filter((r) => r.length);
  return tg("sendMessage", {
    chat_id: chatId,
    text: extra.length ? `${text}\n\n${extra.join("\n")}` : text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(kb.length ? { reply_markup: { inline_keyboard: kb } } : {}),
  });
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- тексты ----------
const T = {
  uz: {
    welcome: "Assalomu alaykum! Bu <b>BOLAKAY DIRECT</b> boti — echki fermasidan to‘g‘ridan-to‘g‘ri.\n\nBu yerda buyurtma holati, olish kodi va yangi partiyalar haqida xabarlar keladi.\n\nBuyurtmani ulash uchun saytdagi buyurtma sahifasida «Telegram’da xabarnomalar» tugmasini bosing.",
    linked: "✅ Tayyor! Endi buyurtmalaringiz haqidagi xabarlar shu yerga keladi.",
    link_bad: "Buyurtma topilmadi. Saytdagi buyurtma sahifasidan tugmani qayta bosing.",
    not_linked: "Hali birorta buyurtma ulanmagan. Saytdan buyurtma bering va buyurtma sahifasida «Telegram’da xabarnomalar» tugmasini bosing.",
    orders_title: "🧾 <b>So‘nggi buyurtmalar</b>",
    orders_empty: "Buyurtmalar yo‘q.",
    support_prompt: "Savolingizni bitta xabarda yozing — administrator shu yerda javob beradi.",
    support_sent: "✅ Xabaringiz administratorga yuborildi.",
    support_off: "Yordam: ",
    support_reply: "💬 <b>BOLAKAY yordam xizmati:</b>",
    unlinked: "Xabarnomalar o‘chirildi. Qayta ulash uchun saytdagi buyurtma sahifasidagi tugmani bosing.",
    lang_set: "Til: o‘zbekcha 🇺🇿",
    help: "Buyruqlar:\n/orders — buyurtmalarim\n/support — yordam\n/lang — tilni almashtirish\n/stop — xabarnomalarni o‘chirish",
    repeat_text: "Savat saytda to‘ldiriladi — qoldiqlar o‘sha yerda tekshiriladi.",
    btn_points: "📍 Nuqtalar", btn_orders: "🧾 Buyurtmalarim", btn_support: "🆘 Yordam", btn_lang: "🇷🇺 Русский",
    btn_open: "Buyurtmani ochish", btn_repeat: "🔁 Takrorlash", btn_order_now: "Buyurtma berish",
    order: "Buyurtma", code: "Olish kodi", pickup: "Olib ketish", total: "Jami", point: "Nuqta",
    st: { pending_payment: "To‘lov kutilmoqda", confirmed: "Band qilindi", issued: "Berildi", cancelled: "Bekor qilindi", expired: "Muddati tugadi" } as Record<string, string>,
    created: "🆕 Buyurtma qabul qilindi! Mahsulot siz uchun band qilindi.",
    issued: "✅ Buyurtma berildi. Xaridingiz uchun rahmat!",
    cancelled: "❌ Buyurtma bekor qilindi.",
    expired: "⌛ Band qilish muddati tugadi, buyurtma bekor qilindi. Kerak bo‘lsa, qayta buyurtma bering.",
    batch: (n: string, p: string) => `🥛 Yangi partiya keldi: <b>${n}</b> — ${p} nuqtasida. Siz oldindan buyurtma bergansiz — hozir band qilishingiz mumkin.`,
    sum: "so‘m",
    months: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  },
  ru: {
    welcome: "Здравствуйте! Это бот <b>BOLAKAY DIRECT</b> — продукция козьей фермы напрямую.\n\nСюда приходят статус заказа, код получения и сообщения о новых партиях.\n\nЧтобы подключить заказ, нажмите «Уведомления в Telegram» на странице заказа на сайте.",
    linked: "✅ Готово! Уведомления о ваших заказах будут приходить сюда.",
    link_bad: "Заказ не найден. Нажмите кнопку на странице заказа ещё раз.",
    not_linked: "Пока нет подключённых заказов. Оформите заказ на сайте и нажмите «Уведомления в Telegram» на странице заказа.",
    orders_title: "🧾 <b>Последние заказы</b>",
    orders_empty: "Заказов нет.",
    support_prompt: "Напишите вопрос одним сообщением — администратор ответит здесь.",
    support_sent: "✅ Сообщение передано администратору.",
    support_off: "Поддержка: ",
    support_reply: "💬 <b>Поддержка BOLAKAY:</b>",
    unlinked: "Уведомления отключены. Чтобы подключить снова, нажмите кнопку на странице заказа.",
    lang_set: "Язык: русский 🇷🇺",
    help: "Команды:\n/orders — мои заказы\n/support — поддержка\n/lang — сменить язык\n/stop — отключить уведомления",
    repeat_text: "Корзина соберётся на сайте — там же проверим актуальные остатки.",
    btn_points: "📍 Точки", btn_orders: "🧾 Мои заказы", btn_support: "🆘 Поддержка", btn_lang: "🇺🇿 O‘zbekcha",
    btn_open: "Открыть заказ", btn_repeat: "🔁 Повторить", btn_order_now: "Заказать",
    order: "Заказ", code: "Код получения", pickup: "Получение", total: "Итого", point: "Точка",
    st: { pending_payment: "Ожидает оплаты", confirmed: "Зарезервирован", issued: "Выдан", cancelled: "Отменён", expired: "Истёк" } as Record<string, string>,
    created: "🆕 Заказ принят! Товар зарезервирован за вами.",
    issued: "✅ Заказ выдан. Спасибо за покупку!",
    cancelled: "❌ Заказ отменён.",
    expired: "⌛ Время резерва истекло, заказ отменён. Если нужно — оформите заново.",
    batch: (n: string, p: string) => `🥛 Пришла новая партия: <b>${n}</b> в точке ${p}. Вы оставляли предзаказ — можно забронировать сейчас.`,
    sum: "сум",
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  },
};

// ---------- форматирование заказа ----------
interface Order {
  number: number; token: string; pickup_code: string; status: string; payment_method: string; payment_status: string;
  total: number; pickup_date: string; pickup_slot: string;
  fridge: { code: string; name: string; address_uz: string | null; address_ru: string | null };
  items: { product_id: string; name_uz: string; name_ru: string; size_label: string; qty: number; price: number }[];
}
const money = (v: number, l: Lang) => `${new Intl.NumberFormat("ru-RU").format(v).replace(/ /g, " ")} ${T[l].sum}`;
const day = (ymd: string, l: Lang) => {
  const [, m, d] = ymd.split("-").map(Number);
  return l === "uz" ? `${d}-${T.uz.months[m - 1]}` : `${d} ${T.ru.months[m - 1]}`;
};

function orderCard(o: Order, l: Lang) {
  const t = T[l];
  const active = o.status === "confirmed" || o.status === "pending_payment";
  const lines = [
    `🧾 <b>${t.order} № ${o.number}</b> — ${esc(t.st[o.status] ?? o.status)}`,
    `📍 ${t.point} ${esc(o.fridge.name)}, ${esc((l === "uz" ? o.fridge.address_uz : o.fridge.address_ru) ?? "")}`,
    `🕒 ${t.pickup}: ${day(o.pickup_date, l)}, ${esc(o.pickup_slot.replace("-", "–"))}`,
  ];
  if (active) lines.push(`🔑 ${t.code}: <b>${esc(o.pickup_code)}</b>`);
  lines.push("");
  for (const i of o.items) lines.push(`• ${esc(l === "uz" ? i.name_uz : i.name_ru)} ${esc(i.size_label)} × ${i.qty} — ${money(i.price * i.qty, l)}`);
  lines.push(`💰 ${t.total}: <b>${money(o.total, l)}</b>`);
  return lines.join("\n");
}

const orderUrl = (c: Cfg, o: Order, l: Lang) => `${c.site_url}/${l}/order/${o.token}`;
const repeatUrl = (c: Cfg, o: Order, l: Lang) => `${c.site_url}/${l}/point/${o.fridge.code}?repeat=${o.token}`;

function mainMenu(c: Cfg, l: Lang): Button[][] {
  const t = T[l];
  return [
    [{ text: t.btn_orders, callback_data: "orders" }, { text: t.btn_points, url: `${c.site_url}/${l}/points` }],
    [{ text: t.btn_support, callback_data: "support" }, { text: t.btn_lang, callback_data: "lang" }],
  ];
}

// ---------- webhook ----------
interface TgUser { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string }
interface TgMessage {
  message_id: number; text?: string; chat: { id: number; type: string; title?: string }; from?: TgUser;
  reply_to_message?: { text?: string; from?: TgUser };
}

async function langFor(chatId: number, from?: TgUser): Promise<Lang> {
  const { data } = await db.rpc("tg_customer", { p_chat_id: chatId });
  if (data?.lang === "ru" || data?.lang === "uz") return data.lang;
  return from?.language_code?.startsWith("ru") ? "ru" : "uz";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function onStart(c: Cfg, msg: TgMessage, payload: string) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (payload.startsWith("admin_")) return onAdminBind(msg, payload.slice(6));
  if (msg.chat.type !== "private") return;
  if (UUID.test(payload)) {
    const pref: Lang = from?.language_code?.startsWith("ru") ? "ru" : "uz";
    const existing = await db.rpc("tg_customer", { p_chat_id: chatId });
    const lang: Lang = (existing.data?.lang as Lang) ?? pref;
    const { data, error } = await db.rpc("tg_link_order", { p_token: payload, p_chat_id: chatId, p_lang: lang, p_username: from?.username ?? null });
    if (error || !data) return send(chatId, T[lang].link_bad, mainMenu(c, lang));
    const o = data as Order;
    return send(chatId, `${T[lang].linked}\n\n${orderCard(o, lang)}`, [
      [{ text: T[lang].btn_open, url: orderUrl(c, o, lang) }],
      ...mainMenu(c, lang),
    ]);
  }
  const lang = await langFor(chatId, from);
  return send(chatId, T[lang].welcome, mainMenu(c, lang));
}

async function onOrders(c: Cfg, chatId: number, lang: Lang) {
  const cust = await db.rpc("tg_customer", { p_chat_id: chatId });
  if (!cust.data) return send(chatId, T[lang].not_linked, mainMenu(c, lang));
  const { data } = await db.rpc("tg_orders_by_chat", { p_chat_id: chatId });
  const orders = (data ?? []) as Order[];
  if (!orders.length) return send(chatId, T[lang].orders_empty, mainMenu(c, lang));
  for (const o of orders.slice(0, 5).reverse()) {
    const rows: Button[][] = [[{ text: T[lang].btn_open, url: orderUrl(c, o, lang) }]];
    if (o.status === "issued") rows[0].push({ text: T[lang].btn_repeat, callback_data: `repeat:${o.token}` });
    await send(chatId, orderCard(o, lang), rows);
  }
}

async function onRepeat(c: Cfg, chatId: number, lang: Lang, token: string) {
  const { data } = await db.rpc("tg_orders_by_chat", { p_chat_id: chatId });
  const o = ((data ?? []) as Order[]).find((x) => x.token === token);
  if (!o) return send(chatId, T[lang].not_linked);
  return send(chatId, `🔁 ${T[lang].order} № ${o.number}\n${T[lang].repeat_text}`, [[{ text: T[lang].btn_order_now, url: repeatUrl(c, o, lang) }]]);
}

async function onAdminBind(msg: TgMessage, code: string) {
  const ok = (await db.rpc("tg_bind_admin", { p_code: code.trim(), p_chat_id: msg.chat.id })).data === true;
  cfgCache = null;
  return send(msg.chat.id, ok
    ? "✅ Этот чат подключён как чат администратора BOLAKAY: сюда будут приходить новые заказы и обращения покупателей. Чтобы ответить покупателю, ответьте (Reply) на его сообщение."
    : "Код неверный или устарел. Получите новый код в панели: Настройки → Telegram.");
}

async function onSupportMessage(c: Cfg, msg: TgMessage, lang: Lang) {
  const chatId = msg.chat.id;
  if (!c.admin_chat_id) return send(chatId, `${T[lang].support_off}${esc(c.support_phone ?? "")}`);
  const cust = await db.rpc("tg_customer", { p_chat_id: chatId });
  const who = [
    msg.from?.first_name, msg.from?.last_name,
    msg.from?.username ? `@${msg.from.username}` : null,
    cust.data?.phone ?? null,
  ].filter(Boolean).join(" · ");
  await send(c.admin_chat_id, `🆘 <b>Обращение</b> #u${chatId}\n${esc(who)}\n\n${esc(msg.text)}\n\n<i>Ответьте на это сообщение (Reply), чтобы написать покупателю.</i>`);
  return send(chatId, T[lang].support_sent);
}

/** Обращение пришло из бота заказов: ответ отправляем через него, этому боту покупатель мог не писать */
async function replyViaShopBot(msg: TgMessage, chatId: number) {
  const shopToken = Deno.env.get("TELEGRAM_SHOP_BOT_TOKEN") ?? "";
  let ok = false;
  if (shopToken) {
    const { data } = await db.rpc("shop_user", { p_chat_id: chatId });
    const head = { uz: "💬 <b>BOLAKAY yordam xizmati:</b>", ru: "💬 <b>Поддержка BOLAKAY:</b>", en: "💬 <b>BOLAKAY support:</b>" }[(data?.lang ?? "uz") as "uz" | "ru" | "en"];
    const r = await fetch(`https://api.telegram.org/bot${shopToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `${head}\n${esc(msg.text)}`, parse_mode: "HTML" }),
    });
    ok = (await r.json().catch(() => ({ ok: false }))).ok === true;
  }
  await tg("setMessageReaction", { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: ok ? "👍" : "👎" }] });
}

async function onAdminReply(msg: TgMessage) {
  const shop = msg.reply_to_message?.text?.match(/#s(\d+)/);
  if (shop && msg.text) return replyViaShopBot(msg, Number(shop[1]));
  const m = msg.reply_to_message?.text?.match(/#u(-?\d+)/);
  if (!m || !msg.text) return;
  const target = Number(m[1]);
  const lang = await langFor(target);
  const r = await send(target, `${T[lang].support_reply}\n${esc(msg.text)}`);
  await tg("setMessageReaction", { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: r.ok === false ? "👎" : "👍" }] });
}

async function handleUpdate(u: Record<string, unknown>) {
  const c = await cfg();

  const cq = u.callback_query as { id: string; data?: string; from: TgUser; message?: TgMessage } | undefined;
  if (cq) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id });
    const chatId = cq.message?.chat.id ?? cq.from.id;
    let lang = await langFor(chatId, cq.from);
    const d = cq.data ?? "";
    if (d === "orders") return onOrders(c, chatId, lang);
    if (d === "support") return send(chatId, T[lang].support_prompt);
    if (d === "lang") {
      lang = lang === "uz" ? "ru" : "uz";
      await db.rpc("tg_set_lang", { p_chat_id: chatId, p_lang: lang });
      return send(chatId, T[lang].lang_set, mainMenu(c, lang));
    }
    if (d.startsWith("repeat:")) return onRepeat(c, chatId, lang, d.slice(7));
    return;
  }

  const msg = (u.message ?? u.edited_message) as TgMessage | undefined;
  if (!msg?.text) return;
  const text = msg.text.trim();
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.startsWith("/") ? rawCmd.split("@")[0].toLowerCase() : "";
  const arg = rest.join(" ");

  // Чат администратора: только ответы покупателям и привязка
  if (c.admin_chat_id && msg.chat.id === Number(c.admin_chat_id)) {
    if (cmd === "/admin") return onAdminBind(msg, arg);
    if (msg.reply_to_message) return onAdminReply(msg);
    return;
  }
  if (cmd === "/start") return onStart(c, msg, arg);
  if (cmd === "/admin") return onAdminBind(msg, arg);
  if (msg.chat.type !== "private") return;

  const lang = await langFor(msg.chat.id, msg.from);
  switch (cmd) {
    case "/orders": return onOrders(c, msg.chat.id, lang);
    case "/support": return send(msg.chat.id, T[lang].support_prompt);
    case "/help": return send(msg.chat.id, T[lang].help, mainMenu(c, lang));
    case "/lang": {
      const next: Lang = lang === "uz" ? "ru" : "uz";
      await db.rpc("tg_set_lang", { p_chat_id: msg.chat.id, p_lang: next });
      return send(msg.chat.id, T[next].lang_set, mainMenu(c, next));
    }
    case "/stop":
      await db.rpc("tg_unlink", { p_chat_id: msg.chat.id });
      return send(msg.chat.id, T[lang].unlinked);
    case "":
      return onSupportMessage(c, msg, lang);
    default:
      return send(msg.chat.id, T[lang].help, mainMenu(c, lang));
  }
}

// ---------- события из базы ----------
async function handleNotify(body: { event: string; id: string }) {
  const c = await cfg();
  if (body.event === "order_created" || body.event === "order_status") {
    const { data } = await db.rpc("tg_order_event", { p_order_id: body.id });
    if (!data?.order) return;
    const o = data.order as Order;
    const lang = data.lang as Lang;
    if (data.chat_id) {
      const t = T[lang];
      const head = body.event === "order_created" ? t.created : o.status === "issued" ? t.issued : o.status === "expired" ? t.expired : t.cancelled;
      const rows: Button[][] = [[{ text: t.btn_open, url: orderUrl(c, o, lang) }]];
      if (o.status === "issued") rows[0].push({ text: t.btn_repeat, callback_data: `repeat:${o.token}` });
      await send(Number(data.chat_id), `${head}\n\n${orderCard(o, lang)}`, rows);
    }
    if (c.admin_chat_id && body.event === "order_created") {
      await send(Number(c.admin_chat_id), `🆕 <b>Новый заказ</b> · ☎️ ${esc(data.phone)}\n${orderCard(o, "ru")}`);
    }
    return;
  }
  if (body.event === "batch_arrived") {
    const { data } = await db.rpc("tg_batch_event", { p_batch_id: body.id });
    if (!data) return;
    for (const r of data.recipients as { chat_id: number; lang: Lang; qty: number }[]) {
      const name = `${r.lang === "uz" ? data.name_uz : data.name_ru} ${data.size_label}`;
      await send(Number(r.chat_id), T[r.lang].batch(esc(name), esc(data.fridge_name)), [
        [{ text: T[r.lang].btn_order_now, url: `${c.site_url}/${r.lang}/point/${data.fridge_code}` }],
      ]);
    }
  }
}

// ---------- подключение бота из админ-панели ----------
async function handleSetup(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const { data: staff } = await db.from("staff").select("role,is_active").eq("user_id", u.user.id).maybeSingle();
  if (!staff || staff.role !== "admin" || !staff.is_active) return json({ ok: false, error: "FORBIDDEN" }, 403);
  if (!TOKEN) return json({ ok: false, error: "NO_TOKEN" }, 400);

  const body = await req.json().catch(() => ({}));
  const c = await cfg(true);
  const me = await tg("getMe", {});
  if (!me.ok) return json({ ok: false, error: "BAD_TOKEN" }, 400);
  const hook = await tg("setWebhook", {
    url: c.function_url,
    secret_token: c.webhook_secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!hook.ok) return json({ ok: false, error: "WEBHOOK_FAILED", detail: hook.description }, 502);
  const cmds = (l: Lang) => [
    { command: "orders", description: l === "uz" ? "Buyurtmalarim" : "Мои заказы" },
    { command: "support", description: l === "uz" ? "Yordam" : "Поддержка" },
    { command: "lang", description: l === "uz" ? "Tilni almashtirish" : "Сменить язык" },
    { command: "stop", description: l === "uz" ? "Xabarnomalarni o‘chirish" : "Отключить уведомления" },
  ];
  await tg("setMyCommands", { commands: cmds("uz") });
  await tg("setMyCommands", { commands: cmds("ru"), language_code: "ru" });
  await tg("setMyCommands", { commands: cmds("uz"), language_code: "uz" });
  await db.rpc("tg_save_setup", { p_bot_username: me.result.username, p_site_url: body.site_url ?? "" });
  cfgCache = null;
  return json({ ok: true, bot_username: me.result.username });
}

// ---------- роутинг ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const path = new URL(req.url).pathname.replace(/^.*\/telegram-bot/, "") || "/";
  outbox = [];
  try {
    if (path === "/setup") return await handleSetup(req);

    const c = await cfg();
    if (path === "/notify") {
      if (req.headers.get("x-bolakay-secret") !== c.webhook_secret) return json({ ok: false }, 401);
      await handleNotify(await req.json());
      return json({ ok: true, sent: outbox.length });
    }
    if (path === "/") {
      if (req.headers.get("x-telegram-bot-api-secret-token") !== c.webhook_secret) return json({ ok: false }, 401);
      const update = await req.json();
      try {
        await handleUpdate(update);
      } catch (e) {
        // Telegram повторяет запросы при ошибке — логируем и отвечаем 200
        console.error("update failed", e);
      }
      const debug = req.headers.get("x-bolakay-debug") === c.webhook_secret;
      return json(debug ? { ok: true, outbox } : { ok: true });
    }
    return json({ ok: false }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
