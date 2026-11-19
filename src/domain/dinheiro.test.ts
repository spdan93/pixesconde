import { describe, expect, test } from "vitest";
import { calcularTaxa, formatarBp, formatarReais, interpretarReais } from "./dinheiro";

describe("calcularTaxa", () => {
  test("10% de R$ 5,00 fica R$ 0,50 e sobra R$ 4,50", () => {
    expect(calcularTaxa(500, 1000)).toEqual({ taxa: 50, liquido: 450 });
  });

  test("arredonda meio centavo para cima", () => {
    expect(calcularTaxa(999, 1000)).toEqual({ taxa: 100, liquido: 899 });
  });

  test("taxa zero não desconta nada", () => {
    expect(calcularTaxa(500, 0)).toEqual({ taxa: 0, liquido: 500 });
  });
});

describe("formatarReais", () => {
  test("centavos viram reais com vírgula", () => {
    expect(formatarReais(500)).toBe("R$ 5,00");
  });

  test("milhar recebe ponto", () => {
    expect(formatarReais(123450)).toBe("R$ 1.234,50");
  });
});

describe("formatarBp", () => {
  test("basis points inteiros", () => {
    expect(formatarBp(1000)).toBe("10%");
  });

  test("basis points fracionários", () => {
    expect(formatarBp(1250)).toBe("12,5%");
  });
});

describe("interpretarReais", () => {
  test.each([
    ["5", 500],
    ["5,00", 500],
    ["R$ 10", 1000],
    ["10.5", 1050],
    ["4,99", 499],
    [" 20 ", 2000],
  ])("aceita %j como %i centavos", (texto, esperado) => {
    expect(interpretarReais(texto)).toBe(esperado);
  });

  test.each([["1e3"], [""], ["abc"], ["-5"], ["5,999"], ["1.000,00"]])(
    "recusa %j",
    (texto) => {
      expect(interpretarReais(texto)).toBeNull();
    },
  );
});
