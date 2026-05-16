// Smoke test: safeHref (R7-5)
//
// Por que: PlanChat + AiChat renderizam markdown do Claude. Sem
// sanitização, Claude pode emitir href=javascript:... via prompt
// injection. safeHref bloqueia. Test trava regressão.

import { describe, it, expect } from "vitest";
import { safeHref } from "../src/lib/safeHref.js";

describe("safeHref — protocol allowlist", () => {
  it("aceita http://", () => {
    expect(safeHref("http://example.com")).toBe("http://example.com");
  });

  it("aceita https://", () => {
    expect(safeHref("https://booking.com/x")).toBe("https://booking.com/x");
  });

  it("aceita mailto:", () => {
    expect(safeHref("mailto:foo@bar.com")).toBe("mailto:foo@bar.com");
  });

  it("aceita tel:", () => {
    expect(safeHref("tel:+5511999")).toBe("tel:+5511999");
  });

  it("aceita anchors #", () => {
    expect(safeHref("#section")).toBe("#section");
  });

  it("aceita paths relativos /", () => {
    expect(safeHref("/v/abc")).toBe("/v/abc");
  });

  it("BLOQUEIA javascript:", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
  });

  it("BLOQUEIA javascript: com case mixed", () => {
    expect(safeHref("JavaScript:alert(1)")).toBe("#");
  });

  it("BLOQUEIA javascript: com whitespace", () => {
    expect(safeHref("  javascript:alert(1)  ")).toBe("#");
  });

  it("BLOQUEIA data:", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBe("#");
  });

  it("BLOQUEIA vbscript:", () => {
    expect(safeHref("vbscript:msgbox(1)")).toBe("#");
  });

  it("BLOQUEIA file://", () => {
    expect(safeHref("file:///etc/passwd")).toBe("#");
  });

  it("rejeita null/undefined/empty", () => {
    expect(safeHref(null)).toBe("#");
    expect(safeHref(undefined)).toBe("#");
    expect(safeHref("")).toBe("#");
  });

  it("auto-prepend https:// pra domínio sem protocolo", () => {
    expect(safeHref("booking.com/x")).toBe("https://booking.com/x");
    expect(safeHref("instagram.com/perfil")).toBe("https://instagram.com/perfil");
  });

  it("rejeita string suspeita sem protocolo nem domínio", () => {
    expect(safeHref("not-a-url")).toBe("#");
    expect(safeHref("alert(1)")).toBe("#");
  });

  // R8-1: regressões reportadas na rodada Mythos R8
  describe("R8-1 vetores protocol-relative e variantes", () => {
    it("BLOQUEIA //evil.com (protocol-relative — vira https no browser)", () => {
      expect(safeHref("//evil.com")).toBe("#");
    });

    it("BLOQUEIA //evil.com/path?q=1", () => {
      expect(safeHref("//evil.com/path?q=1")).toBe("#");
    });

    it("BLOQUEIA com whitespace antes: '  //evil.com'", () => {
      expect(safeHref("  //evil.com")).toBe("#");
    });

    it("mantém /single-slash path relativo normal", () => {
      expect(safeHref("/v/abc")).toBe("/v/abc");
    });

    it("BLOQUEIA javascript:alert#fake-anchor (fragment after protocol)", () => {
      expect(safeHref("javascript:alert(1)#fake")).toBe("#");
    });

    it("preserva https com queryString", () => {
      expect(safeHref("https://x.com/p?a=1&b=2")).toBe("https://x.com/p?a=1&b=2");
    });
  });
});
