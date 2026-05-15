// Smoke test: trips — randomSlug + criação básica
//
// Por que: createTrip do useTrips gera slug random (8 chars do alfabeto
// curated). Bug em randomSlug = colisões garantidas → INSERT viola UNIQUE
// e o user vê erro feio. Test trava propriedades do generator.

import { describe, it, expect } from "vitest";
import { randomSlug } from "../src/lib/supabase.js";

describe("randomSlug", () => {
  it("retorna 8 chars por default", () => {
    expect(randomSlug()).toHaveLength(8);
  });

  it("respeita length custom", () => {
    expect(randomSlug(4)).toHaveLength(4);
    expect(randomSlug(16)).toHaveLength(16);
  });

  it("só usa o alfabeto curated (sem 0/o/1/l/i pra leitura humana)", () => {
    const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
    for (let i = 0; i < 50; i++) {
      const s = randomSlug(8);
      for (const ch of s) {
        expect(SLUG_ALPHABET).toContain(ch);
      }
    }
  });

  it("gera valores distintos (colisão deve ser extremamente rara)", () => {
    const slugs = new Set();
    for (let i = 0; i < 100; i++) slugs.add(randomSlug(8));
    // 32^8 = ~10^12 combos; 100 deve dar 100 distintos com chance ~1
    expect(slugs.size).toBeGreaterThanOrEqual(99);
  });
});
