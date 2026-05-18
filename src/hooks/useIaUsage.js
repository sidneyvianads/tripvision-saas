// R20-2: hook que centraliza contador de mensagens IA com SERVER como
// fonte única de verdade. Resolve 4 bugs do esquema localStorage-first:
//
//   A. user limpa LS → contador "zera" na UI (server continuava bloqueando)
//   B. múltiplas abas divergem (cada uma com bump local independente)
//   C. trocar de device → badge zerado até primeiro refresh
//   D. bump optimistic acumulava +1 sem reconcile
//
// Esquema novo:
// - Server (RPC count_ia_user_messages_in_month) é authority
// - localStorage vira CACHE com TTL 60s. Render imediato + revalidação
//   na primeira chance.
// - Optimistic bump local após send, mas SEMPRE chama refresh() depois
//   pra reconciliar.
// - Stale flag quando o cache passou do TTL e o refresh falhou (UI mostra
//   "•" pequeno avisando que pode estar desatualizado).
//
// API:
//   const { used, limit, remaining, loading, stale, refresh, optimisticBump } =
//     useIaUsage(user);
//
// Comportamento por plano:
// - owner: { used: 0, limit: Infinity, remaining: Infinity, loading: false }
//   sem fetch, sem cache (badge mostra "Ilimitado" no caller).
// - pending/expired/free: { used: 0, limit: 0, remaining: 0 } — caller
//   já bloqueia via hasActiveAccess; aqui só não fetcha por economia.
// - pro/grupo: refetcha server, cache 60s.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getLimits, isOwner, hasActiveAccess } from "../data/plans";

// MESMA key do rateLimit.js v3 — back-compat com cache existente em LS.
// Estrutura armazenada: { [userId:YYYY-MM]: { count, fetchedAt } }
// fetchedAt = ms epoch da última resposta do servidor.
const KEY = "tripvision-saas:plan-usage:v3";
const TTL_MS = 60_000;

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function readCache(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entry = parsed?.[`${userId}:${monthKey()}`];
    if (!entry || typeof entry !== "object") return null;
    return {
      count: Number(entry.count ?? 0),
      fetchedAt: Number(entry.fetchedAt ?? 0),
    };
  } catch { return null; }
}

function writeCache(userId, count) {
  if (!userId) return;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[`${userId}:${monthKey()}`] = {
      count: Math.max(0, Number(count) || 0),
      fetchedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(parsed));
  } catch { /* localStorage cheio / Safari ITP */ }
}

export function useIaUsage(user) {
  const userId = user?.id;
  const plano = user?.plano;
  const limits = getLimits(plano);
  const planLimit = limits.iaMsgsMes ?? 0;
  const ownerBypass = isOwner(plano);
  const hasAccess = hasActiveAccess(user);

  // Estado inicial vem do cache pra render instantâneo. Server refresh
  // logo em seguida.
  const [count, setCount] = useState(() => {
    if (!userId || ownerBypass || !hasAccess) return 0;
    return readCache(userId)?.count ?? 0;
  });
  const [loading, setLoading] = useState(() => {
    if (!userId || ownerBypass || !hasAccess) return false;
    const c = readCache(userId);
    return !c || (Date.now() - c.fetchedAt) > TTL_MS;
  });
  const [stale, setStale] = useState(false);

  // Ref pra evitar request duplicada em StrictMode dev (effect roda 2×).
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || ownerBypass || !hasAccess) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("count_ia_user_messages_in_month", { uid: userId });
      if (error) throw error;
      const serverCount = typeof data === "number" ? data : 0;
      setCount(serverCount);
      setStale(false);
      writeCache(userId, serverCount);
    } catch (e) {
      console.warn("[useIaUsage] refresh failed:", e?.message ?? e);
      // Fallback gracioso: mantém cache + marca stale pra UI sinalizar.
      setStale(true);
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, [userId, ownerBypass, hasAccess]);

  // Refetch on mount + quando user.id/plano mudam + se cache passou TTL.
  useEffect(() => {
    if (!userId || ownerBypass || !hasAccess) return;
    const cached = readCache(userId);
    const stale_now = !cached || (Date.now() - cached.fetchedAt) > TTL_MS;
    if (stale_now) refresh();
    else {
      // Cache fresco — usa direto e sincroniza count.
      setCount(cached.count);
      setStale(false);
      setLoading(false);
    }
  }, [userId, ownerBypass, hasAccess, refresh]);

  // Optimistic bump: chama após o send pra atualizar UI imediatamente,
  // depois refresh reconcilia com o server. Se refresh falhar, UI fica
  // com count+1 (geralmente correto, raras vezes errado por 1 — aceito
  // como trade-off por UX responsiva).
  const optimisticBump = useCallback(() => {
    if (!userId || ownerBypass || !hasAccess) return;
    setCount((prev) => {
      const next = prev + 1;
      writeCache(userId, next);
      return next;
    });
  }, [userId, ownerBypass, hasAccess]);

  // Computed: owner sempre ilimitado; outros usam server count vs limit.
  if (ownerBypass) {
    return {
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      loading: false,
      stale: false,
      refresh: async () => {},
      optimisticBump: () => {},
      isUnlimited: true,
    };
  }

  return {
    used: count,
    limit: planLimit,
    remaining: Math.max(0, planLimit - count),
    loading,
    stale,
    refresh,
    optimisticBump,
    isUnlimited: false,
  };
}
