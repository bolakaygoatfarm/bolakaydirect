// BOLAKAY DIRECT · Telegram-бот для заказов (Supabase Edge Function)
//
//  POST /telegram-shop          — webhook от Telegram (заголовок X-Telegram-Bot-Api-Secret-Token)
//  POST /telegram-shop/notify   — события из базы через pg_net (заголовок x-bolakay-secret)
//  POST /telegram-shop/setup    — подключение бота из админ-панели (JWT администратора)
//  POST /telegram-shop/link     — заказ с сайта внутри Web App привязывается к чату (подпись initData)
//
// Секрет TELEGRAM_SHOP_BOT_TOKEN задаётся в Supabase → Edge Functions → Secrets.
// Заказ оформляется функцией create_order, как на сайте: бот не хранит остатки и не считает цены сам.
import { createClient } from "npm:@supabase/supabase-js@2";

type Lang = "uz" | "ru" | "en";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined;
  } catch {
    return undefined;
  }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("TELEGRAM_SHOP_BOT_TOKEN") ?? "";
// Чат администратора подключён к первому боту: обращения покупателей уходят туда же
const STAFF_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

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
  pickup_grace_minutes: number;
  payment_hold_minutes: number;
  click_enabled: boolean;
  payme_enabled: boolean;
}
let cfgCache: { v: Cfg; at: number } | null = null;
async function cfg(fresh = false): Promise<Cfg> {
  if (!fresh && cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.v;
  const { data, error } = await db.rpc("shop_config");
  if (error) throw new Error(`shop_config: ${error.message}`);
  cfgCache = { v: data as Cfg, at: Date.now() };
  return cfgCache.v;
}

// ---------- Telegram API ----------
// outbox — для отладки: что бот отправил бы в Telegram за этот запрос
let outbox: { method: string; payload: Record<string, unknown> }[] = [];
async function tg(method: string, payload: Record<string, unknown>, token = TOKEN) {
  outbox.push({ method, payload });
  if (!token) return { ok: false, description: "bot token is not set" };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await r.json().catch(() => ({ ok: false }));
  if (!res.ok && !/message is not modified/.test(res.description ?? "")) console.error(`telegram ${method} failed`, JSON.stringify(res));
  return res;
}

type Button = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isPublicUrl = (u: string) => /^https:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u);
const cb = (text: string, callback_data: string): Button => ({ text, callback_data });

/** Кнопка Web App. Telegram принимает только https, поэтому на localhost её просто нет */
const webApp = (text: string, url: string): Button[] => (isPublicUrl(url) ? [{ text, web_app: { url } }] : []);

function messageExtras(rows: Button[][], image?: string | null) {
  const kb = rows.filter((r) => r.length);
  return {
    parse_mode: "HTML",
    link_preview_options: image && /^https:\/\//.test(image)
      ? { url: image, prefer_large_media: true, show_above_text: true }
      : { is_disabled: true },
    ...(kb.length ? { reply_markup: { inline_keyboard: kb } } : {}),
  };
}

const send = (chatId: number, text: string, rows: Button[][] = [], image?: string | null) =>
  tg("sendMessage", { chat_id: chatId, text, ...messageExtras(rows, image) });

