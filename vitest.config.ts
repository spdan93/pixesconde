import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~": `${raiz}app`,
      "@": `${raiz}src`,
    },
  },
  test: {
    passWithNoTests: true,
    // PGlite sobe um Postgres em WASM por arquivo; com a máquina ocupada (e2e rodando ao lado) os 10 s padrão estouram.
    hookTimeout: 30_000,
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: "dominio",
          environment: "node",
          include: ["src/**/*.test.ts", "app/**/*.server.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "componentes",
          environment: "jsdom",
          include: ["app/**/*.test.tsx"],
          setupFiles: ["./app/teste/setup.ts"],
        },
      },
    ],
  },
});
