/** Клиент Supabase по требованию: библиотека (~40 КБ) загружается только при первом обращении, а не вместе с витриной. */
export const loadBrowserClient = async () => (await import("./supabase")).browserClient();
