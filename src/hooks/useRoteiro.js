import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useRoteiro(viagemId) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!viagemId) return;
    setLoading(true);
    const { data: dias, error: dErr } = await supabase
      .from("roteiro_dias")
      .select("*")
      .eq("viagem_id", viagemId)
      .order("dia_numero", { ascending: true });
    if (dErr) {
      setError(dErr.message);
      setLoading(false);
      return;
    }
    if (!dias || dias.length === 0) {
      setDays([]);
      setLoading(false);
      return;
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
    setDays(dias.map((d) => ({ ...d, atividades: byDia[d.id] ?? [] })));
    setLoading(false);
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