// ---------- тексты ----------
const T = {
  uz: {
    welcome: "Assalomu alaykum! Bu <b>BOLAKAY DIRECT</b> — echki fermasi mahsulotlari to‘g‘ridan-to‘g‘ri.\n\nBuyurtmani shu yerda yoki do‘kon ilovasida berishingiz mumkin. Mahsulot siz uchun band qilinadi, muzlatgichdan 4 xonali kod bilan olasiz.",
    shop: "🛍 Do‘konni ochish", order_here: "🛒 Chatda buyurtma berish", orders: "🧾 Buyurtmalarim", support: "🆘 Yordam", language: "🌐 Til",
    choose_lang: "Tilni tanlang:", lang_set: "Til: o‘zbekcha 🇺🇿",
    choose_point: "📍 Nuqtani tanlang:", no_points: "Hozir ishlayotgan nuqtalar yo‘q. Keyinroq urinib ko‘ring.",
    hours: "Ish vaqti", choose_product: "Mahsulotni tanlang:", out: "tugagan",
    back: "← Orqaga", to_catalog: "← Katalog", to_points: "📍 Boshqa nuqta", cart: "🛒 Savat", home: "🏠 Bosh menyu",
    produced: "Ishlab chiqarilgan", sell_until: "Sotuvda", left: "Qoldi", pcs: "dona",
    composition: "Tarkibi", storage: "Saqlash", in_cart: "savatda",
    max_reached: "Bor qoldiq shuncha", not_in_stock: "Hozir mavjud emas. Yangi partiya kelganda xabar beramiz.",
    notify_btn: "🔔 Kelganda xabar berish", notify_qty: "Nechta kerak? Partiya kelganda shu yerga xabar yuboramiz.",
    notify_ok: "✅ Yozib qo‘ydik. Yangi partiya kelganda xabar beramiz.",
    cart_title: "🛒 <b>Savat</b>", cart_empty: "Savat bo‘sh.", clear: "🗑 Tozalash", checkout: "Rasmiylashtirish", total: "Jami",
    cart_changed: "Qoldiqlar o‘zgardi, savat yangilandi.",
    ask_phone: "📱 Buyurtma uchun telefon raqami kerak. Tugmani bosing yoki raqamni yozing: 90 123 45 67",
    share_phone: "📱 Raqamni yuborish", phone_ok: "✅ Raqam saqlandi:", bad_phone: "Raqamni to‘g‘ri kiriting: 90 123 45 67",
    when: "🕒 <b>Qachon olasiz?</b>", today: "Bugun", tomorrow: "Ertaga", take_now: "⚡ Hozir olaman", no_slots: "Bu kunga bo‘sh vaqt yo‘q. Boshqa kunni tanlang.",
    confirm: "<b>Buyurtmani tekshiring</b>", pickup: "Olib ketish", hold: "Band qilingan vaqt", name: "Ism", phone: "Telefon", comment: "Izoh", point: "Nuqta",
    pay: "To‘lov: olayotganda", pay_note: "Oldindan to‘lov shart emas.",
    consent: "Tugmani bosish orqali buyurtmani bajarish uchun telefon raqamim qayta ishlanishiga roziman.",
    pay_with: (p: string) => `💳 ${p} orqali to‘lash`, pay_btn: "💳 To‘lash", pay_online: "To‘lov", pay_fail: "To‘lov sahifasini ochib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.",
    pay_created: (m: number) => `🆕 Buyurtma yaratildi. ${m} daqiqa ichida to‘lang, aks holda bron bekor qilinadi. Olish kodi to‘lovdan keyin keladi.`,
    place: "✅ Band qilish", edit_phone: "✏️ Telefon", edit_name: "✏️ Ism", edit_comment: "💬 Izoh", edit_time: "🕒 Vaqt",
    ask_name: "Ismingizni yozing:", ask_comment: "Izohni yozing (300 belgigacha):", cancel_input: "← Bekor qilish", too_long: "Juda uzun. Qisqaroq yozing.",
    created: "🆕 Buyurtma qabul qilindi! Mahsulot siz uchun band qilindi.",
    order: "Buyurtma", code: "Olish kodi", open_order: "Buyurtmani ochish", cancel: "❌ Bekor qilish", repeat: "🔁 Takrorlash",
    cancel_q: "Buyurtma bekor qilinsinmi?", cancel_yes: "Ha, bekor qilish", cancel_no: "Yo‘q",
    orders_title: "🧾 <b>So‘nggi buyurtmalar</b>", orders_empty: "Buyurtmalar yo‘q.",
    repeat_missing: "Hozir mavjud emas", repeat_none: "Bu buyurtmadagi mahsulotlar hozir mavjud emas.",
    st: { pending_payment: "To‘lov kutilmoqda", confirmed: "Band qilindi", issued: "Berildi", cancelled: "Bekor qilindi", expired: "Muddati tugadi" } as Record<string, string>,
    ev_issued: "✅ Buyurtma berildi. Xaridingiz uchun rahmat!", ev_cancelled: "❌ Buyurtma bekor qilindi.",
    ev_expired: "⌛ Band qilish muddati tugadi, buyurtma bekor qilindi. Kerak bo‘lsa, qayta buyurtma bering.",
    batch: (n: string, p: string) => `🥛 Yangi partiya keldi: <b>${n}</b> — ${p} nuqtasida. Hozir band qilishingiz mumkin.`,
    order_now: "Buyurtma berish",
    support_prompt: "Savolingizni bitta xabarda yozing — administrator shu yerda javob beradi.",
    support_sent: "✅ Xabaringiz administratorga yuborildi.", support_off: "Yordam telefoni:", support_none: "Yordam xizmati hozircha ulanmagan. Keyinroq urinib ko‘ring.",
    muted: "Xabarnomalar o‘chirildi. Qayta yoqish uchun /start bosing.",
    help: "Buyruqlar:\n/order — chatda buyurtma\n/orders — buyurtmalarim\n/support — yordam\n/lang — til\n/stop — xabarnomalarni o‘chirish",
    errors: {
      INSUFFICIENT_STOCK: "Afsuski, ba’zi mahsulotlar tugab qoldi. Savatni yangilang.", BATCH_UNAVAILABLE: "Mahsulotlardan biri endi sotuvda emas. Savatni yangilang.",
      SLOT_PASSED: "Tanlangan vaqt o‘tib ketdi. Boshqa vaqtni tanlang.", INVALID_SLOT: "Vaqt oralig‘ini tanlang.", INVALID_PHONE: "Raqamni to‘g‘ri kiriting: 90 123 45 67",
      TOO_MANY_OPEN_ORDERS: "Sizda 3 ta faol buyurtma bor. Avval ularni oling yoki bekor qiling.", FRIDGE_UNAVAILABLE: "Bu nuqta vaqtincha ishlamayapti.",
      CANNOT_CANCEL: "Bu buyurtmani bekor qilib bo‘lmaydi.", TOO_MANY_PREORDERS: "Faol so‘rovlar soni chegaradan oshdi.", generic: "Xatolik yuz berdi. Qayta urinib ko‘ring.",
    } as Record<string, string>,
    sum: "so‘m", months: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  },
  ru: {
    welcome: "Здравствуйте! Это <b>BOLAKAY DIRECT</b> — продукция козьей фермы напрямую.\n\nЗаказать можно здесь в чате или в приложении магазина. Товар бронируется за вами, забираете из холодильника по 4-значному коду.",
    shop: "🛍 Открыть магазин", order_here: "🛒 Заказать в чате", orders: "🧾 Мои заказы", support: "🆘 Поддержка", language: "🌐 Язык",
    choose_lang: "Выберите язык:", lang_set: "Язык: русский 🇷🇺",
    choose_point: "📍 Выберите точку:", no_points: "Сейчас нет работающих точек. Попробуйте позже.",
    hours: "Часы работы", choose_product: "Выберите товар:", out: "нет в наличии",
    back: "← Назад", to_catalog: "← Каталог", to_points: "📍 Другая точка", cart: "🛒 Корзина", home: "🏠 Главное меню",
    produced: "Произведено", sell_until: "В продаже до", left: "Осталось", pcs: "шт",
    composition: "Состав", storage: "Хранение", in_cart: "в корзине",
    max_reached: "Больше нет в наличии", not_in_stock: "Сейчас нет в наличии. Можем сообщить, когда придёт новая партия.",
    notify_btn: "🔔 Сообщить о поступлении", notify_qty: "Сколько нужно? Когда придёт партия, напишем сюда.",
    notify_ok: "✅ Записали. Сообщим, когда придёт новая партия.",
    cart_title: "🛒 <b>Корзина</b>", cart_empty: "Корзина пуста.", clear: "🗑 Очистить", checkout: "Оформить", total: "Итого",
    cart_changed: "Остатки изменились, корзина обновлена.",
    ask_phone: "📱 Для заказа нужен номер телефона. Нажмите кнопку или напишите номер: 90 123 45 67",
    share_phone: "📱 Отправить номер", phone_ok: "✅ Номер сохранён:", bad_phone: "Введите номер в формате 90 123 45 67",
    when: "🕒 <b>Когда заберёте?</b>", today: "Сегодня", tomorrow: "Завтра", take_now: "⚡ Заберу сейчас", no_slots: "На этот день нет свободного времени. Выберите другой.",
    confirm: "<b>Проверьте заказ</b>", pickup: "Получение", hold: "Бронь держится до", name: "Имя", phone: "Телефон", comment: "Комментарий", point: "Точка",
    pay: "Оплата: при получении", pay_note: "Предоплата не нужна.",
    consent: "Нажимая кнопку, вы соглашаетесь на обработку номера телефона для выполнения заказа.",
    pay_with: (p: string) => `💳 Оплатить через ${p}`, pay_btn: "💳 Оплатить", pay_online: "Оплата", pay_fail: "Не удалось открыть оплату. Попробуйте чуть позже.",
    pay_created: (m: number) => `🆕 Заказ создан. Оплатите в течение ${m} минут, иначе бронь снимется. Код получения придёт после оплаты.`,
    place: "✅ Забронировать", edit_phone: "✏️ Телефон", edit_name: "✏️ Имя", edit_comment: "💬 Комментарий", edit_time: "🕒 Время",
    ask_name: "Напишите ваше имя:", ask_comment: "Напишите комментарий (до 300 символов):", cancel_input: "← Отмена", too_long: "Слишком длинно. Напишите короче.",
    created: "🆕 Заказ принят! Товар зарезервирован за вами.",
    order: "Заказ", code: "Код получения", open_order: "Открыть заказ", cancel: "❌ Отменить", repeat: "🔁 Повторить",
    cancel_q: "Отменить заказ?", cancel_yes: "Да, отменить", cancel_no: "Нет",
    orders_title: "🧾 <b>Последние заказы</b>", orders_empty: "Заказов нет.",
    repeat_missing: "Сейчас нет в наличии", repeat_none: "Товаров из этого заказа сейчас нет в наличии.",
    st: { pending_payment: "Ожидает оплаты", confirmed: "Зарезервирован", issued: "Выдан", cancelled: "Отменён", expired: "Истёк" } as Record<string, string>,
    ev_issued: "✅ Заказ выдан. Спасибо за покупку!", ev_cancelled: "❌ Заказ отменён.",
    ev_expired: "⌛ Время резерва истекло, заказ отменён. Если нужно — оформите заново.",
    batch: (n: string, p: string) => `🥛 Пришла новая партия: <b>${n}</b> в точке ${p}. Можно забронировать сейчас.`,
    order_now: "Заказать",
    support_prompt: "Напишите вопрос одним сообщением — администратор ответит здесь.",
    support_sent: "✅ Сообщение передано администратору.", support_off: "Телефон поддержки:", support_none: "Поддержка пока не подключена. Попробуйте позже.",
    muted: "Уведомления отключены. Чтобы включить снова, нажмите /start.",
    help: "Команды:\n/order — заказ в чате\n/orders — мои заказы\n/support — поддержка\n/lang — язык\n/stop — отключить уведомления",
    errors: {
      INSUFFICIENT_STOCK: "К сожалению, часть товара закончилась. Обновите корзину.", BATCH_UNAVAILABLE: "Один из товаров больше не продаётся. Обновите корзину.",
      SLOT_PASSED: "Выбранное время уже прошло. Выберите другое.", INVALID_SLOT: "Выберите интервал получения.", INVALID_PHONE: "Введите номер в формате 90 123 45 67",
      TOO_MANY_OPEN_ORDERS: "У вас уже 3 активных заказа. Сначала заберите или отмените их.", FRIDGE_UNAVAILABLE: "Эта точка временно не работает.",
      CANNOT_CANCEL: "Этот заказ нельзя отменить.", TOO_MANY_PREORDERS: "Слишком много активных заявок на поступление.", generic: "Что-то пошло не так. Попробуйте ещё раз.",
    } as Record<string, string>,
    sum: "сум", months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  },
  en: {
    welcome: "Hello! This is <b>BOLAKAY DIRECT</b> — goat farm products, direct from the farm.\n\nOrder right here in the chat or in the shop app. Your items are reserved, and you collect them from the fridge with a 4-digit code.",
    shop: "🛍 Open the shop", order_here: "🛒 Order in chat", orders: "🧾 My orders", support: "🆘 Support", language: "🌐 Language",
    choose_lang: "Choose a language:", lang_set: "Language: English 🇬🇧",
    choose_point: "📍 Choose a location:", no_points: "No locations are open right now. Please try later.",
    hours: "Opening hours", choose_product: "Choose a product:", out: "out of stock",
    back: "← Back", to_catalog: "← Catalog", to_points: "📍 Another location", cart: "🛒 Cart", home: "🏠 Main menu",
    produced: "Produced", sell_until: "On sale until", left: "Left", pcs: "pcs",
    composition: "Ingredients", storage: "Storage", in_cart: "in cart",
    max_reached: "No more in stock", not_in_stock: "Out of stock right now. We can tell you when a new batch arrives.",
    notify_btn: "🔔 Notify me", notify_qty: "How many do you need? We’ll message you here when a batch arrives.",
    notify_ok: "✅ Done. We’ll let you know when a new batch arrives.",
    cart_title: "🛒 <b>Cart</b>", cart_empty: "Your cart is empty.", clear: "🗑 Clear", checkout: "Checkout", total: "Total",
    cart_changed: "Stock has changed, your cart was updated.",
    ask_phone: "📱 We need a phone number for the order. Press the button or type the number: 90 123 45 67",
    share_phone: "📱 Share my number", phone_ok: "✅ Number saved:", bad_phone: "Enter a number in the format 90 123 45 67",
    when: "🕒 <b>When will you pick it up?</b>", today: "Today", tomorrow: "Tomorrow", take_now: "⚡ Pick up now", no_slots: "No time slots left for this day. Choose another one.",
    confirm: "<b>Check your order</b>", pickup: "Pickup", hold: "Reserved until", name: "Name", phone: "Phone", comment: "Comment", point: "Location",
    pay: "Payment: on pickup", pay_note: "No prepayment needed.",
    consent: "By pressing the button you agree to the processing of your phone number to fulfil the order.",
    pay_with: (p: string) => `💳 Pay with ${p}`, pay_btn: "💳 Pay", pay_online: "Payment", pay_fail: "Couldn’t open the payment page. Please try again shortly.",
    pay_created: (m: number) => `🆕 Order created. Pay within ${m} minutes, otherwise the reservation will be released. Your pickup code will arrive after payment.`,
    place: "✅ Reserve", edit_phone: "✏️ Phone", edit_name: "✏️ Name", edit_comment: "💬 Comment", edit_time: "🕒 Time",
    ask_name: "Type your name:", ask_comment: "Type a comment (up to 300 characters):", cancel_input: "← Cancel", too_long: "Too long. Please shorten it.",
    created: "🆕 Order received! Your items are reserved.",
    order: "Order", code: "Pickup code", open_order: "Open order", cancel: "❌ Cancel", repeat: "🔁 Repeat",
    cancel_q: "Cancel this order?", cancel_yes: "Yes, cancel", cancel_no: "No",
    orders_title: "🧾 <b>Recent orders</b>", orders_empty: "No orders yet.",
    repeat_missing: "Not available now", repeat_none: "Items from this order are not available now.",
    st: { pending_payment: "Awaiting payment", confirmed: "Reserved", issued: "Collected", cancelled: "Cancelled", expired: "Expired" } as Record<string, string>,
    ev_issued: "✅ Order collected. Thank you!", ev_cancelled: "❌ Order cancelled.",
    ev_expired: "⌛ The reservation has expired and the order was cancelled. Order again if you still need it.",
    batch: (n: string, p: string) => `🥛 A new batch has arrived: <b>${n}</b> at ${p}. You can reserve it now.`,
    order_now: "Order",
    support_prompt: "Type your question in one message — an administrator will reply here.",
    support_sent: "✅ Your message was sent to the administrator.", support_off: "Support phone:", support_none: "Support isn’t connected yet. Please try later.",
    muted: "Notifications are off. Press /start to turn them back on.",
    help: "Commands:\n/order — order in chat\n/orders — my orders\n/support — support\n/lang — language\n/stop — turn off notifications",
    errors: {
      INSUFFICIENT_STOCK: "Sorry, some items have sold out. Please refresh your cart.", BATCH_UNAVAILABLE: "One of the items is no longer on sale. Please refresh your cart.",
      SLOT_PASSED: "The selected time has already passed. Choose another one.", INVALID_SLOT: "Choose a pickup time slot.", INVALID_PHONE: "Enter a number in the format 90 123 45 67",
      TOO_MANY_OPEN_ORDERS: "You already have 3 active orders. Pick them up or cancel them first.", FRIDGE_UNAVAILABLE: "This location is temporarily closed.",
      CANNOT_CANCEL: "This order can’t be cancelled.", TOO_MANY_PREORDERS: "Too many active requests.", generic: "Something went wrong. Please try again.",
    } as Record<string, string>,
    sum: "UZS", months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
};

// ---------- время и форматирование (те же правила, что на сайте: src/lib/format.ts) ----------
const TZ = "Asia/Tashkent";
const tzDate = (d: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const tzTime = (d: Date = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function pickupSlots(open: string, close: string, ymd: string): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const o = toMin(open.slice(0, 5));
  const c = toMin(close.slice(0, 5));
  const isToday = ymd === tzDate();
  const now = toMin(tzTime());
  const res: string[] = [];
  for (let s = o; s < c; s += 120) {
    const e = Math.min(s + 120, c);
    if (isToday && e <= now + 15) continue;
    res.push(`${fmt(s)}-${fmt(e)}`);
  }
  return res;
}
const slotEnd = (ymd: string, slot: string) => Date.parse(`${ymd}T${slot.split("-")[1]}:00+05:00`);

function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 9) d = `998${d}`;
  return d.length === 12 && d.startsWith("998") ? `+${d}` : null;
}
/** Заглушка из первоначальных настроек (+998 90 000 00 00) покупателям не показывается */
function realPhone(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 12 && d.startsWith("998") && !/^99890?0{7,}$/.test(d) ? `+${d}` : null;
}
const prettyPhone = (p: string) => p.replace(/^\+(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, "+$1 $2 $3 $4 $5");

const money = (v: number, l: Lang) =>
  l === "en"
    ? `${new Intl.NumberFormat("en-US").format(v)} UZS`
    : `${new Intl.NumberFormat("ru-RU").format(v).replace(/\s/g, " ")} ${T[l].sum}`;
function sizeLabel(label: string | null | undefined, l: Lang) {
  const s = (label ?? "").trim();
  if (l === "ru") return s.replace(/\s*ml\b/i, " мл").replace(/\s*l\b/i, " л").replace(/\s*g\b/i, " г");
  if (l === "en") return s.replace(",", ".").replace(/\s+/g, " ");
  return s.replace(/\s+/g, " ");
}
function day(iso: string, l: Lang) {
  const [, m, d] = (iso.length === 10 ? iso : tzDate(new Date(iso))).split("-").map(Number);
  if (l === "uz") return `${d}-${T.uz.months[m - 1]}`;
  return l === "ru" ? `${d} ${T.ru.months[m - 1]}` : `${d} ${T.en.months[m - 1]}`;
}
function pick(o: Record<string, unknown>, field: string, l: Lang): string {
  const get = (x: string) => (o[`${field}_${x}`] as string | null | undefined) || null;
  return get(l) ?? get("ru") ?? get("uz") ?? "";
}

// ---------- данные ----------
interface Batch { batch_id: string; produced_at: string; sell_until: string; available: number }
interface Product { product_id: string; price: number; size_label: string; image_url: string | null; batches: Batch[]; [k: string]: unknown }
interface Point { code: string; name: string; open_time: string; close_time: string; [k: string]: unknown }
interface Order {
  number: number; token: string; pickup_code: string; status: string; payment_status: string; payment_method: string;
  total: number; pickup_date: string; pickup_slot: string; reserved_until: string;
  fridge: { code: string; name: string; [k: string]: unknown };
  items: { product_id: string; size_label: string; qty: number; price: number; [k: string]: unknown }[];
}
interface CartLine { b: string; p: string; q: number }
interface State {
  point?: string;
  cart?: CartLine[];
  step?: "phone" | "name" | "comment" | "support";
  next?: string; // куда вернуться после ввода телефона
  day?: 0 | 1;
  slot?: string;
  comment?: string;
}
interface User { chat_id: number; lang: Lang; phone: string | null; name: string | null; muted: boolean; state: State }

async function catalog(code: string): Promise<Product[]> {
  const { data, error } = await db.rpc("fridge_catalog", { p_code: code });
  if (error) throw new Error(`fridge_catalog: ${error.message}`);
  const map = new Map<string, Product>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = r.product_id as string;
    let p = map.get(id);
    if (!p) {
      p = { ...r, batches: [] } as unknown as Product;
      map.set(id, p);
    }
    if (r.batch_id && r.available) {
      p.batches.push({ batch_id: r.batch_id as string, produced_at: r.produced_at as string, sell_until: r.sell_until as string, available: r.available as number });
    }
  }
  return [...map.values()];
}
async function points(): Promise<Point[]> {
  const { data, error } = await db.rpc("shop_points");
  if (error) throw new Error(`shop_points: ${error.message}`);
  return (data ?? []) as Point[];
}
const findPoint = async (code?: string) => (code ? (await points()).find((p) => p.code === code) ?? null : null);
const save = (chatId: number, patch: Record<string, unknown>) => db.rpc("shop_user_save", { p_chat_id: chatId, p_patch: patch });
const errCode = (m: string | undefined, t: (typeof T)[Lang]) => t.errors[(m ?? "").match(/[A-Z_]{5,}/)?.[0] ?? ""] ?? t.errors.generic;

