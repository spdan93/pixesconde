import { describe, expect, test } from "vitest";
import {
  assinarCookie,
  cifrar,
  decifrar,
  gerarToken,
  hmacHex,
  sha256Hex,
  verificarCookie,
} from "./crypto";

const CHAVE = "wJ1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0a=";
const OUTRA = "Zz1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0b=";

describe("cifrar / decifrar", () => {
  test("round-trip devolve o texto original com prefixo de versão", async () => {
    const cifrado = await cifrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93", CHAVE);
    expect(cifrado.startsWith("enc:v1:")).toBe(true);
    expect(await decifrar(cifrado, CHAVE)).toBe("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
  });

  test("duas cifras do mesmo texto diferem (IV aleatório)", async () => {
    expect(await cifrar("x", CHAVE)).not.toBe(await cifrar("x", CHAVE));
  });

  test("chave errada lança", async () => {
    const cifrado = await cifrar("segredo", CHAVE);
    await expect(decifrar(cifrado, OUTRA)).rejects.toThrow();
  });

  test("texto sem prefixo volta como está (rollout)", async () => {
    expect(await decifrar("texto-plano", CHAVE)).toBe("texto-plano");
  });
});

describe("hmacHex", () => {
  test("é determinístico e muda com o segredo", async () => {
    const a = await hmacHex("chave", CHAVE);
    expect(a).toBe(await hmacHex("chave", CHAVE));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await hmacHex("chave", OUTRA));
  });
});

describe("sha256Hex", () => {
  test("hash conhecido", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("gerarToken", () => {
  test("tem 32 caracteres url-safe e não repete", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => gerarToken()));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("cookie assinado", () => {
  test("assina e verifica", async () => {
    const assinado = await assinarCookie("apelido:123", CHAVE);
    expect(await verificarCookie(assinado, CHAVE)).toBe("apelido:123");
  });

  test("adulterado devolve null", async () => {
    const assinado = await assinarCookie("apelido:123", CHAVE);
    expect(await verificarCookie(assinado.replace("123", "124"), CHAVE)).toBeNull();
    expect(await verificarCookie("lixo", CHAVE)).toBeNull();
  });
});
