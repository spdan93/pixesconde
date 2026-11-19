import { describe, expect, test } from "vitest";
import { validarApelido } from "./validar-apelido";

describe("validarApelido", () => {
  test("vazio vira null", () => {
    expect(validarApelido("  ")).toEqual({ ok: true, apelido: null });
  });

  test("normaliza para minúsculas e apara", () => {
    expect(validarApelido(" Pastel_De_Vento ")).toEqual({ ok: true, apelido: "pastel_de_vento" });
  });

  test.each([["ab"], ["a".repeat(25)], ["tia do zap"], ["tia-do-zap"], ["açaí"], ["anônimo"]])(
    "recusa %j",
    (texto) => {
      expect(validarApelido(texto)).toEqual({ ok: false, motivo: "formato" });
    },
  );

  test("recusa a palavra reservada anonimo", () => {
    expect(validarApelido("anonimo")).toEqual({ ok: false, motivo: "reservado" });
  });
});
