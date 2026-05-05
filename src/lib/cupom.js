// Cupom de afiliado: capturado via ?cupom=XXX na URL e guardado no localStorage
// até o user fazer checkout. Valida contra a tabela afiliados.

import { supabase } from "./supabase";

const KEY = "viajjei:cupom";

export function captureCupomFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("cupom");
  if (!raw) return null;
  const cupom = raw.trim().toUpperCase().slice(0, 30);
  if (!cupom) return null;
  try { localStorage.setItem(KEY, cupom); } catch {}
  return cupom;
}

export function getStoredCupom() {
  try { return localStorage.getItem(KEY) || ""; }
  catch { return ""; }
}

export function setStoredCupom(cupom) {
  if (!cupom) {
    try { localStorage.removeItem(KEY); } catch {}
    return;
  }
  try { localStorage.setItem(KEY, cupom.trim().toUpperCase()); } catch {}
}

export function clearStoredCupom() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Valida cupom contra tabela afiliados. Retorna { ok, afiliado, motivo }.
export async function validateCupom(cupom) {
  const code = (cupom ?? "").trim().toUpperCase();
  if (!code) return { ok: false, motivo: "vazio" };
  const { data, error } = await supabase
    .from("afiliados")
    .select("id, nome, cupom, ativo, comissao_percent")
    .ilike("cupom", code)
    .maybeSingle();
  if (error) {
    console.warn("[cupom] erro ao validar:", error);
    return { ok: false, motivo: "erro" };
  }
  if (!data) return { ok: false, motivo: "nao_encontrado" };
  if (!data.ativo) return { ok: false, motivo: "inativo" };
  return { ok: true, afiliado: data };
}
