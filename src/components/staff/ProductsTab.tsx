"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Category, Product } from "@/lib/types";
import { ProductArt } from "../ProductArt";
import { ErrorNote, Field, Modal, Section, fmtSum } from "./ui";
import { sizeLabel } from "@/lib/format";
import { s, staffLang } from "./i18n";

const CAT_RU: Record<Category, string> = { milk: "Молоко", yogurt: "Йогурт", butter: "Масло", drinks: "Напитки" };

const EMPTY: Omit<Product, "id"> = {
  slug: "", category: "milk", name_uz: "", name_ru: "", name_en: "", description_uz: "", description_ru: "", description_en: "",
  composition_uz: "", composition_ru: "", composition_en: "", storage_uz: "", storage_ru: "", storage_en: "", size_label: "",
  net_amount: null, net_unit: "ml", price: 0, sell_days: 2, image_url: null, is_active: true, sort: 100,
};

export function ProductsTab() {
  const sb = browserClient();
  const [items, setItems] = useState<Product[] | null>(null);
  const [edit, setEdit] = useState<Partial<Product> | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb.from("products").select("*").order("sort");
    setItems((data ?? []) as Product[]);
  }, [sb]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <Section title={s("Каталог товаров")} action={<button className="btn btn-primary min-h-10 text-sm" onClick={() => setEdit({ ...EMPTY })}>{s("+ Товар")}</button>}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {(items ?? []).map((p) => (
          <li key={p.id} className={`card flex gap-3 p-3 ${p.is_active ? "" : "opacity-60"}`}>
            <ProductArt category={p.category} image={p.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{p.name_ru} · {sizeLabel(p.size_label, staffLang())}</p>
              <p className="text-sm text-muted">{s(CAT_RU[p.category])} · {s("продаётся {0} дн.", p.sell_days)}</p>
              <p className="mt-1 font-bold text-brand-700">{fmtSum(p.price)}</p>
              {!p.is_active && <span className="chip mt-1 bg-danger-50 text-danger">{s("скрыт")}</span>}
            </div>
            <button className="btn btn-ghost min-h-9 self-start px-3 text-xs" onClick={() => setEdit(p)}>{s("Изменить")}</button>
          </li>
        ))}
      </ul>
      {edit && <ProductForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
    </Section>
  );
}

/** Сжимает фото в браузере. Если не получилось или стало больше — загружается исходный файл. */
async function toWebp(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.82));
    return blob && blob.type === "image/webp" && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function ProductForm({ initial, onClose, onSaved }: { initial: Partial<Product>; onClose: () => void; onSaved: () => void }) {
  const sb = browserClient();
  const [p, setP] = useState<Partial<Product>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Product) => ({
    className: "field",
    value: (p[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) return setErr(s("Файл больше 5 МБ"));
    setBusy(true);
    // Покупателям уходит сжатая копия: WebP, не больше 1200 px
    const img = await toWebp(file);
    const ext = img.type === "image/webp" ? "webp" : file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${p.slug || "product"}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("product-images").upload(path, img, { contentType: img.type, upsert: false, cacheControl: "31536000" });
    setBusy(false);
    if (error) return setErr(error.message);
    set("image_url", sb.storage.from("product-images").getPublicUrl(path).data.publicUrl);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { id, ...rest } = p as Product;
    const payload = {
      ...rest,
      slug: (rest.slug || "").trim().toLowerCase(),
      price: Number(rest.price),
      sell_days: Number(rest.sell_days),
      sort: Number(rest.sort) || 0,
      net_amount: rest.net_amount ? Number(rest.net_amount) : null,
    };
    const res = id ? await sb.from("products").update(payload).eq("id", id) : await sb.from("products").insert(payload);
    setBusy(false);
    if (res.error) setErr(res.error.code === "23505" ? s("Такой slug уже есть") : res.error.message);
    else onSaved();
  }

  return (
    <Modal title={p.id ? s("Изменить товар") : s("Новый товар")} onClose={onClose}>
      <form onSubmit={save} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={s("Название (UZ)")}><input {...txt("name_uz")} required /></Field>
          <Field label={s("Название (RU)")}><input {...txt("name_ru")} required /></Field>
          <Field label={s("Название (EN)")}><input {...txt("name_en")} /></Field>
          <Field label={s("Slug (латиница, для адреса)")}><input {...txt("slug")} pattern="[a-z0-9-]+" required /></Field>
          <Field label={s("Категория")}>
            <select className="field" value={p.category} onChange={(e) => set("category", e.target.value as Category)}>
              {Object.entries(CAT_RU).map(([k, v]) => <option key={k} value={k}>{s(v)}</option>)}
            </select>
          </Field>
          <Field label={s("Фасовка (напр. 1 l, 200 g)")}><input {...txt("size_label")} required /></Field>
          <Field label={s("Цена, сум")}><input className="field" type="number" min={0} step={500} value={p.price ?? 0} onChange={(e) => set("price", Number(e.target.value))} required /></Field>
          <Field label={s("Объём/масса")}><input className="field" type="number" min={1} value={p.net_amount ?? ""} onChange={(e) => set("net_amount", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label={s("Ед.")}>
            <select className="field" value={p.net_unit ?? "ml"} onChange={(e) => set("net_unit", e.target.value as "ml" | "g")}>
              <option value="ml">{s("мл")}</option><option value="g">{s("г")}</option>
            </select>
          </Field>
          <Field label={s("Дней в продаже")}><input className="field" type="number" min={1} max={90} value={p.sell_days ?? 2} onChange={(e) => set("sell_days", Number(e.target.value))} required /></Field>
          <Field label={s("Порядок")}><input className="field" type="number" value={p.sort ?? 0} onChange={(e) => set("sort", Number(e.target.value))} /></Field>
        </div>
        <p className="rounded-xl bg-brand-50 p-3 text-xs">{s("«Дней в продаже» = 2 → товар продаётся в день производства и на следующий день, на третий день автоматически скрывается.")}</p>
        <Field label={s("Описание (UZ)")}><textarea {...txt("description_uz")} /></Field>
        <Field label={s("Описание (RU)")}><textarea {...txt("description_ru")} /></Field>
        <Field label={s("Описание (EN)")}><textarea {...txt("description_en")} /></Field>
        <Field label={s("Состав (UZ)")}><input {...txt("composition_uz")} /></Field>
        <Field label={s("Состав (RU)")}><input {...txt("composition_ru")} /></Field>
        <Field label={s("Состав (EN)")}><input {...txt("composition_en")} /></Field>
        <Field label={s("Хранение (UZ)")}><input {...txt("storage_uz")} /></Field>
        <Field label={s("Хранение (RU)")}><input {...txt("storage_ru")} /></Field>
        <Field label={s("Хранение (EN)")}><input {...txt("storage_en")} /></Field>
        <Field label={s("Фото (JPG/PNG/WebP до 5 МБ)")}>
          <input className="field" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </Field>
        {p.image_url && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => set("image_url", null)}>{s("Убрать фото")}</button>
          </div>
        )}
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!p.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          {s("Показывать покупателям")}
        </label>
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy}>{busy ? s("Сохраняем…") : s("Сохранить")}</button>
      </form>
    </Modal>
  );
}