// ---------- заказ ----------
function orderCard(o: Order, l: Lang) {
  const t = T[l];
  const active = o.status === "confirmed" || o.status === "pending_payment";
  const lines = [
    `🧾 <b>${t.order} № ${o.number}</b> — ${esc(t.st[o.status] ?? o.status)}`,
    `📍 ${t.point} ${esc(o.fridge.name)}, ${esc(pick(o.fridge, "address", l))}`,
    `🕒 ${t.pickup}: ${day(o.pickup_date, l)}, ${esc(o.pickup_slot.replace("-", "–"))}`,
  ];
  // До онлайн-оплаты кода нет: выдать такой заказ всё равно нельзя
  if (o.status === "confirmed") lines.push(`🔑 ${t.code}: <b>${esc(o.pickup_code)}</b>`);
  lines.push("");
  for (const i of o.items) lines.push(`• ${esc(pick(i, "name", l))} ${esc(sizeLabel(i.size_label, l))} × ${i.qty} — ${money(i.price * i.qty, l)}`);
  lines.push(`💰 ${t.total}: <b>${money(o.total, l)}</b>`);
  if (active && o.payment_status !== "paid") lines.push(o.payment_method === "on_pickup" ? t.pay : `${t.pay_online}: ${o.payment_method === "click" ? "Click" : "Payme"}`);
  return lines.join("\n");
}
function orderButtons(c: Cfg, o: Order, l: Lang): Button[][] {
  const t = T[l];
  const rows: Button[][] = [webApp(t.open_order, `${c.site_url}/${l}/order/${o.token}`)];
  if (o.status === "pending_payment") rows.unshift([cb(t.pay_btn, `pay:${o.token}`)]);
  if ((o.status === "confirmed" || o.status === "pending_payment") && o.payment_status !== "paid") rows.push([cb(t.cancel, `cx:${o.token}`)]);
  if (o.status !== "confirmed" && o.status !== "pending_payment") rows.push([cb(t.repeat, `rp:${o.token}`)]);
  return rows;
}

