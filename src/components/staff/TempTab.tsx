"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { Fridge } from "@/lib/types";
import { ErrorNote, Field, Section, fmtDT } from "./ui";
import { s } from "./i18n";

interface Log { id: number; temp_c: number; note: string | null; recorded_at: string }

const OK_MIN = 2;
const OK_MAX = 6;

export function TempTab({ fridge }: { fridge: Fridge }) {
  const sb = browserClient();
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [temp, setTemp] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb.from("temperature_logs").select("id,temp_c,note,recorded_at").eq("fridge_id", fridge.id).order("recorded_at", { ascending: false }).limit(30);
    setLogs((data ?? []) as Log[]);
  }, [sb, fridge.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(temp.replace(",", "."));
    if (!Number.isFinite(v)) return setErr(s("Введите число"));
    setBusy(true);
    setErr(null);
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("temperature_logs").insert({ fridge_id: fridge.id, temp_c: v, note: note || null, recorded_by: u.user?.id });
    setBusy(false);
    if (error) return setErr(error.message);
    setTemp("");
    setNote("");
    void load();
  }

  const t = Number(temp.replace(",", "."));
  const outOfRange = temp !== "" && Number.isFinite(t) && (t < OK_MIN || t > OK_MAX);

  return (
    <Section title={s("Журнал температуры · {0}", fridge.name)}>
      <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Field label={s("Температура, °C")}><input className="field" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="4.0" required /></Field>
        <Field label={s("Комментарий")}><input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={outOfRange ? s("Что сделано?") : ""} /></Field>
        <button className="btn btn-primary" disabled={busy}>{s("Записать")}</button>
        {outOfRange && <p className="text-sm font-bold text-danger sm:col-span-3">{s("Вне нормы {0}…{1} °C — проверьте холодильник и опишите принятые меры.", OK_MIN, OK_MAX)}</p>}
        <div className="sm:col-span-3"><ErrorNote text={err} /></div>
      </form>
      <ul className="mt-3 grid gap-2">
        {(logs ?? []).map((l) => {
          const bad = l.temp_c < OK_MIN || l.temp_c > OK_MAX;
          return (
            <li key={l.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
              <span className="text-muted">{fmtDT(l.recorded_at)}{l.note ? ` · ${l.note}` : ""}</span>
              <span className={`chip ${bad ? "bg-danger-50 text-danger" : "bg-fresh-50 text-fresh"}`}>{l.temp_c} °C</span>
            </li>
          );
        })}
        {logs && !logs.length && <li className="card p-4 text-muted">{s("Записей пока нет.")}</li>}
      </ul>
    </Section>
  );
}
