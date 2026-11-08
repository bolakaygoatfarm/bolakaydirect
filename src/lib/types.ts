export type Lang = "uz" | "ru" | "en";
export const LANGS: Lang[] = ["uz", "ru", "en"];
export const isLang = (v: string): v is Lang => v === "uz" || v === "ru" || v === "en";
/** Язык для данных, у которых нет английской версии (Telegram-бот, старые записи) */
export const dataLang = (l: Lang): "uz" | "ru" => (l === "uz" ? "uz" : "ru");

export type Category = "milk" | "yogurt" | "butter" | "drinks";

export interface Product {
  id: string;
  slug: string;
  category: Category;
  name_uz: string;
  name_ru: string;
  name_en?: string | null;
  description_uz: string | null;
  description_ru: string | null;
  description_en?: string | null;
  composition_uz: string | null;
  composition_ru: string | null;
  composition_en?: string | null;
  storage_uz: string | null;
  storage_ru: string | null;
  storage_en?: string | null;
  /** Короткая строка о вкусе под названием («Нежный вкус») */
  tagline_uz?: string | null;
  tagline_ru?: string | null;
  tagline_en?: string | null;
  size_label: string;
  net_amount: number | null;
  net_unit: "ml" | "g" | null;
  price: number;
  sell_days: number;
  mxik_code?: string | null;
  package_code?: string | null;
  vat_percent?: number;
  image_url: string | null;
  is_active: boolean;
  sort: number;
}

export interface Fridge {
  id: string;
  code: string;
  name: string;
  address_uz: string | null;
  address_ru: string | null;
  landmark_uz: string | null;
  landmark_ru: string | null;
  address_en?: string | null;
  landmark_en?: string | null;
  lat: number | null;
  lng: number | null;
  open_time: string;
  close_time: string;
  status: "active" | "maintenance" | "inactive" | "planned";
  opening_plan_uz?: string | null;
  opening_plan_ru?: string | null;
  opening_plan_en?: string | null;
  sort?: number;
}

/** Строка RPC fridge_catalog */
export interface CatalogRow {
  product_id: string;
  slug: string;
  category: Category;
  name_uz: string;
  name_ru: string;
  name_en?: string | null;
  description_uz: string | null;
  description_ru: string | null;
  description_en?: string | null;
  composition_uz: string | null;
  composition_ru: string | null;
  composition_en?: string | null;
  storage_uz: string | null;
  storage_ru: string | null;
  storage_en?: string | null;
  size_label: string;
  net_amount: number | null;
  net_unit: "ml" | "g" | null;
  price: number;
  image_url: string | null;
  sort: number;
  batch_id: string | null;
  produced_at: string | null;
  expires_at: string | null;
  sell_until: string | null;
  available: number | null;
}

export interface CatalogBatch {
  batch_id: string;
  produced_at: string;
  expires_at: string;
  sell_until: string;
  available: number;
}

export interface CatalogProduct extends Omit<CatalogRow, "batch_id" | "produced_at" | "expires_at" | "sell_until" | "available"> {
  batches: CatalogBatch[];
}

export interface CartLine {
  batch_id: string;
  product_id: string;
  qty: number;
}

export type OrderStatus = "pending_payment" | "confirmed" | "issued" | "cancelled" | "expired";
export type PaymentMethod = "on_pickup" | "click" | "payme";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "failed";

export interface PublicOrder {
  number: number;
  token: string;
  pickup_code: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total: number;
  pickup_date: string;
  pickup_slot: string;
  reserved_until: string;
  created_at: string;
  issued_at: string | null;
  customer_name: string | null;
  telegram_linked: boolean;
  fridge: { code: string; name: string; address_uz: string | null; address_ru: string | null; address_en?: string | null; lat: number | null; lng: number | null };
  items: { product_id: string; name_uz: string; name_ru: string; name_en?: string | null; size_label: string; qty: number; price: number; produced_at: string; expires_at: string }[];
}

export function groupCatalog(rows: CatalogRow[]): CatalogProduct[] {
  const map = new Map<string, CatalogProduct>();
  for (const r of rows) {
    let p = map.get(r.product_id);
    if (!p) {
      const { batch_id, produced_at, expires_at, sell_until, available, ...rest } = r;
      void batch_id; void produced_at; void expires_at; void sell_until; void available;
      p = { ...rest, batches: [] };
      map.set(r.product_id, p);
    }
    if (r.batch_id && r.produced_at && r.expires_at && r.sell_until && r.available) {
      p.batches.push({
        batch_id: r.batch_id,
        produced_at: r.produced_at,
        expires_at: r.expires_at,
        sell_until: r.sell_until,
        available: r.available,
      });
    }
  }
  return [...map.values()];
}
