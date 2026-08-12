import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config — unit tests for pure logic (password hashing, throttle,
 * time helpers, zod schemas, role checks). Node environment: no DOM, no
 * Next.js runtime, no Supabase. Tests live next to the code they cover
 * (*.test.ts) and are excluded from the app router by living outside src/app.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