// ---------- экран: при нажатии кнопки редактируем сообщение, иначе отправляем новое ----------
interface Ctx { c: Cfg; chatId: number; u: User; l: Lang; messageId?: number; toast?: string; from?: TgUser }

async function show(x: Ctx, text: string, rows: Button[][] = [], image?: string | null) {
  if (x.messageId) {
    const r = await tg("editMessageText", { chat_id: x.chatId, message_id: x.messageId, text, ...messageExtras(rows, image) });
    if (r.ok || /message is not modified/.test(r.description ?? "")) return r;
  }
  return send(x.chatId, text, rows, image);
}

function homeRows(c: Cfg, l: Lang): Button[][] {
  const t = T[l];
  return [
    webApp(t.shop, `${c.site_url}/${l}`),
    [cb(t.order_here, "points")],
    [cb(t.orders, "orders"), cb(t.support, "support")],
    [cb(t.language, "lang")],
  ];
}
const showHome = (x: Ctx) => show(x, T[x.l].welcome, homeRows(x.c, x.l));

async function showPoints(x: Ctx): Promise<unknown> {
  const t = T[x.l];
  const list = await points();
  if (!list.length) return show(x, t.no_points, [[cb(t.home, "home")]]);
  if (list.length === 1) return openPoint(x, list[0].code);
  return show(x, t.choose_point, [
    ...list.map((p) => [cb(`${p.name} · ${pick(p, "address", x.l)}`.slice(0, 60), `pt:${p.code}`)]),
    [cb(t.home, "home")],
  ]);
}

async function openPoint(x: Ctx, code: string) {
  const s = x.u.state;
  // Корзина привязана к партиям конкретной точки
  if (s.point !== code) {
    x.u.state = { point: code };
    await save(x.chatId, { state: x.u.state });
  }
  return showCatalog(x);
}

function cartSum(cart: CartLine[], products: Product[]) {
  return cart.reduce((sum, l) => sum + (products.find((p) => p.product_id === l.p)?.price ?? 0) * l.q, 0);
}

async function showCatalog(x: Ctx) {
  const t = T[x.l];
  const code = x.u.state.point;
  const point = await findPoint(code);
  if (!point) return showPoints(x);
  const products = await catalog(point.code);
  const cart = x.u.state.cart ?? [];
  const multi = (await points()).length > 1;
  const count = cart.reduce((n, i) => n + i.q, 0);
  const text = [
    `📍 <b>${esc(point.name)}</b>, ${esc(pick(point, "address", x.l))}`,
    pick(point, "landmark", x.l) ? esc(pick(point, "landmark", x.l)) : "",
    `🕒 ${t.hours}: ${point.open_time.slice(0, 5)}–${point.close_time.slice(0, 5)}`,
    "",
    t.choose_product,
  ].filter((v, i) => v !== "" || i === 3).join("\n");
  const rows: Button[][] = products.map((p) => {
    const label = `${pick(p, "name", x.l)} ${sizeLabel(p.size_label, x.l)}`;
    return [cb(p.batches.length ? `${label} · ${money(p.price, x.l)}` : `${label} · ${t.out}`, `p:${p.product_id}`)];
  });
  if (count) rows.push([cb(`${t.cart} (${count}) · ${money(cartSum(cart, products), x.l)}`, "cart")]);
  rows.push(webApp(t.shop, `${x.c.site_url}/${x.l}/point/${point.code}`));
  rows.push(multi ? [cb(t.to_points, "points"), cb(t.home, "home")] : [cb(t.home, "home")]);
  return show(x, text, rows);
}

async function showProduct(x: Ctx, productId: string) {
  const t = T[x.l];
  const code = x.u.state.point;
  if (!code) return showPoints(x);
  const p = (await catalog(code)).find((v) => v.product_id === productId);
  if (!p) return showCatalog(x);
  const cart = x.u.state.cart ?? [];
  const lines = [`<b>${esc(pick(p, "name", x.l))} ${esc(sizeLabel(p.size_label, x.l))}</b>`, `💰 <b>${money(p.price, x.l)}</b>`];
  const desc = pick(p, "description", x.l);
  if (desc) lines.push("", esc(desc));
  const comp = pick(p, "composition", x.l);
  if (comp) lines.push("", `${t.composition}: ${esc(comp)}`);
  const stor = pick(p, "storage", x.l);
  if (stor) lines.push(`${t.storage}: ${esc(stor)}`);
  const rows: Button[][] = [];
  if (p.batches.length) {
    lines.push("");
    // На сайте партии тоже показаны отдельно: у каждой своя дата и свой остаток
    for (const b of p.batches.slice(0, 3)) {
      lines.push(`📅 ${t.produced}: ${day(b.produced_at, x.l)} · ${t.sell_until} ${day(b.sell_until, x.l)} · ${t.left}: ${b.available} ${t.pcs}`);
      const q = cart.find((l) => l.b === b.batch_id)?.q ?? 0;
      rows.push([
        cb("➖", `q:${b.batch_id}:-`),
        cb(p.batches.length > 1 ? `${day(b.produced_at, x.l)}: ${q}` : `${q} ${t.pcs}`, `p:${p.product_id}`),
        cb("➕", `q:${b.batch_id}:+`),
      ]);
    }
  } else {
    lines.push("", t.not_in_stock);
    rows.push([cb(t.notify_btn, `pre:${p.product_id}`)]);
  }
  const count = cart.reduce((n, i) => n + i.q, 0);
  rows.push(count ? [cb(t.to_catalog, "catalog"), cb(`${t.cart} (${count})`, "cart")] : [cb(t.to_catalog, "catalog")]);
  return show(x, lines.join("\n"), rows, p.image_url);
}

