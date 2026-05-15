import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const CACHE_KEY = (viagemId) => `tripvision:roteiro:${viagemId}`;
// TTL do cache. Cache existe pra hidratação instantânea da UI; passa
// disso, descarta — outra aba pode ter editado, ou o usuário voltou
// depois de horas/dias. Reload via Supabase é sempre chamado em
// paralelo (useEffect), então o "fresh" chega rápido. Cache só serve
// pro primeiro paint não ser branco.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function readCache(viagemId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(viagemId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.days)) return null;
    // Descarta cache velho — outra aba pode ter editado a viagem.
    const ts = Number(parsed?.ts ?? 0);
    if (!ts || Date.now() - ts > CACHE_TTL_MS) return null;
    return parsed.days;
  } catch { return null; }
}
function writeCache(viagemId, days) {
  try { localStorage.setItem(CACHE_KEY(viagemId), JSON.stringify({ days, ts: Date.now() })); } catch {}
}

export function useRoteiro(viagemId) {
  // Hidrata do cache imediato pra renderização instantânea
  const [days, setDays] = useState(() => (viagemId ? (readCache(viagemId) ?? []) : []));
  const [loading, setLoading] = useState(() => !viagemId || readCache(viagemId) == null);
  const [error, setError] = useState(null);

  // reload() retorna o array fresh — útil pra callers (PlanChat) que
  // precisam garantir freshness sem depender de re-render do React.
  const reload = useCallback(async () => {
    if (!viagemId) return [];
    const { data: dias, error: dErr } = await supabase
      .from("roteiro_dias")
      .select("*")
      .eq("viagem_id", viagemId)
      .order("dia_numero", { ascending: true });
    if (dErr) {
      setError(dErr.message);
      setLoading(false);
      return [];
    }
    if (!dias || dias.length === 0) {
      setDays([]);
      writeCache(viagemId, []);
      setLoading(false);
      return [];
    }

    const ids = dias.map((d) => d.id);
    const { data: ats } = await supabase
      .from("roteiro_atividades")
      .select("*")
      .in("dia_id", ids)
      .order("ordem", { ascending: true });

    const byDia = {};
    for (const a of ats ?? []) {
      (byDia[a.dia_id] ||= []).push(a);
    }
    const merged = dias.map((d) => ({ ...d, atividades: byDia[d.id] ?? [] }));
    setDays(merged);
    writeCache(viagemId, merged);
    setLoading(false);
    return merged;
  }, [viagemId]);

  useEffect(() => { reload(); }, [reload]);

  return { days, loading, error, reload };
}

export async function addDia(viagemId, payload) {
  const { data, error } = await supabase
    .from("roteiro_dias")
    .insert({ viagem_id: viagemId, ...payload })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDia(diaId, patch) {
  const { data, error } = await supabase
    .from("roteiro_dias")
    .update(patch)
    .eq("id", diaId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDia(diaId) {
  const { error } = await supabase.from("roteiro_dias").delete().eq("id", diaId);
  if (error) throw new Error(error.message);
}

export async function addAtividade(diaId, payload, ordem = 0) {
  const { data, error } = await supabase
    .from("roteiro_atividades")
    .insert({ dia_id: diaId, ordem, ...payload })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateAtividade(atividadeId, patch) {
  const { data, error } = await supabase
    .from("roteiro_atividades")
    .update(patch)
    .eq("id", atividadeId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAtividade(atividadeId) {
  const { error } = await supabase.from("roteiro_atividades").delete().eq("id", atividadeId);
  if (error) throw new Error(error.message);
}

export async function reorderAtividades(items) {
  const updates = items.map((a, idx) => ({ id: a.id, ordem: idx }));
  for (const u of updates) {
    await supabase.from("roteiro_atividades").update({ ordem: u.ordem }).eq("id", u.id);
  }
}
