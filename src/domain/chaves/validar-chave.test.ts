import { describe, expect, test } from "vitest";
import { mascararChave, mensagemRecusa, validarChaveAleatoria } from "./validar-chave";

const UUID = "7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93";

describe("validarChaveAleatoria", () => {
  test("aceita UUID em minúsculas", () => {
    expect(validarChaveAleatoria(UUID)).toEqual({ ok: true, chave: UUID });
  });

  test("normaliza maiúsculas e espaços nas pontas", () => {
    expect(validarChaveAleatoria(`  ${UUID.toUpperCase()}  `)).toEqual({ ok: true, chave: UUID });
  });

  test("aceita 32 hex sem hífens e devolve com hífens", () => {
    expect(validarChaveAleatoria(UUID.replaceAll("-", ""))).toEqual({ ok: true, chave: UUID });
  });

  test.each([
    ["123.456.789-09", "cpf"],
    ["12345678909", "cpf"],
    ["12.345.678/0001-95", "cnpj"],
    ["12345678000195", "cnpj"],
    ["a@b.com", "email"],
    ["+5511999999999", "telefone"],
    ["11999999999", "telefone"],
    ["(11) 99999-9999", "telefone"],
    ["abc", "formato"],
    ["", "formato"],
    ["7f3a9c2e-04b1-4d8a-9f27", "formato"],
  ])("recusa %j com motivo %s", (entrada, motivo) => {
    expect(validarChaveAleatoria(entrada)).toEqual({ ok: false, motivo });
  });
});

describe("mascararChave", () => {
  test("mantém só o primeiro e o último grupo", () => {
    expect(mascararChave(UUID)).toBe("7f3a9c2e-••••-••••-••••-c21e5a6b0d93");
  });
});

describe("mensagemRecusa", () => {
  test("explica que só chave aleatória entra", () => {
    expect(mensagemRecusa("cpf")).toContain("só chave aleatória");
    expect(mensagemRecusa("formato")).toContain("32 caracteres");
  });
});
