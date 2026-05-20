// Smoke tests R35 — fix /api/create-subscription + paywall pendente.
//
// R35-A: Mercado Pago /preapproval retorna 500 Internal Server Error
// genérico pra emails com plus-addressing ("user+tag@dom.com"). Confirmado
// via curl direto contra api.mp.com em 2026-05-20. Solução: strip "+tag"
// antes de enviar pro MP. users.email no Supabase fica preservado.
//
// R35-B: /assinatura/pendente agora carrega afiliado pelo cupom guardado
// em sessionStorage (não passa mais afiliado=null pro PlanPicker).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { stripPlusAddressing } from "../netlify/functions/create-subscription.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const PENDENTE = join(SRC, "pages/AssinaturaPendente.jsx");
const CREATE_SUB = resolve(__dirname, "../netlify/functions/create-subscription.mjs");

describe("R35-A — stripPlusAddressing helper", () => {
  it("Remove '+tag' do local part", () => {
    expect(stripPlusAddressing("sidney+teste@gmail.com")).toBe("sidney@gmail.com");
    expect(stripPlusAddressing("sidneyvianads+teste99@gmail.com")).toBe("sidneyvianads@gmail.com");
  });

  it("Passthrough quando não há +", () => {
    expect(stripPlusAddressing("joao@empresa.com.br")).toBe("joao@empresa.com.br");
    expect(stripPlusAddressing("a.b.c@d.e.f.g")).toBe("a.b.c@d.e.f.g");
  });

  it("Lida com edge cases sem throw", () => {
    expect(stripPlusAddressing("")).toBe("");
    expect(stripPlusAddressing(null)).toBe("");
    expect(stripPlusAddressing(undefined)).toBe("");
    expect(stripPlusAddressing(123)).toBe("");
  });

  it("Não toca o '+' no domínio (improvável, mas defensivo)", () => {
    // Pluses só no local part. Se aparecer no dominio, fica.
    // (Tecnicamente '+' não é válido em domínio FQDN; teste só pra
    // garantir que a regex não come o domínio.)
    expect(stripPlusAddressing("user@a+b.com")).toBe("user@a+b.com");
  });

  it("Localmente vazio após strip = só @domain (corner case)", () => {
    // "+tag@x.com" → "@x.com" — MP ainda rejeita mas não é nosso problema
    expect(stripPlusAddressing("+tag@x.com")).toBe("@x.com");
  });

  it("Email sem @ retorna como veio (não-email; defensive)", () => {
    expect(stripPlusAddressing("nope")).toBe("nope");
  });
});

describe("R35-A — create-subscription chama stripPlusAddressing", () => {
  const src = readFileSync(CREATE_SUB, "utf8");

  it("Exporta stripPlusAddressing", () => {
    expect(src).toMatch(/export function stripPlusAddressing/);
  });

  it("preapprovalBody.payer_email passa pelo strip antes de POST", () => {
    expect(src).toMatch(/payer_email:\s*stripPlusAddressing\(userEmail\)/);
  });

  it("userEmail bruto continua disponível (do JWT) — não estamos sobrescrevendo o original", () => {
    // userEmail vem de authedUser.email no verifyAuth — não modificado.
    expect(src).toMatch(/const userEmail = authedUser\.email/);
  });
});

describe("R35-B — AssinaturaPendente carrega afiliado do cupom", () => {
  const src = readFileSync(PENDENTE, "utf8");

  it("State afiliado declarado", () => {
    expect(src).toMatch(/const \[afiliado, setAfiliado\] = useState\(null\)/);
  });

  it("Effect que busca afiliado por cupom (sem deps — uma vez no mount)", () => {
    expect(src).toMatch(/getStoredCupom\(\)/);
    expect(src).toMatch(/\.from\(["']afiliados["']\)/);
    expect(src).toMatch(/\.eq\(["']cupom["'],\s*cupom\.toUpperCase\(\)\)/);
    expect(src).toMatch(/\.eq\(["']ativo["'],\s*true\)/);
  });

  it("PlanPicker recebe afiliado={afiliado} (não null)", () => {
    expect(src).toMatch(/<PlanPicker[\s\S]{0,200}?afiliado=\{afiliado\}/);
    expect(src).not.toMatch(/<PlanPicker[\s\S]{0,200}?afiliado=\{null\}/);
  });

  it("Fallback gracioso: erro no Supabase só warna, não quebra", () => {
    // Se a query falha, console.warn + return (afiliado permanece null,
    // PlanPicker renderiza com preço cheio mas backend ainda valida o
    // cupom no checkout).
    expect(src).toMatch(/console\.warn\(["']\[AssinaturaPendente\] afiliado lookup falhou/);
  });
});
