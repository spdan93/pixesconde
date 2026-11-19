import { describe, expect, test } from "vitest";
import { FakeSaida } from "./fake";

const base = { refExterna: "rep_1", valorCentavos: 450, descricao: "PIX ESCONDE" };

describe("FakeSaida", () => {
  test("chave comum conclui na hora", async () => {
    const fake = new FakeSaida();
    const r = await fake.enviar({ ...base, chavePix: "7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93" });
    expect(r).toEqual({ idProvedor: "fake_rep_1", status: "concluido", chaveInvalida: false });
    expect(await fake.consultar("fake_rep_1")).toEqual({ status: "concluido" });
  });

  test("chave começando com 00000000 é inválida", async () => {
    const fake = new FakeSaida();
    const r = await fake.enviar({ ...base, chavePix: "00000000-04b1-4d8a-9f27-c21e5a6b0d93" });
    expect(r.status).toBe("falhou");
    expect(r.chaveInvalida).toBe(true);
  });

  test("chave começando com ffffffff falha de forma transitória", async () => {
    const fake = new FakeSaida();
    const r = await fake.enviar({ ...base, chavePix: "ffffffff-04b1-4d8a-9f27-c21e5a6b0d93" });
    expect(r.status).toBe("falhou");
    expect(r.chaveInvalida).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  test("guarda os envios para inspeção nos testes", async () => {
    const fake = new FakeSaida();
    await fake.enviar({ ...base, chavePix: "7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93" });
    expect(fake.envios).toHaveLength(1);
    expect(fake.envios[0]!.valorCentavos).toBe(450);
  });
});
