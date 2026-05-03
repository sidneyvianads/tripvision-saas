// Rate limiting client-side via localStorage.
// Free: contador DIÁRIO (5 msgs/dia, reseta meia-noite).
// Pro/Grupo: contador MENSAL.
// Owner: bypass total no servidor; client renderiza "sem limite".
// Servidor (/api/plan) é a fonte autoritativa via RPC no Postgres.

import { getLimits } from "../data/plans";

const KEY = "tripvision-saas:plan-usage:v3";

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; // YYYY-MM-DD
}

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

function bucketFor(limits) {
  if (limits.iaMsgsDia != null) return { window: "diario", key: dayKey(), limit: limits.iaMsgsDia };
  if (limits.iaMsgsMes != null) return { window: "mensal", key: monthKey(), limit: limits.iaMsgsMes };
  return null;
}

export function getPlanUsage(userId, plano = "free") {
  const limits = getLimits(plano);
  const b = bucketFor(limits);
  if (!b) return { used: 0, limit: 999, remaining: 999, tipo: "ilimitado" };
  const s = readState();
  const used = s[`${userId}:${b.key}`] ?? 0;
  return { used, limit: b.limit, remaining: Math.max(0, b.limit - used), tipo: b.window, period: b.key };
}

export function bumpPlanUsage(userId, plano = "free") {
  const limits = getLimits(plano);
  const b = bucketFor(limits);
  if (!b) return getPlanUsage(userId, plano);
  const s = readState();
  const k = `${userId}:${b.key}`;
  s[k] = (s[k] ?? 0) + 1;

  // GC: remove diários >7 dias e mensais >3 meses.
  const today = new Date();
  const cutoffDay = new Date(today); cutoffDay.setDate(today.getDate() - 7);
  const cutoffDayKey = `${cutoffDay.getFullYear()}-${String(cutoffDay.getMonth() + 1).padStart(2, "0")}-${String(cutoffDay.getDate()).padStart(2, "0")}`;
  const cutoffMonth = new Date(today); cutoffMonth.setMonth(today.getMonth() - 3);
  const cutoffMonthKey = `${cutoffMonth.getFullYear()}-${String(cutoffMonth.getMonth() + 1).padStart(2, "0")}`;
  for (const key of Object.keys(s)) {
    const part = key.split(":").pop();
    if (!part) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(part) && part < cutoffDayKey)  delete s[key];
    if (/^\d{4}-\d{2}$/.test(part)        && part < cutoffMonthKey) delete s[key];
  }
  writeState(s);
  return getPlanUsage(userId, plano);
}

// Override do contador a partir do servidor (single source of truth).
// Usa o mesmo bucket atual conforme o plano do user.
export function setPlanUsageFromServer(userId, plano, count) {
  if (!userId || typeof count !== "number") return;
  const b = bucketFor(getLimits(plano));
  if (!b) return;
  const s = readState();
  s[`${userId}:${b.key}`] = Math.max(0, count);
  writeState(s);
}
