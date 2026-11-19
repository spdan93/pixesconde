import { describe, expect, test } from "vitest";
import { FakeEntrada } from "./fake";

describe("FakeEntrada", () => {
  test("cobrança aponta para a página de pagamento de dev e começa pendente", async () => {
    const fake = new FakeEntrada("http://localhost:5173");
    const cobranca = await fake.criarCobranca({
      refExterna: "doa_1",
      valorCentavos: 500,
      descricao: "Pix sem motivo",
      urlRetorno: "http://localhost:5173/comprovante/1",
      expiraEm: new Date(Date.now() + 60_000),
    });
    expect(cobranca.urlPagamento).toBe("http://localhost:5173/dev/pagar/doa_1");
    expect(await fake.consultar({ refExterna: "doa_1", idProvedor: cobranca.idProvedor })).toMatchObject({
      status: "pendente",
      valorCentavos: 500,
    });
  });

  test("marcar resultado muda a consulta", async () => {
    const fake = new FakeEntrada("http://x");
    await fake.criarCobranca({ refExterna: "doa_2", valorCentavos: 1000, descricao: "", urlRetorno: "", expiraEm: new Date() });
    fake.marcarResultado("doa_2", "aprovado");
    expect(await fake.consultar({ refExterna: "doa_2", idProvedor: null })).toMatchObject({ status: "aprovado", valorCentavos: 1000 });
    fake.marcarResultado("doa_2", "rejeitado");
    expect((await fake.consultar({ refExterna: "doa_2", idProvedor: null })).status).toBe("rejeitado");
  });

  test("ref desconhecida é desconhecida, e pode ser forçada como aprovada", async () => {
    const fake = new FakeEntrada("http://x");
    expect((await fake.consultar({ refExterna: "nada", idProvedor: null })).status).toBe("desconhecido");
    fake.marcarResultado("nada", "aprovado", 700);
    expect(await fake.consultar({ refExterna: "nada", idProvedor: null })).toMatchObject({ status: "aprovado", valorCentavos: 700 });
  });

  test("reembolso registra e responde ok", async () => {
    const fake = new FakeEntrada("http://x");
    expect(await fake.reembolsar({ idProvedor: "fake_pg_1", valorCentavos: 500 })).toEqual({ ok: true });
    expect(fake.reembolsos).toEqual([{ idProvedor: "fake_pg_1", valorCentavos: 500 }]);
  });
});
