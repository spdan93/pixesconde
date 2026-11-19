import { afterEach, describe, expect, test, vi } from "vitest";
import { criarProvedores } from "../index";
import type { ConsoleEmail } from "./console";

const mensagem = { para: "alguem@exemplo.com", assunto: "Confirme seu apelido", texto: "https://x/apelido/confirmar/TOKEN123", html: "<a>TOKEN123</a>" };
const env = { PROVEDOR_PAGAMENTO: "fake", PROVEDOR_REPASSE: "fake", PROVEDOR_EMAIL: "console", PROVEDOR_CAPTCHA: "sempre-ok" };

afterEach(() => vi.restoreAllMocks());

describe("ConsoleEmail", () => {
  test("com URL https, o log não leva destinatário nem corpo (o corpo tem o link mágico)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = criarProvedores({ ...env, URL_PUBLICA: "https://pix-esconde.exemplo.workers.dev" }).email as ConsoleEmail;
    await email.enviar(mensagem);
    const impresso = log.mock.calls.flat().join(" ");
    expect(impresso).toContain("Confirme seu apelido");
    expect(impresso).not.toContain("alguem@exemplo.com");
    expect(impresso).not.toContain("TOKEN123");
  });

  test("em dev (http), o log mostra o link para dar para clicar", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = criarProvedores({ ...env, URL_PUBLICA: "http://localhost:5173" }).email as ConsoleEmail;
    await email.enviar(mensagem);
    expect(log.mock.calls.flat().join(" ")).toContain("TOKEN123");
  });
});