/** Меняет количество партии и остаётся на том же экране */
async function changeQty(x: Ctx, batchId: string, delta: 1 | -1, back: "product" | "cart") {
  const t = T[x.l];
  const code = x.u.state.point;
  if (!code) return showPoints(x);
  const products = await catalog(code);
  const product = products.find((p) => p.batches.some((b) => b.batch_id === batchId));
  const cart = [...(x.u.state.cart ?? [])];
  const line = cart.find((l) => l.b === batchId);
  if (!product) {
    // партия уже распродана или снята: убираем её из корзины
    x.u.state.cart = cart.filter((l) => l.b !== batchId);
    await save(x.chatId, { state: x.u.state });
    x.toast = t.max_reached;
    return back === "cart" ? showCart(x) : showCatalog(x);
  }
  const batch = product.batches.find((b) => b.batch_id === batchId)!;
  const limit = Math.min(batch.available, 20);
  const next = (line?.q ?? 0) + delta;
  if (next > limit) x.toast = t.max_reached;
  const qty = Math.max(0, Math.min(limit, next));
  if (line) line.q = qty;
  else if (qty > 0) cart.push({ b: batchId, p: product.product_id, q: qty });
  x.u.state.cart = cart.filter((l) => l.q > 0);
  await save(x.chatId, { state: x.u.state });
  return back === "cart" ? showCart(x) : showProduct(x, product.product_id);
}

/** Сверяет корзину с текущими остатками: распроданное убирает, количество ограничивает */
async function freshCart(x: Ctx) {
  const products = await catalog(x.u.state.point!);
  const before = x.u.state.cart ?? [];
  const after: CartLine[] = [];
  for (const l of before) {
    const b = products.flatMap((p) => p.batches).find((v) => v.batch_id === l.b);
    if (b) after.push({ ...l, q: Math.min(l.q, b.available, 20) });
  }
  const changed = after.length !== before.length || after.some((l, i) => l.q !== before[i].q);
  if (changed) {
    x.u.state.cart = after;
    await save(x.chatId, { state: x.u.state });
  }
  return { products, cart: after, changed };
}

function cartLines(cart: CartLine[], products: Product[], l: Lang) {
  return cart.map((i) => {
    const p = products.find((v) => v.product_id === i.p)!;
    return `• ${esc(pick(p, "name", l))} ${esc(sizeLabel(p.size_label, l))} × ${i.q} — ${money(p.price * i.q, l)}`;
  });
}

async function showCart(x: Ctx, notice?: string) {
  const t = T[x.l];
  if (!x.u.state.point) return showPoints(x);
  const { products, cart, changed } = await freshCart(x);
  const head = [notice, changed ? t.cart_changed : ""].filter(Boolean).join("\n");
  if (!cart.length) return show(x, `${head ? `${head}\n\n` : ""}${t.cart_empty}`, [[cb(t.to_catalog, "catalog")]]);
  const total = cartSum(cart, products);
  const rows: Button[][] = cart.map((i) => {
    const p = products.find((v) => v.product_id === i.p)!;
    return [cb("➖", `c:${i.b}:-`), cb(`${pick(p, "name", x.l)} × ${i.q}`.slice(0, 40), `p:${p.product_id}`), cb("➕", `c:${i.b}:+`)];
  });
  rows.push([cb(`✅ ${t.checkout} · ${money(total, x.l)}`, "checkout")]);
  rows.push([cb(t.to_catalog, "catalog"), cb(t.clear, "clear")]);
  return show(x, [head, head ? "" : null, t.cart_title, "", ...cartLines(cart, products, x.l), "", `💰 ${t.total}: <b>${money(total, x.l)}</b>`].filter((v) => v !== null).join("\n"), rows);
}

// ---------- оформление ----------
async function askPhone(x: Ctx, next: string) {
  const t = T[x.l];
  x.u.state = { ...x.u.state, step: "phone", next };
  await save(x.chatId, { state: x.u.state });
  return tg("sendMessage", {
    chat_id: x.chatId,
    text: t.ask_phone,
    reply_markup: { keyboard: [[{ text: t.share_phone, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  });
}

async function showCheckout(x: Ctx) {
  if (!x.u.state.point) return showPoints(x);
  const { cart } = await freshCart(x);
  if (!cart.length) return showCart(x);
  if (!x.u.phone) return askPhone(x, "when");
  return x.u.state.slot ? showConfirm(x) : showWhen(x);
}

/** Самая ранняя дата окончания продажи в корзине: интервал получения должен закончиться раньше неё */
function lastSell(cart: CartLine[], products: Product[]) {
  const dates = cart.map((l) => products.flatMap((p) => p.batches).find((b) => b.batch_id === l.b)).filter(Boolean).map((b) => Date.parse(b!.sell_until));
  return dates.length ? Math.min(...dates) : Infinity;
}
function slotsFor(point: Point, ymd: string, limit: number) {
  return pickupSlots(point.open_time, point.close_time, ymd).filter((s) => slotEnd(ymd, s) <= limit);
}

async function showWhen(x: Ctx, chosenDay?: 0 | 1) {
  const t = T[x.l];
  const point = await findPoint(x.u.state.point);
  if (!point) return showPoints(x);
  const { products, cart } = await freshCart(x);
  if (!cart.length) return showCart(x);
  const limit = lastSell(cart, products);
  const today = tzDate();
  const tomorrow = addDays(today, 1);
  const tomorrowOpen = slotsFor(point, tomorrow, limit).length > 0;
  const active: 0 | 1 = (chosenDay ?? x.u.state.day ?? 0) === 1 && tomorrowOpen ? 1 : 0;
  const ymd = active === 0 ? today : tomorrow;
  const slots = slotsFor(point, ymd, limit);
  const rows: Button[][] = [];
  // «Заберу сейчас» — текущий интервал сегодняшнего дня, пока точка работает
  const now = tzTime();
  const nowSlot = slotsFor(point, today, limit).find((s) => s.split("-")[0] <= now && now < s.split("-")[1]);
  if (nowSlot) rows.push([cb(t.take_now, `sl:0:${nowSlot}`)]);
  const dayBtn = (n: 0 | 1) => cb(`${active === n ? "● " : ""}${n === 0 ? t.today : t.tomorrow} · ${day(n === 0 ? today : tomorrow, x.l)}`, `day:${n}`);
  rows.push(tomorrowOpen ? [dayBtn(0), dayBtn(1)] : [dayBtn(0)]);
  for (let i = 0; i < slots.length; i += 2) {
    rows.push(slots.slice(i, i + 2).map((s) => cb(s.replace("-", "–"), `sl:${active}:${s}`)));
  }
  rows.push([cb(t.back, "cart")]);
  return show(x, slots.length ? t.when : `${t.when}\n\n${t.no_slots}`, rows);
}

async function showConfirm(x: Ctx, notice?: string) {
  const t = T[x.l];
  const s = x.u.state;
  const point = await findPoint(s.point);
  if (!point) return showPoints(x);
  const { products, cart, changed } = await freshCart(x);
  if (!cart.length) return showCart(x);
  const dayN = s.day ?? 0;
  const ymd = dayN === 0 ? tzDate() : addDays(tzDate(), 1);
  const limit = lastSell(cart, products);
  // Выбранное время могло пройти или выйти за срок продажи, пока человек оформлял заказ
  if (!s.slot || !slotsFor(point, ymd, limit).includes(s.slot)) {
    x.u.state = { ...s, slot: undefined };
    await save(x.chatId, { state: x.u.state });
    return showWhen(x);
  }
  if (!x.u.phone) return askPhone(x, "confirm");
  const total = cartSum(cart, products);
  const holdMs = Math.min(slotEnd(ymd, s.slot) + x.c.pickup_grace_minutes * 60000, limit);
  const lines: string[] = [];
  if (notice) lines.push(notice, "");
  if (changed) lines.push(t.cart_changed, "");
  lines.push(
    t.confirm, "",
    `📍 ${t.point} ${esc(point.name)}, ${esc(pick(point, "address", x.l))}`,
    `🕒 ${t.pickup}: ${day(ymd, x.l)}, ${s.slot.replace("-", "–")}`,
    `⏳ ${t.hold} ${tzTime(new Date(holdMs))}`,
    `☎️ ${t.phone}: ${prettyPhone(x.u.phone)}`,
  );
  if (x.u.name) lines.push(`👤 ${t.name}: ${esc(x.u.name)}`);
  if (s.comment) lines.push(`💬 ${t.comment}: ${esc(s.comment)}`);
  lines.push(
    "",
    ...cartLines(cart, products, x.l),
    `💰 ${t.total}: <b>${money(total, x.l)}</b>`,
    `${t.pay}. ${t.pay_note}`,
    "",
    `<i>${t.consent}</i>`,
  );
  return show(x, lines.join("\n"), [
    [cb(`${t.place} · ${money(total, x.l)}`, "place")],
    ...(x.c.payme_enabled ? [[cb(t.pay_with("Payme"), "place:payme")]] : []),
    ...(x.c.click_enabled ? [[cb(t.pay_with("Click"), "place:click")]] : []),
    [cb(t.edit_time, "when"), cb(t.edit_phone, "e:phone")],
    [cb(t.edit_name, "e:name"), cb(t.edit_comment, "e:comment")],
    [cb(t.back, "cart")],
  ]);
}

/** Ссылка на Payme или Click от функции payments */
async function paymentLink(token: string, l: Lang): Promise<string | null> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/payments/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, lang: l }),
    });
    const res = await r.json();
    return res.ok && typeof res.url === "string" ? res.url : null;
  } catch {
    return null;
  }
}

