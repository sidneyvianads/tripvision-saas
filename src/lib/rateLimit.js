// Rate limiting client-side via localStorage.
// Free: lifetime counter. Pro/Grupo: monthly counter (YYYY-MM).
// Não é à prova de fraude — protege custo da maioria dos casos.
// O servidor (/api/plan) tem o gate autoritativo via RPC no Postgres.

import { getLimits } from "../data/plans";

const KEY = "tripvision-saas:plan-usage:v3";

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM
}

function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch { return {}; }
}

function writeState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function getPlanUsage(userId, plano = "free") {
  const limits = getLimits(plano);
  const s = readState();

  if (limits.iaMsgsLifetime != null) {
    const used = s[`${userId}:lifetime`] ?? 0;
    const limit = limits.iaMsgsLifetime;
    return { used, limit, remaining: Math.max(0, limit - used), tipo: "lifetime" };
  }
  const month = monthKey();
  const used = s[`${userId}:${month}`] ?? 0;
  const limit = limits.iaMsgsMes ?? 999;
  return { used, limit, remaining: Math.max(0, limit - used), tipo: "mensal", month };
}

export function bumpPlanUsage(userId, plano = "free") {
  const limits = getLimits(plano);
  const s = readState();

  if (limits.iaMsgsLifetime != null) {
    const k = `${userId}:lifetime`;
    s[k] = (s[k] ?? 0) + 1;
  } else {
    const month = monthKey();
    const k = `${userId}:${month}`;
    s[k] = (s[k] ?? 0) + 1;
  }

  // GC dos contadores mensais antigos (>3 meses)
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  for (const key of Object.keys(s)) {
    const part = key.split(":").pop();
    if (!part || part === "lifetime") continue;
    // formato YYYY-MM
    if (/^\d{4}-\d{2}$/.test(part) && part < cutoffKey) delete s[key];
  }
  writeState(s);
  return getPlanUsage(userId, plano);
}

// Permite override do contador mensal a partir do servidor (single source of truth).
export function setMonthlyUsage(userId, count) {
  if (!userId || typeof count !== "number") return;
  const s = readState();
  s[`${userId}:${monthKey()}`] = Math.max(0, count);
  writeState(s);
}
