// Smoke test: hasActiveAccess + isPaid + isOwner (R8-5)
//
// Por que: hasActiveAccess tinha um bypass — NULL plano_expires_at
// retornava true pra qualquer plano, incluindo pro/grupo. UPDATE
// manual via SQL Editor sem setar expiry dava acesso vitalício
// grátis. Test trava regressão.

import { describe, it, expect } from "vitest";
import { hasActiveAccess, isPaid, isOwner, needsSubscription, isInTrial } from "../src/data/plans.js";

const futuro = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const passado = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

describe("hasActiveAccess — R8-5", () => {
  it("owner sem expires_at → ativo (acesso interno)", () => {
    expect(hasActiveAccess({ plano: "owner", plano_expires_at: null })).toBe(true);
  });

  it("owner com expires_at no passado → AINDA ativo (owner ignora data)", () => {
    expect(hasActiveAccess({ plano: "owner", plano_expires_at: passado })).toBe(true);
  });

  it("pro com expires_at FUTURO → ativo", () => {
    expect(hasActiveAccess({ plano: "pro", plano_expires_at: futuro })).toBe(true);
  });

  it("pro com expires_at NULL → EXPIRED (R8-5: era bug — retornava true)", () => {
    expect(hasActiveAccess({ plano: "pro", plano_expires_at: null })).toBe(false);
  });

  it("grupo com expires_at NULL → EXPIRED (R8-5)", () => {
    expect(hasActiveAccess({ plano: "grupo", plano_expires_at: null })).toBe(false);
  });

  it("grupo com expires_at no passado → expired", () => {
    expect(hasActiveAccess({ plano: "grupo", plano_expires_at: passado })).toBe(false);
  });

  it("pending → expired", () => {
    expect(hasActiveAccess({ plano: "pending", plano_expires_at: futuro })).toBe(false);
  });

  it("free → expired", () => {
    expect(hasActiveAccess({ plano: "free" })).toBe(false);
  });

  it("user null → expired", () => {
    expect(hasActiveAccess(null)).toBe(false);
  });
});

describe("isOwner / isPaid", () => {
  it("isOwner reconhece owner", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("pro")).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it("isPaid: pro, grupo, owner", () => {
    expect(isPaid("pro")).toBe(true);
    expect(isPaid("grupo")).toBe(true);
    expect(isPaid("owner")).toBe(true);
    expect(isPaid("pending")).toBe(false);
    expect(isPaid("free")).toBe(false);
    expect(isPaid(null)).toBe(false);
  });
});

describe("needsSubscription / isInTrial", () => {
  it("needsSubscription = !hasActiveAccess", () => {
    expect(needsSubscription({ plano: "pending" })).toBe(true);
    expect(needsSubscription({ plano: "owner" })).toBe(false);
    expect(needsSubscription({ plano: "pro", plano_expires_at: futuro })).toBe(false);
    expect(needsSubscription({ plano: "pro", plano_expires_at: null })).toBe(true); // R8-5
  });

  it("isInTrial só com trial_ends_at futuro", () => {
    expect(isInTrial({ trial_ends_at: futuro })).toBe(true);
    expect(isInTrial({ trial_ends_at: passado })).toBe(false);
    expect(isInTrial({ trial_ends_at: null })).toBe(false);
    expect(isInTrial({})).toBe(false);
  });
});