async function placeOrder(x: Ctx, method: "on_pickup" | "payme" | "click" = "on_pickup") {
  const t = T[x.l];
  const s = x.u.state;
  if (!s.point || !s.cart?.length) return showHome(x);
  if (!x.u.phone) return askPhone(x, "confirm");
  if (!s.slot) return showWhen(x);
  const ymd = (s.day ?? 0) === 0 ? tzDate() : addDays(tzDate(), 1);
  const { data, error } = await db.rpc("shop_create_order", {
    p_chat_id: x.chatId,
    p_fridge_code: s.point,
    p_phone: x.u.phone,
    p_name: x.u.name,
    p_items: s.cart.map((l) => ({ batch_id: l.b, qty: l.q })),
    p_pickup_date: ymd,
    p_pickup_slot: s.slot,
    p_comment: s.comment ?? null,
    p_method: method,
  });
  if (error) {
    if (/DUPLICATE_ORDER/.test(error.message)) return; // второе нажатие той же кнопки: заказ уже создан
    const msg = errCode(error.message, t);
    if (/STOCK|BATCH/.test(error.message)) return showCart(x, msg);
    if (/SLOT/.test(error.message)) {
      x.u.state = { ...s, slot: undefined };
      await save(x.chatId, { state: x.u.state });
      x.toast = msg;
      return showWhen(x);
    }
    if (/PHONE/.test(error.message)) {
      x.u.phone = null;
      await save(x.chatId, { phone: null });
      return askPhone(x, "confirm");
    }
    return showConfirm(x, msg);
  }
  x.u.state = { point: s.point };
  await save(x.chatId, { state: x.u.state });
  const o = data as Order;
  if (method !== "on_pickup") {
    const url = await paymentLink(o.token, x.l);
    const rows = orderButtons(x.c, o, x.l);
    if (url) rows[0] = [{ text: t.pay_btn, url }]; // первая строка — кнопка оплаты: сразу открываем форму
    return show(x, `${t.pay_created(x.c.payment_hold_minutes)}${url ? "" : `\n\n${t.pay_fail}`}\n\n${orderCard(o, x.l)}`, rows);
  }
  return show(x, `${t.created}\n\n${orderCard(o, x.l)}`, [...orderButtons(x.c, o, x.l), [cb(t.home, "home")]]);
}

// ---------- заказы ----------
async function showOrders(x: Ctx) {
  const t = T[x.l];
  const { data } = await db.rpc("shop_orders", { p_chat_id: x.chatId });
  const orders = (data ?? []) as Order[];
  if (!orders.length) return show(x, t.orders_empty, [[cb(t.order_here, "points")], [cb(t.home, "home")]]);
  await show(x, t.orders_title);
  x.messageId = undefined;
  for (const o of [...orders].reverse()) await send(x.chatId, orderCard(o, x.l), orderButtons(x.c, o, x.l));
}

async function repeatOrder(x: Ctx, token: string) {
  const t = T[x.l];
  const { data } = await db.rpc("shop_order", { p_chat_id: x.chatId, p_token: token });
  const o = data as Order | null;
  if (!o) return showHome(x);
  const products = await catalog(o.fridge.code);
  const cart: CartLine[] = x.u.state.point === o.fridge.code ? [...(x.u.state.cart ?? [])] : [];
  const missing: string[] = [];
  for (const i of o.items) {
    // Партии заказа уже могли закончиться, поэтому как на сайте берём самую свежую
    const p = products.find((v) => v.product_id === i.product_id);
    const b = p?.batches[0];
    if (!b) {
      missing.push(`${pick(i, "name", x.l)} ${sizeLabel(i.size_label, x.l)}`);
      continue;
    }
    const ex = cart.find((l) => l.b === b.batch_id);
    if (ex) ex.q = Math.min(b.available, 20, ex.q + i.qty);
    else cart.push({ b: b.batch_id, p: i.product_id, q: Math.min(b.available, 20, i.qty) });
  }
  x.u.state = { point: o.fridge.code, cart };
  await save(x.chatId, { state: x.u.state });
  x.messageId = undefined; // карточка заказа остаётся в истории
  if (!cart.length) return send(x.chatId, t.repeat_none, [[cb(t.to_catalog, "catalog")]]);
  return showCart(x, missing.length ? `${t.repeat_missing}: ${esc(missing.join(", "))}` : undefined);
}

// ---------- поддержка ----------
async function forwardSupport(x: Ctx, text: string) {
  const t = T[x.l];
  if (!x.c.admin_chat_id || !STAFF_TOKEN) {
    const phone = realPhone(x.c.support_phone);
    return send(x.chatId, phone ? `${t.support_off} ${prettyPhone(phone)}` : t.support_none, [[cb(t.home, "home")]]);
  }
  const who = [x.from?.first_name, x.from?.last_name, x.from?.username ? `@${x.from.username}` : null, x.u.phone].filter(Boolean).join(" · ");
  // Метка #s<chat> говорит первому боту, что ответ надо отправить через этого бота
  await tg("sendMessage", {
    chat_id: Number(x.c.admin_chat_id),
    text: `🆘 <b>Обращение из бота заказов</b> #s${x.chatId}\n${esc(who)}\n\n${esc(text)}\n\n<i>Ответьте на это сообщение (Reply), чтобы написать покупателю.</i>`,
    parse_mode: "HTML",
  }, STAFF_TOKEN);
  return send(x.chatId, t.support_sent, [[cb(t.home, "home")]]);
}

// ---------- webhook ----------
interface TgUser { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string }
interface TgMessage {
  message_id: number; text?: string; chat: { id: number; type: string }; from?: TgUser;
  contact?: { phone_number: string; user_id?: number };
}

function guessLang(code?: string): Lang {
  if (code?.startsWith("ru")) return "ru";
  if (code?.startsWith("en")) return "en";
  return "uz";
}

async function loadUser(chatId: number, from?: TgUser): Promise<User> {
  const { data } = await db.rpc("shop_user", { p_chat_id: chatId });
  if (data) return { ...(data as User), state: ((data as User).state ?? {}) as State };
  const lang = guessLang(from?.language_code);
  const name = from?.first_name?.slice(0, 60) ?? null;
  await save(chatId, { lang, name, username: from?.username ?? null });
  return { chat_id: chatId, lang, phone: null, name, muted: false, state: {} };
}

