// Smoke tests R36 — useAuth.loading separado de hydration.
//
// Bug R34/R36: form de signup com cursor not-allowed em Safari (e às
// vezes outros browsers). Sintoma = inputs com disabled=true via React.
// SignupDadosForm.isBusy → Field.disabled → cursor:not-allowed (CSS
// `.input.disabled:cursor-not-allowed` em _shared.jsx:50).
//
// Raiz: Welcome.jsx isBusy = useAuth.loading || success. success nunca
// vira truthy no flow normal. loading começava `true` (hidratação
// inicial) e ficava preso quando Safari ITP bloqueava o storage do
// supabase-js → getSession() travava silenciosamente → setLoading(false)
// nunca era alcançado → form bloqueado pra sempre.
//
// Fix:
//   1. loading começa `false`. Só fica true durante operações ativas
//      (signIn/signUp/updateProfile).
//   2. `hydrating` novo state, separado, true durante boot.
//   3. Safety net: hydrating vira false após HYDRATION_TIMEOUT_MS mesmo
//      se getSession nunca resolver (Safari ITP).
//   4. try/catch em getSession pra cobrir throws.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const USE_AUTH = join(SRC, "hooks/useAuth.jsx");
const WELCOME = join(SRC, "pages/Welcome.jsx");

describe("R36 — useAuth separa hydrating de loading", () => {
  const src = readFileSync(USE_AUTH, "utf8");

  it("loading inicia false (era true e ficava preso)", () => {
    expect(src).toMatch(/const \[loading, setLoading\] = useState\(false\)/);
  });

  it("hydrating é um state separado e começa true", () => {
    expect(src).toMatch(/const \[hydrating, setHydrating\] = useState\(true\)/);
  });

  it("Exposto no context", () => {
    expect(src).toMatch(/=> \(\{\s*user,\s*loading,\s*hydrating,/);
    expect(src).toMatch(/\[user,\s*loading,\s*hydrating,/);
  });

  it("HYDRATION_TIMEOUT_MS definido (safety net pra Safari ITP)", () => {
    expect(src).toMatch(/const HYDRATION_TIMEOUT_MS = \d+/);
  });

  it("safetyTimer força setHydrating(false) no timeout", () => {
    expect(src).toMatch(/safetyTimer = setTimeout/);
    expect(src).toMatch(/setHydrating\(false\)/);
    expect(src).toMatch(/hydration timeout/);
  });

  it("getSession envolvido em try/catch + finally limpa safetyTimer", () => {
    // Bloco { try ... } finally { clearTimeout(safetyTimer); setHydrating(false); }
    const hydrationBlock = src.slice(src.indexOf("safetyTimer = setTimeout"));
    expect(hydrationBlock).toMatch(/try\s*\{[\s\S]+?getSession/);
    expect(hydrationBlock).toMatch(/catch \(err\)/);
    expect(hydrationBlock).toMatch(/finally\s*\{[\s\S]+?clearTimeout\(safetyTimer\)[\s\S]+?setHydrating\(false\)/);
  });

  it("Cleanup do effect cancela o safetyTimer (evita leak/state-after-unmount)", () => {
    expect(src).toMatch(/return \(\) => \{[\s\S]+?clearTimeout\(safetyTimer\)/);
  });

  it("signIn/signUp/updateProfile setLoading(true) + finally setLoading(false) (inalterado)", () => {
    // Ainda usam loading pra travar UI durante operações ativas
    const signIn = src.match(/const signIn = useCallback[\s\S]+?\]\);/);
    expect(signIn?.[0]).toMatch(/setLoading\(true\)/);
    expect(signIn?.[0]).toMatch(/finally\s*\{\s*setLoading\(false\)/);
    const signUp = src.match(/const signUp = useCallback[\s\S]+?\]\);/);
    expect(signUp?.[0]).toMatch(/setLoading\(true\)/);
    expect(signUp?.[0]).toMatch(/finally\s*\{\s*setLoading\(false\)/);
  });
});

describe("R36 — Welcome.jsx usa loading (não hydrating) — comportamento inalterado pós-fix", () => {
  const src = readFileSync(WELCOME, "utf8");

  it("isBusy continua baseado em loading + success (sem hydrating)", () => {
    expect(src).toMatch(/const isBusy = loading \|\| !!success/);
    expect(src).not.toMatch(/hydrating/);
  });

  it("Não desestrutura hydrating do useAuth (continua só com loading)", () => {
    // Anti-regressão: se alguém adicionar hydrating no isBusy, form trava de novo
    const destructure = src.match(/const \{ [^}]+ \} = useAuth\(\);/);
    expect(destructure?.[0]).toBeTruthy();
    expect(destructure[0]).not.toMatch(/hydrating/);
  });
});
