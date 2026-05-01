// Rate limiting client-side via localStorage.
// Free: lifetime counter. Pro: daily counter.
// Não é à prova de fraude — protege custo da maioria dos casos.

import { getLimits } from "../data/plans";

const KEY = "tripvision-saas:plan-usage:v2";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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
  const day = todayKey();
  const used = s[`${userId}:${day}`] ?? 0;
  const limit = limits.iaMsgsDia ?? 999;
  return { used, limit, remaining: Math.max(0, limit - used), tipo: "diario", day };
}

export function bumpPlanUsage(userId, plano = "free") {
  const limits = getLimits(plano);
  const s = readState();

  if (limits.iaMsgsLifetime != null) {
    const k = `${userId}:lifetime`;
    s[k] = (s[k] ?? 0) + 1;
  } else {
    const day = todayKey();
    const k = `${userId}:${day}`;
    s[k] = (s[k] ?? 0) + 1;
  }

  // GC dos contadores diários antigos
  const cutoff = Date.now() - 7 * 86400000;
  for (const key of Object.keys(s)) {
    const datePart = key.split(":").pop();
    if (!datePart || datePart === "lifetime" || isNaN(Date.parse(datePart))) continue;
    if (Date.parse(datePart) < cutoff) delete s[key];
  }
  writeState(s);
  return getPlanUsage(userId, plano);
}