/** Кнопка меню рядом с полем ввода открывает сайт на языке человека */
const setMenuButton = (c: Cfg, chatId: number, l: Lang) =>
  isPublicUrl(c.site_url)
    ? tg("setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app", text: "BOLAKAY", web_app: { url: `${c.site_url}/${l}` } } })
    : Promise.resolve(null);

async function afterPhone(x: Ctx, next?: string) {
  if (next?.startsWith("pre:")) return showPreorderQty(x, next.slice(4));
  if (next === "confirm") return showConfirm(x);
  return showWhen(x);
}

async function showPreorderQty(x: Ctx, productId: string) {
  const t = T[x.l];
  if (!x.u.phone) return askPhone(x, `pre:${productId}`);
  return show(x, t.notify_qty, [
    [1, 2, 3, 5].map((n) => cb(String(n), `prq:${productId}:${n}`)),
    [cb(t.back, `p:${productId}`)],
  ]);
}

async function placePreorder(x: Ctx, productId: string, qty: number) {
  const t = T[x.l];
  const point = x.u.state.point;
  if (!point || !x.u.phone) return showPoints(x);
  const { error } = await db.rpc("shop_create_preorder", { p_chat_id: x.chatId, p_fridge_code: point, p_phone: x.u.phone, p_product_id: productId, p_qty: qty });
  return show(x, error ? errCode(error.message, t) : t.notify_ok, [[cb(t.to_catalog, "catalog")]]);
}

async function onCallback(cq: { id: string; data?: string; from: TgUser; message?: TgMessage }) {
  const c = await cfg();
  const chatId = cq.message?.chat.id ?? cq.from.id;
  const u = await loadUser(chatId, cq.from);
  const x: Ctx = { c, chatId, u, l: u.lang, messageId: cq.message?.message_id, from: cq.from };
  const d = cq.data ?? "";
  // Любая кнопка отменяет незавершённый ввод текста
  if (u.state.step) {
    u.state = { ...u.state, step: undefined, next: undefined };
    await save(chatId, { state: u.state });
  }
  try {
    await route(x, d);
  } finally {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, ...(x.toast ? { text: x.toast } : {}) });
  }
}

async function route(x: Ctx, d: string) {
  const t = T[x.l];
  const s = x.u.state;
  if (d === "home") return showHome(x);
  if (d === "points") return showPoints(x);
  if (d === "catalog") return showCatalog(x);
  if (d === "cart") return showCart(x);
  if (d === "orders") return showOrders(x);
  if (d === "checkout") return showCheckout(x);
  if (d === "when") return showWhen(x);
  if (d === "place") return placeOrder(x);
  if (d === "place:payme" && x.c.payme_enabled) return placeOrder(x, "payme");
  if (d === "place:click" && x.c.click_enabled) return placeOrder(x, "click");
  if (d === "confirm") return showConfirm(x);
  if (d.startsWith("pay:")) {
    // Только свой заказ: чужой токен в кнопку подставить нельзя
    const { data } = await db.rpc("shop_order", { p_chat_id: x.chatId, p_token: d.slice(4) });
    if (!data) return;
    const o = data as Order;
    if (o.status !== "pending_payment") return show(x, orderCard(o, x.l), orderButtons(x.c, o, x.l));
    const url = await paymentLink(o.token, x.l);
    if (!url) {
      x.toast = t.pay_fail;
      return;
    }
    const rows = orderButtons(x.c, o, x.l);
    rows[0] = [{ text: t.pay_btn, url }];
    return show(x, orderCard(o, x.l), rows);
  }
  if (d === "lang") {
    return show(x, t.choose_lang, [[cb("🇺🇿 O‘zbekcha", "setlang:uz"), cb("🇷🇺 Русский", "setlang:ru"), cb("🇬🇧 English", "setlang:en")]]);
  }
  if (d.startsWith("setlang:")) {
    const l = d.slice(8) as Lang;
    if (!T[l]) return;
    await save(x.chatId, { lang: l });
    x.l = l;
    x.u.lang = l;
    x.toast = T[l].lang_set;
    await setMenuButton(x.c, x.chatId, l);
    return showHome(x);
  }
  if (d === "support") {
    x.u.state = { ...s, step: "support" };
    await save(x.chatId, { state: x.u.state });
    return show(x, t.support_prompt, [[cb(t.cancel_input, "home")]]);
  }
  if (d === "clear") {
    x.u.state = { point: s.point };
    await save(x.chatId, { state: x.u.state });
    return showCatalog(x);
  }
  if (d.startsWith("pt:")) return openPoint(x, d.slice(3));
  if (d.startsWith("p:")) return showProduct(x, d.slice(2));
  if (d.startsWith("q:") || d.startsWith("c:")) {
    const [kind, batch, sign] = d.split(":");
    return changeQty(x, batch, sign === "+" ? 1 : -1, kind === "c" ? "cart" : "product");
  }
  if (d.startsWith("day:")) {
    const n = d.slice(4) === "1" ? 1 : 0;
    x.u.state = { ...s, day: n, slot: undefined };
    await save(x.chatId, { state: x.u.state });
    return showWhen(x, n);
  }
  if (d.startsWith("sl:")) {
    // sl:<день>:10:00-12:00 — в самом интервале тоже есть двоеточия
    const m = d.match(/^sl:([01]):(\d\d:\d\d-\d\d:\d\d)$/);
    if (!m) return showWhen(x);
    x.u.state = { ...s, day: m[1] === "1" ? 1 : 0, slot: m[2] };
    await save(x.chatId, { state: x.u.state });
    return showConfirm(x);
  }
  if (d === "e:phone") return askPhone(x, "confirm");
  if (d === "e:name" || d === "e:comment") {
    const step = d === "e:name" ? "name" : "comment";
    x.u.state = { ...s, step };
    await save(x.chatId, { state: x.u.state });
    return show(x, step === "name" ? t.ask_name : t.ask_comment, [[cb(t.cancel_input, "confirm")]]);
  }
  if (d.startsWith("pre:")) return showPreorderQty(x, d.slice(4));
  if (d.startsWith("prq:")) {
    const [, pid, n] = d.split(":");
    return placePreorder(x, pid, Number(n));
  }
  if (d.startsWith("rp:")) return repeatOrder(x, d.slice(3));
  if (d.startsWith("cx:")) {
    const token = d.slice(3);
    const { data } = await db.rpc("shop_order", { p_chat_id: x.chatId, p_token: token });
    if (!data) return;
    return show(x, `${orderCard(data as Order, x.l)}\n\n<b>${t.cancel_q}</b>`, [[cb(t.cancel_yes, `cxy:${token}`), cb(t.cancel_no, `cxn:${token}`)]]);
  }
  if (d.startsWith("cxn:")) {
    const { data } = await db.rpc("shop_order", { p_chat_id: x.chatId, p_token: d.slice(4) });
    if (data) return show(x, orderCard(data as Order, x.l), orderButtons(x.c, data as Order, x.l));
    return;
  }
  if (d.startsWith("cxy:")) {
    const { data, error } = await db.rpc("shop_cancel_order", { p_chat_id: x.chatId, p_token: d.slice(4) });
    if (error) {
      x.toast = errCode(error.message, t);
      return;
    }
    // Сообщение «заказ отменён» пришлёт триггер базы, здесь обновляем только карточку
    return show(x, orderCard(data as Order, x.l), orderButtons(x.c, data as Order, x.l));
  }
}

