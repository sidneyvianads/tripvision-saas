// Smoke tests R20 — sync do contador IA do Jei.
//
// 4 dimensões cobertas:
// 1. Alinhamento de limites client/server (R20-1) — plans.js bate com
//    MONTHLY_LIMITS do plan.mjs
// 2. Hook useIaUsage (R20-2) — shape, cache TTL, owner bypass, refresh
//    semantics, optimistic bump
// 3. PlanChat integração (R20-3) — usa o hook, badge mostra usage, stale
//    indicator, removeu imports antigos
// 4. Anti-regressão — rateLimit.js morto, sem getPlanUsage/bumpPlanUsage
//    espalhados

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const PLANS = join(SRC, "data/plans.js");
const HOOK = join(SRC, "hooks/useIaUsage.js");
const PLAN_CHAT = join(SRC, "components/PlanChat.jsx");
const PLAN_MJS = resolve(__dirname, "../netlify/functions/plan.mjs");

describe("R20-1 — Limites client alinhados com server", () => {
  const plans = readFileSync(PLANS, "utf8");
  const planMjs = readFileSync(PLAN_MJS, "utf8");

  it("Pro: plans.js LIMITS.pro.iaMsgsMes = 200", () => {
    // Anchora em LIMITS = { ... pro: { ... iaMsgsMes } } pra não pegar
    // o iaMsgsMes do plano `expired` que aparece antes na ordem do arquivo.
    const pro = plans.match(/LIMITS\s*=\s*\{[\s\S]+?\bpro:\s*\{[\s\S]+?iaMsgsMes:\s*(\d+)/);
    expect(pro?.[1]).toBe("200");
  });

  it("Grupo: plans.js LIMITS.grupo.iaMsgsMes = 800", () => {
    const grupo = plans.match(/LIMITS\s*=\s*\{[\s\S]+?\bgrupo:\s*\{[\s\S]+?iaMsgsMes:\s*(\d+)/);
    expect(grupo?.[1]).toBe("800");
  });

  it("Server MONTHLY_LIMITS pro=200, grupo=800 (sanity check do lado do server)", () => {
    expect(planMjs).toMatch(/MONTHLY_LIMITS\s*=\s*\{\s*pro:\s*200,\s*grupo:\s*800\s*\}/);
  });

  it("Features list (landing copy) menciona 200 e 800", () => {
    expect(plans).toMatch(/"200 conversas por mês com o Jei"/);
    expect(plans).toMatch(/"800 conversas por mês com o Jei"/);
  });

  it("NÃO menciona mais os valores antigos 500/2.000 (regression)", () => {
    expect(plans).not.toMatch(/500 conversas/);
    expect(plans).not.toMatch(/2\.000 conversas|2,000 conversas|2000 conversas/);
  });
});

describe("R20-2 — useIaUsage hook", () => {
  const src = readFileSync(HOOK, "utf8");

  it("exporta useIaUsage", () => {
    expect(src).toMatch(/export function useIaUsage/);
  });

  it("API retorna { used, limit, remaining, loading, stale, refresh, optimisticBump, isUnlimited }", () => {
    // Owner branch
    expect(src).toMatch(/isUnlimited:\s*true/);
    // Normal return
    expect(src).toMatch(/\bused:\s*count\b/);
    expect(src).toMatch(/\blimit:\s*planLimit\b/);
    expect(src).toMatch(/\bremaining:\s*Math\.max\(0, planLimit - count\)/);
    expect(src).toMatch(/\bloading\b/);
    expect(src).toMatch(/\bstale\b/);
    expect(src).toMatch(/\brefresh\b/);
    expect(src).toMatch(/\boptimisticBump\b/);
  });

  it("TTL é 60 segundos (60_000 ms)", () => {
    expect(src).toMatch(/TTL_MS\s*=\s*60_?000/);
  });

  it("Cache key compatível com rateLimit.js v3 antigo", () => {
    expect(src).toMatch(/KEY\s*=\s*["']tripvision-saas:plan-usage:v3["']/);
  });

  it("Owner faz bypass sem fetch nem cache", () => {
    expect(src).toMatch(/ownerBypass\s*=\s*isOwner\(plano\)/);
    // Em owner branch, isUnlimited true e Infinity
    expect(src).toMatch(/limit:\s*Infinity/);
    expect(src).toMatch(/remaining:\s*Infinity/);
  });

  it("Refresh chama RPC count_ia_user_messages_in_month", () => {
    expect(src).toMatch(/rpc\(["']count_ia_user_messages_in_month["'],\s*\{\s*uid:\s*userId/);
  });

  it("Erro de rede no refresh marca stale=true (não derruba o app)", () => {
    expect(src).toMatch(/setStale\(true\)/);
    expect(src).toMatch(/console\.warn\([^)]*useIaUsage/);
  });

  it("Cache fresco (< TTL) usa direto sem refetch", () => {
    expect(src).toMatch(/Date\.now\(\) - cached\.fetchedAt\)\s*>\s*TTL_MS/);
  });

  it("inflightRef evita request duplicada em StrictMode dev", () => {
    expect(src).toMatch(/inflightRef/);
    expect(src).toMatch(/if \(inflightRef\.current\) return/);
  });

  it("writeCache try/catch (Safari ITP/LS cheio)", () => {
    expect(src).toMatch(/function writeCache[\s\S]+?try\s*\{[\s\S]+?\}\s*catch/);
  });

  it("optimisticBump atualiza cache local imediatamente", () => {
    const block = src.match(/const optimisticBump[\s\S]+?\}, \[userId, ownerBypass, hasAccess\]\);/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/setCount\(/);
    expect(block[0]).toMatch(/writeCache\(userId, next\)/);
  });

  it("monthKey usa YYYY-MM (mesma convenção do server count_ia_user_messages_in_month)", () => {
    expect(src).toMatch(/function monthKey/);
    expect(src).toMatch(/getFullYear/);
    expect(src).toMatch(/getMonth/);
  });
});

describe("R20-3 — PlanChat integração com hook", () => {
  const src = readFileSync(PLAN_CHAT, "utf8");

  it("importa useIaUsage do hook (não rateLimit antigo)", () => {
    expect(src).toMatch(/import\s*\{\s*useIaUsage\s*\}\s*from\s*["']\.\.\/hooks\/useIaUsage["']/);
    expect(src).not.toMatch(/from\s+["']\.\.\/lib\/rateLimit["']/);
  });

  it("NÃO usa mais getPlanUsage/bumpPlanUsage/setPlanUsageFromServer", () => {
    expect(src).not.toMatch(/getPlanUsage\(/);
    expect(src).not.toMatch(/bumpPlanUsage\(/);
    expect(src).not.toMatch(/setPlanUsageFromServer\(/);
  });

  it("usage = useIaUsage(user) substitui o useState antigo", () => {
    expect(src).toMatch(/const\s+usage\s*=\s*useIaUsage\(user\)/);
  });

  it("Bloqueio usa usage.isUnlimited + usage.remaining (não só remaining)", () => {
    expect(src).toMatch(/!usage\.isUnlimited\s*&&\s*usage\.remaining\s*<=\s*0/);
  });

  it("Stream end chama optimisticBump + refresh pra reconciliar", () => {
    expect(src).toMatch(/usage\.optimisticBump\(\)/);
    expect(src).toMatch(/usage\.refresh\(\)/);
  });

  it("Badge mostra X/Y conversas usando usage.used + usage.limit", () => {
    expect(src).toMatch(/\{usage\.used\}\/\{usage\.limit\} conversas/);
  });

  it("Stale indicator: ponto âmbar quando cache expirou + server offline", () => {
    expect(src).toMatch(/usage\.stale\s*&&\s*<span[^>]*amber/);
  });

  it("Owner usa usage.isUnlimited (não isOwner direto pro badge — DRY)", () => {
    // Badge top deve checar usage.isUnlimited primeiro
    const badge = src.match(/title=\{usage\.stale[\s\S]+?<\/span>/);
    expect(badge?.[0]).toMatch(/usage\.isUnlimited/);
  });
});

describe("R20 anti-regressão — rateLimit.js morto + sem getPlanUsage espalhado", () => {
  it("src/lib/rateLimit.js foi removido", () => {
    expect(existsSync(join(SRC, "lib/rateLimit.js"))).toBe(false);
  });

  it("Storage helper ainda inclui plan-usage key no cleanup do signOut", () => {
    // Cache pertence à sessão — deve morrer com signOut (R12-2).
    const storage = readFileSync(join(SRC, "lib/storage.js"), "utf8");
    expect(storage).toMatch(/tripvision-saas:plan-usage:v3/);
  });

  it("Nenhum outro arquivo importa rateLimit", () => {
    // Walk recursivo simples
    function walk(dir) {
      const out = [];
      const { readdirSync } = require("node:fs");
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(p);
      }
      return out;
    }
    const files = walk(SRC);
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/from\s+["'][^"']*lib\/rateLimit["']/.test(src)) {
        offenders.push(f.replace(SRC, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Bloqueio server-side em plan.mjs continua intacto", () => {
    const planMjs = readFileSync(PLAN_MJS, "utf8");
    // A1: variável renomeada user_id → userId (identidade vem do JWT verificado).
    expect(planMjs).toMatch(/countMonthlyUserMessages\(userId\)/);
    expect(planMjs).toMatch(/used >= monthlyLimit/);
    expect(planMjs).toMatch(/scope:\s*["']monthly["']/);
  });
});
