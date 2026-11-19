import { describe, expect, test } from "vitest";
import { criarProvedores } from "./index";
import { FakeEntrada } from "./payment-in/fake";
import { FakeSaida } from "./payout/fake";

describe("criarProvedores", () => {
  test("fake monta os quatro provedores falsos", async () => {
    const p = criarProvedores({ PROVEDOR_PAGAMENTO: "fake", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://x" });
    expect(p.entrada).toBeInstanceOf(FakeEntrada);
    expect(p.saida).toBeInstanceOf(FakeSaida);
    expect(await p.captcha.verificar(null, null)).toBe(true);
    await expect(p.email.enviar({ para: "a@b.c", assunto: "oi", texto: "t", html: "<p>t</p>" })).resolves.toBeUndefined();
  });

  test("mercadopago ainda não existe nesta fase", () => {
    expect(() =>
      criarProvedores({ PROVEDOR_PAGAMENTO: "mercadopago", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://x" }),
    ).toThrow(/não implementado/);
  });

  test("valor desconhecido lança", () => {
    expect(() => criarProvedores({ PROVEDOR_PAGAMENTO: "x", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://x" })).toThrow();
  });
});
