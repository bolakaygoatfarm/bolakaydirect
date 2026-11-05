import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { publicClient } from "./supabase";
import { groupCatalog, type CatalogRow, type Fridge, type Product } from "./types";

/** Справочник товаров меняется редко — кэшируем на несколько минут. */
export async function getProducts(): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const { data, error } = await publicClient().from("products").select("*").eq("is_active", true).order("sort");
  if (error) throw new Error(error.message);
  return data as Product[];
}

export async function getFridges(): Promise<Fridge[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("fridges");
  const { data, error } = await publicClient().from("fridges").select("*").neq("status", "inactive").order("code");
  if (error) throw new Error(error.message);
  return data as Fridge[];
}

export async function getFridge(code: string): Promise<Fridge | null> {
  const all = await getFridges();
  return all.find((f) => f.code === code) ?? null;
}

/** Остатки — всегда свежие, без кэша (рендерятся внутри <Suspense>). */
export async function getCatalog(code: string) {
  const { data, error } = await publicClient().rpc("fridge_catalog", { p_code: code });
  if (error) throw new Error(error.message);
  return groupCatalog((data ?? []) as CatalogRow[]);
}
