import { defineConfig, devices } from "@playwright/test";

/**
 * Ponta a ponta contra o dev server (runtime do Worker) e o Postgres local.
 * Precisa de: docker start pix-esconde-pg; pnpm db:migrate. Não entra no verify.sh.
 * Com E2E_URL, roda contra um site já publicado (a demo) e não sobe dev server.
 */
const urlExterna = process.env.E2E_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: urlExterna ?? "http://localhost:5173",
    trace: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: urlExterna
    ? undefined
    : {
        command: "pnpm dev --port 5173 --strictPort",
        url: "http://localhost:5173/",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
