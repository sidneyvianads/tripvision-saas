import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,mjs}"],
    // Smoke tests: rápidos, sem rede real. Mocks pra Supabase/Anthropic/MP.
    testTimeout: 5000,
    // CI ambiente: sem watch, sem cobertura por enquanto (vai virar TODO
    // separado quando o conjunto de tests crescer).
    watch: false,
    coverage: { enabled: false },
  },
});