async function onMessage(msg: TgMessage) {
  const c = await cfg();
  if (msg.chat.type !== "private" || !msg.from) return; // бот работает только в личных чатах
  const chatId = msg.chat.id;
  const u = await loadUser(chatId, msg.from);
  const x: Ctx = { c, chatId, u, l: u.lang, from: msg.from };
  const t = T[x.l];
  const s = u.state;

  // Контакт принимаем только свой: чужую карточку контакта можно переслать, и заказ ушёл бы на чужой номер
  if (msg.contact) {
    if (s.step !== "phone") return;
    if (msg.contact.user_id !== msg.from.id) return send(chatId, t.bad_phone);
    return applyPhone(x, msg.contact.phone_number);
  }
  if (!msg.text) return;
  const text = msg.text.trim();
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.startsWith("/") ? rawCmd.split("@")[0].toLowerCase() : "";

  if (cmd) {
    const removeKb = s.step === "phone";
    if (s.step) {
      x.u.state = { ...s, step: undefined, next: undefined };
      await save(chatId, { state: x.u.state });
    }
    if (removeKb) await tg("sendMessage", { chat_id: chatId, text: "…", reply_markup: { remove_keyboard: true } });
    switch (cmd) {
      case "/start": {
        if (u.muted) await save(chatId, { muted: false });
        await setMenuButton(c, chatId, x.l);
        // Ссылка с QR-кода: t.me/<bot>?start=p_tinchlik-01 сразу открывает витрину точки
        const code = rest[0]?.startsWith("p_") ? rest[0].slice(2) : null;
        if (code && (await findPoint(code))) return openPoint(x, code);
        return showHome(x);
      }
      case "/order": return showPoints(x);
      case "/orders": return showOrders(x);
      case "/lang": return route(x, "lang");
      case "/support": return route(x, "support");
      case "/stop":
        await save(chatId, { muted: true });
        return send(chatId, t.muted);
      default:
        return send(chatId, t.help, homeRows(c, x.l));
    }
  }

  switch (s.step) {
    case "phone": return applyPhone(x, text);
    case "name":
      if (text.length > 60) return send(chatId, t.too_long);
      x.u.name = text;
      x.u.state = { ...s, step: undefined };
      await save(chatId, { name: text, state: x.u.state });
      return showConfirm(x);
    case "comment":
      if (text.length > 300) return send(chatId, t.too_long);
      x.u.state = { ...s, step: undefined, comment: text };
      await save(chatId, { state: x.u.state });
      return showConfirm(x);
    case "support":
      x.u.state = { ...s, step: undefined };
      await save(chatId, { state: x.u.state });
      return forwardSupport(x, text);
    default:
      return forwardSupport(x, text);
  }
}

async function applyPhone(x: Ctx, raw: string) {
  const t = T[x.l];
  const phone = normalizePhone(raw);
  if (!phone) return send(x.chatId, t.bad_phone); // шаг остаётся: человек может написать номер ещё раз
  const next = x.u.state.next;
  x.u.phone = phone;
  x.u.state = { ...x.u.state, step: undefined, next: undefined };
  await save(x.chatId, { phone, state: x.u.state });
  await tg("sendMessage", { chat_id: x.chatId, text: `${t.phone_ok} ${prettyPhone(phone)}`, reply_markup: { remove_keyboard: true } });
  return afterPhone(x, next);
}

async function handleUpdate(u: Record<string, unknown>) {
  const cq = u.callback_query as { id: string; data?: string; from: TgUser; message?: TgMessage } | undefined;
  if (cq) return onCallback(cq);
  const msg = u.message as TgMessage | undefined;
  if (msg) return onMessage(msg);
}

// ---------- события из базы ----------
async function handleNotify(body: { event: string; id: string }) {
  const c = await cfg();
  if (body.event === "order_status") {
    const { data } = await db.rpc("shop_order_event", { p_order_id: body.id });
    if (!data?.chat_id || data.muted) return;
    const o = data.order as Order;
    const l = data.lang as Lang;
    const t = T[l];
    const head = o.status === "issued" ? t.ev_issued : o.status === "expired" ? t.ev_expired : t.ev_cancelled;
    await send(Number(data.chat_id), `${head}\n\n${orderCard(o, l)}`, orderButtons(c, o, l));
    return;
  }
  if (body.event === "batch_arrived") {
    const { data } = await db.rpc("shop_batch_event", { p_batch_id: body.id });
    if (!data) return;
    const sent = new Set<number>();
    for (const r of data.recipients as { chat_id: number; lang: Lang }[]) {
      const chat = Number(r.chat_id);
      if (sent.has(chat)) continue; // у человека могло быть несколько заявок на один товар
      sent.add(chat);
      const name = `${pick(data, "name", r.lang)} ${sizeLabel(data.size_label, r.lang)}`;
      await send(chat, T[r.lang].batch(esc(name), esc(data.fridge_name)), [
        [cb(T[r.lang].order_now, `pt:${data.fridge_code}`)],
        webApp(T[r.lang].shop, `${c.site_url}/${r.lang}/point/${data.fridge_code}`),
      ]);
    }
  }
}

// ---------- заказ с сайта внутри Web App ----------
async function hmac(key: BufferSource, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
/** Проверка подписи Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
async function webAppUser(initData: string): Promise<TgUser | null> {
  if (!TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), TOKEN);
  const sign = await hmac(secret, check);
  const hex = [...sign].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== hash.length) return null;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  // Подпись старше суток не принимаем
  if (Date.now() / 1000 - Number(params.get("auth_date") ?? 0) > 86400) return null;
  try {
    return JSON.parse(params.get("user") ?? "null");
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleLink(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!UUID.test(body.token ?? "")) return json({ ok: false, error: "BAD_TOKEN" }, 400);
  const user = await webAppUser(String(body.init_data ?? ""));
  if (!user?.id) return json({ ok: false, error: "BAD_SIGNATURE" }, 401);
  const c = await cfg();
  const { data, error } = await db.rpc("shop_link_order", { p_token: body.token, p_chat_id: user.id });
  if (error || !data) return json({ ok: false, error: "NOT_LINKED" }, 409);
  const u = await loadUser(user.id, user);
  // Повторный вызов для того же заказа не присылает карточку ещё раз
  if (!data.was_linked) {
    const o = data as Order;
    await send(user.id, `${T[u.lang].created}\n\n${orderCard(o, u.lang)}`, orderButtons(c, o, u.lang));
  }
  return json({ ok: true });
}

// ---------- подключение бота из админ-панели ----------
/** Вход подтверждён кодом из письма. Подпись токена уже проверил getUser */
async function codeConfirmed(jwt: string, userId: string) {
  try {
    const session = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id;
    const { data } = await db.rpc("staff_session_ok", { p_session: session, p_user: userId });
    return data === true;
  } catch {
    return false;
  }
}

async function handleSetup(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const { data: staff } = await db.from("staff").select("role,is_active").eq("user_id", u.user.id).maybeSingle();
  if (!staff || staff.role !== "admin" || !staff.is_active || !(await codeConfirmed(jwt, u.user.id))) return json({ ok: false, error: "FORBIDDEN" }, 403);
  if (!TOKEN) return json({ ok: false, error: "NO_TOKEN" }, 400);

  const body = await req.json().catch(() => ({}));
  const c0 = await cfg(true);
  const me = await tg("getMe", {});
  if (!me.ok) return json({ ok: false, error: "BAD_TOKEN" }, 400);
  if (STAFF_TOKEN && STAFF_TOKEN === TOKEN) return json({ ok: false, error: "SAME_TOKEN" }, 400);
  const hook = await tg("setWebhook", {
    url: c0.function_url,
    secret_token: c0.webhook_secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!hook.ok) return json({ ok: false, error: "WEBHOOK_FAILED", detail: hook.description }, 502);
  await db.rpc("shop_save_setup", { p_bot_username: me.result.username, p_site_url: body.site_url ?? "" });
  const c = await cfg(true);

  const cmds = (l: Lang) => {
    const n = { uz: ["Bosh menyu", "Chatda buyurtma", "Buyurtmalarim", "Yordam", "Til", "Xabarnomalarni o‘chirish"], ru: ["Главное меню", "Заказ в чате", "Мои заказы", "Поддержка", "Язык", "Отключить уведомления"], en: ["Main menu", "Order in chat", "My orders", "Support", "Language", "Turn off notifications"] }[l];
    return ["start", "order", "orders", "support", "lang", "stop"].map((command, i) => ({ command, description: n[i] }));
  };
  await tg("setMyCommands", { commands: cmds("uz") });
  for (const l of ["ru", "uz", "en"] as Lang[]) await tg("setMyCommands", { commands: cmds(l), language_code: l });
  const webAppOn = isPublicUrl(c.site_url);
  if (webAppOn) {
    await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "BOLAKAY", web_app: { url: `${c.site_url}/uz` } } });
  }
  return json({ ok: true, bot_username: me.result.username, web_app: webAppOn, site_url: c.site_url });
}

// ---------- роутинг ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const path = new URL(req.url).pathname.replace(/^.*\/telegram-shop/, "") || "/";
  outbox = [];
  try {
    if (path === "/setup") return await handleSetup(req);
    if (path === "/link") return await handleLink(req);

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
    return json({ ok: false, error: "INTERNAL" }, 500);
  }
});
