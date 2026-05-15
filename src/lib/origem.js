// Rastreamento "por onde veio" — capturado da URL no momento da chegada
// e guardado no localStorage até o cadastro. Resolve users.origem +
// users.afiliado_id na hora do signUp.
//
// Regras:
//   - ?cupom=X    → origem='afiliado', afiliado_id resolvido do cupom
//   - ?utm_source=instagram → origem='instagram'
//   - ?utm_source=google    → origem='google'
//   - ?utm_source=qualquer  → origem=<utm_source> (preserva pra reports custom)
//   - nada disso → origem='organico'

import { supabase } from "./supabase";

const KEY_UTM = "viajjei:origem";

export function captureOrigemFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);

  // Cupom tem precedência — afiliado_id é a fonte mais valiosa
  const cupom = (params.get("cupom") ?? "").trim().toUpperCase().slice(0, 30);
  if (cupom) {
    const payload = { origem: "afiliado", cupom, utm_source: null };
    try { localStorage.setItem(KEY_UTM, JSON.stringify(payload)); } catch {}
    return payload;
  }

  // UTM sources comuns
  const utmSource = (params.get("utm_source") ?? "").trim().toLowerCase().slice(0, 30);
  if (utmSource) {
    const known = ["instagram", "google", "facebook", "tiktok", "twitter", "linkedin", "youtube"];
    const origem = known.includes(utmSource) ? utmSource : utmSource;
    const payload = { origem, cupom: null, utm_source: utmSource };
    try { localStorage.setItem(KEY_UTM, JSON.stringify(payload)); } catch {}
    return payload;
  }

  return null;
}

export function getStoredOrigem() {
  try {
    const raw = localStorage.getItem(KEY_UTM);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearStoredOrigem() {
  try { localStorage.removeItem(KEY_UTM); } catch {}
}

// Resolve { origem, afiliado_id } pra gravar no users no momento do signUp.
// Não bloqueia se a query do afiliado falhar — só perde o afiliado_id.
export async function resolveOrigemPayload() {
  const stored = getStoredOrigem();
  if (!stored) return { origem: "organico", afiliado_id: null };

  if (stored.origem === "afiliado" && stored.cupom) {
    try {
      // eq exato (não ilike) — captureOrigemFromUrl já fez toUpperCase.
      // ilike interpretaria '%' do localStorage manipulado e auto-atribuiria
      // o primeiro afiliado ativo (low-severity mas semanticamente errado).
      const code = String(stored.cupom).trim().toUpperCase().slice(0, 30);
      if (!code) return { origem: "organico", afiliado_id: null };
      const { data } = await supabase
        .from("afiliados")
        .select("id, ativo")
        .eq("cupom", code)
        .maybeSingle();
      if (data?.ativo) {
        return { origem: "afiliado", afiliado_id: data.id };
      }
      return { origem: "organico", afiliado_id: null };
    } catch (e) {
      console.warn("[origem] resolve afiliado falhou:", e);
      return { origem: "organico", afiliado_id: null };
    }
  }

  return { origem: stored.origem, afiliado_id: null };
}
