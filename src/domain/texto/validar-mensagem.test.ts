import { describe, expect, test } from "vitest";
import { validarMensagem } from "./validar-mensagem";

describe("validarMensagem", () => {
  test("vazia vira null", () => {
    expect(validarMensagem("   ", [])).toEqual({ ok: true, mensagem: null });
  });

  test("apara e colapsa espaços", () => {
    expect(validarMensagem("  toma,   compra um pastel ", [])).toEqual({
      ok: true,
      mensagem: "toma, compra um pastel",
    });
  });

  test("recusa acima de 140 caracteres", () => {
    expect(validarMensagem("a".repeat(141), [])).toEqual({ ok: false, motivo: "tamanho" });
  });

  test("aceita exatamente 140", () => {
    expect(validarMensagem("a".repeat(140), [])).toEqual({ ok: true, mensagem: "a".repeat(140) });
  });

  test.each([["olha http://x.com"], ["vai em www.site.com.br"], ["pix.me/x"]])(
    "recusa link: %j",
    (texto) => {
      expect(validarMensagem(texto, [])).toEqual({ ok: false, motivo: "link" });
    },
  );

  test.each([["me chama a@b.com"], ["zap 11999999999"], ["cpf 123.456.789-09"], ["liga 11 99999 9999"]])(
    "recusa contato: %j",
    (texto) => {
      expect(validarMensagem(texto, [])).toEqual({ ok: false, motivo: "contato" });
    },
  );

  test("recusa palavra bloqueada sem distinguir caixa nem acento", () => {
    expect(validarMensagem("seu BÓBO", ["bobo"])).toEqual({ ok: false, motivo: "bloqueada" });
  });

  test("palavra bloqueada só conta como palavra inteira", () => {
    expect(validarMensagem("bobocas são legais", ["bobo"])).toEqual({
      ok: true,
      mensagem: "bobocas são legais",
    });
  });
});
