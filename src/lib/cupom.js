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
// IMPORTANTE: comissao_percent foi REVOKE'd do column-grant em R4-H2 pra
// proteger afiliados/comissao da exposição pública. Frontend não precisa
// de comissao_percent (só desconto_percent pra mostrar pro user "X% off").
// Tentar lê-la aqui dispararia "permission denied for column" e quebraria
// o fluxo de signup inteiro.
export async function validateCupom(cupom) {
  const code = (cupom ?? "").trim().toUpperCase();
  if (!code) return { ok: false, motivo: "vazio" };
  // .eq exato — não usar ilike: code já vem .toUpperCase, e a tabela
  // armazena cupons UPPER. .ilike interpretaria %_ como wildcard.
  const { data, error } = await supabase
    .from("afiliados")
    .select("id, nome, cupom, ativo, desconto_percent, foto_url, instagram")
    .eq("cupom", code)
    .maybeSingle();
  if (error) {
    console.warn("[cupom] erro ao validar:", error);
    return { ok: false, motivo: "erro" };
  }
  if (!data) return { ok: false, motivo: "nao_encontrado" };
  if (!data.ativo) return { ok: false, motivo: "inativo" };
  return { ok: true, afiliado: data };
}
