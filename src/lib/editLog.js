import { supabase } from "./supabase";

export async function logEdit(viagemId, userId, acao, details = null) {
  if (!viagemId) return;
  try {
    await supabase.from("edit_log").insert({
      viagem_id: viagemId,
      user_id: userId ?? null,
      acao,
      details,
    });
  } catch (e) {
    console.warn("[editLog] falhou:", e);
  }
}

export async function fetchLastEdit(viagemId) {
  if (!viagemId) return null;
  const { data } = await supabase
    .from("edit_log")
    .select("acao, created_at, user:users(nome)")
    .eq("viagem_id", viagemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
