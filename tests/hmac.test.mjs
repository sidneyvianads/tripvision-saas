// Smoke test: webhook-mp HMAC validation
//
// Por que este teste existe: a R3 introduziu validação HMAC do x-signature
// do Mercado Pago. Bug nessa função permite recibo de webhook forjado →
// atacante ativa plano de qualquer user sem pagar. Test trava regressão.

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { validateMpSignature } from "../netlify/functions/webhook-mp.mjs";

const SECRET = "test_secret_abc123";
const TS = "1234567890";
const REQUEST_ID = "req-abc";
const DATA_ID = "preapproval-42";

function buildManifest(dataId, requestId, ts) {
  return `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
}

function buildValidSig(dataId = DATA_ID, requestId = REQUEST_ID, ts = TS, secret = SECRET) {
  return createHmac("sha256", secret).update(buildManifest(dataId, requestId, ts)).digest("hex");
}

// Mock mínimo de Request do Web API com .headers.get(name).
function mockReq(headers, secret = SECRET) {
  // Inject MP_WEBHOOK_SECRET no env do teste
  process.env.MP_WEBHOOK_SECRET = secret;
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: {
      get: (k) => lower.get(k.toLowerCase()) ?? null,
    },
  };
}

describe("validateMpSignature", () => {
  it("aceita HMAC válido", () => {
    const v1 = buildValidSig();
    const req = mockReq({
      "x-signature": `ts=${TS},v1=${v1}`,
      "x-request-id": REQUEST_ID,
    });
    const result = validateMpSignature(req, DATA_ID);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("validated");
  });

  it("rejeita HMAC forjado com hex diferente", () => {
    const forged = "0".repeat(64);
    const req = mockReq({
      "x-signature": `ts=${TS},v1=${forged}`,
      "x-request-id": REQUEST_ID,
    });
    const result = validateMpSignature(req, DATA_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/HMAC/);
  });

  it("rejeita quando x-signature ausente", () => {
    const req = mockReq({ "x-request-id": REQUEST_ID });
    const result = validateMpSignature(req, DATA_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ausente/);
  });

  it("rejeita HMAC com dataId trocado (manifest mismatch)", () => {
    const v1 = buildValidSig(DATA_ID);
    const req = mockReq({
      "x-signature": `ts=${TS},v1=${v1}`,
      "x-request-id": REQUEST_ID,
    });
    // Mesmo HMAC mas passamos data_id diferente → reconstrói manifest errado
    const result = validateMpSignature(req, "outro-data-id");
    expect(result.ok).toBe(false);
  });

  it("modo permissivo quando MP_WEBHOOK_SECRET não setado", () => {
    delete process.env.MP_WEBHOOK_SECRET;
    const req = mockReq({}, undefined);
    delete process.env.MP_WEBHOOK_SECRET; // mockReq seta — limpar
    const result = validateMpSignature(req, DATA_ID);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("permissive");
  });

  it("rejeita v1 com tamanho de buffer diferente (defesa timingSafeEqual)", () => {
    const req = mockReq({
      "x-signature": `ts=${TS},v1=deadbeef`, // 8 chars = 4 bytes (não 32)
      "x-request-id": REQUEST_ID,
    });
    const result = validateMpSignature(req, DATA_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/tamanho/);
  });
});
