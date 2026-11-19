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
