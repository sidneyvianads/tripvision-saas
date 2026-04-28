// Rate limiting client-side via localStorage.
// Não é à prova de fraude — é só pra proteger custo da maioria
// dos casos. Pra um limite real, mover pra Function/server.

const KEY = "tripvision-saas:plan-usage:v1";
const DAILY_LIMIT = 50;

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

export function getPlanUsage(userId) {
  const day = todayKey();
  const s = readState();
  const used = s[`${userId}:${day}`] ?? 0;
  return { used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), day };
}

export function bumpPlanUsage(userId) {
  const day = todayKey();
  const s = readState();
  const k = `${userId}:${day}`;
  s[k] = (s[k] ?? 0) + 1;
  // GC: keep only today + last 6 days
  const cutoff = Date.now() - 7 * 86400000;
  for (const key of Object.keys(s)) {
    const d = key.split(":").pop();
    if (!d || isNaN(Date.parse(d))) continue;
    if (Date.parse(d) < cutoff) delete s[key];
  }
  writeState(s);
  return getPlanUsage(userId);
}
