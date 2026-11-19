import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { criarDbTeste } from "@/infra/db/teste";
import type { Db } from "@/infra/db/client";
import { gravarConfig, lerConfig } from "@/infra/db/config";
import { chavesPix, doacoes, lancamentos, repasses } from "@/infra/db/schema";
import { criarProvedores } from "@/providers";
import type { FakeEntrada } from "@/providers/payment-in/fake";
import { criarServicoRecebedores, type ServicoRecebedores } from "@/domain/recebedores/servico";
import { saldo } from "@/domain/razao/servico";
import { criarServicoDoacoes, type ServicoDoacoes } from "./servico";

const SEGREDOS = {
  chaveCifra: "wJ1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0a=",
  segredoHmac: "Zz1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0b=",
};

let db: Db;
let fechar: () => Promise<void>;
let recebedores: ServicoRecebedores;
let servico: ServicoDoacoes;
let entrada: FakeEntrada;
let relogio = new Date("2026-11-18T20:00:00Z");
const agendar = vi.fn(async (_recebedorId: string) => "rep_x");

const provedores = criarProvedores({ PROVEDOR_PAGAMENTO: "fake", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://x" }, { silencioso: true });

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
  recebedores = criarServicoRecebedores(db, SEGREDOS);
  entrada = provedores.entrada as FakeEntrada;
  servico = criarServicoDoacoes({
    db,
    provedores,
    recebedores,
    config: () => lerConfig(db),
    urlPublica: "http://x",
    agora: () => relogio,
  });
  servico.setRepasses({ agendarParaRecebedor: agendar });
  await recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93"); // #1
  const r2 = await recebedores.cadastrar("11111111-2222-4333-8444-555555555555"); // #2
  if (r2.ok) {
    const priv = await recebedores.buscarPorToken(r2.token);
    await recebedores.pausar(priv!.id);
  }
});

afterAll(async () => {
  await fechar();
});

const base = { numeroPublico: 1, valorTexto: "5", mensagem: "toma, compra um pastel", apelido: "pastel_de_vento", apelidoIdDoCookie: null };

describe("criarIntencao", () => {
  test("valor abaixo do mínimo", async () => {
    expect(await servico.criarIntencao({ ...base, valorTexto: "4,99" })).toMatchObject({ ok: false, campo: "valor" });
  });

  test("valor acima do máximo", async () => {
    expect(await servico.criarIntencao({ ...base, valorTexto: "600" })).toMatchObject({ ok: false, campo: "valor" });
  });

  test("mensagem com link e apelido inválido apontam o campo", async () => {
    expect(await servico.criarIntencao({ ...base, mensagem: "veja www.x.com" })).toMatchObject({ ok: false, campo: "mensagem" });
    expect(await servico.criarIntencao({ ...base, apelido: "a b" })).toMatchObject({ ok: false, campo: "apelido" });
  });

  test("recebedor pausado ou inexistente", async () => {
    expect(await servico.criarIntencao({ ...base, numeroPublico: 2 })).toMatchObject({ ok: false, campo: "recebedor" });
    expect(await servico.criarIntencao({ ...base, numeroPublico: 999 })).toMatchObject({ ok: false, campo: "recebedor" });
  });

  test("R$ 5 cria doação pendente com taxa de 10% e URL do provedor", async () => {
    const r = await servico.criarIntencao(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.urlPagamento).toBe(`http://x/dev/pagar/doa_${r.doacaoId}`);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, r.doacaoId));
    expect(d).toMatchObject({
      status: "pendente",
      valorCentavos: 500,
      taxaBp: 1000,
      taxaCentavos: 50,
      liquidoCentavos: 450,
      mensagem: "toma, compra um pastel",
      apelidoTexto: "pastel_de_vento",
      refExterna: `doa_${r.doacaoId}`,
    });
    expect(d!.expiraEm.getTime()).toBe(relogio.getTime() + 30 * 60_000);
  });
});

describe("processarNotificacao", () => {
  let doacaoId: string;

  test("aprovada confirma uma vez e lança entrada e taxa no razão", async () => {
    const r = await servico.criarIntencao({ ...base, mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    doacaoId = r.doacaoId;
    const ref = `doa_${doacaoId}`;
    entrada.marcarResultado(ref, "aprovado");
    const resultado = await servico.processarNotificacao({
      provedor: "fake",
      idExterno: "evt_1",
      refExterna: ref,
      idProvedor: null,
      payload: { x: 1 },
    });
    expect(resultado).toEqual({ resultado: "confirmada", efeitosPendentes: false });
    const linhas = await db.select().from(lancamentos).where(eq(lancamentos.doacaoId, doacaoId));
    expect(linhas.map((l) => [l.tipo, l.valorCentavos])).toEqual([
      ["entrada", 500],
      ["taxa", -50],
    ]);
    expect(await saldo(db)).toBe(450);
  });

  test("a mesma notificação de novo é ignorada", async () => {
    const ref = `doa_${doacaoId}`;
    const r = await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_1", refExterna: ref, idProvedor: null, payload: {} });
    expect(r.resultado).toBe("ja_processada");
    expect(await db.select().from(lancamentos).where(eq(lancamentos.doacaoId, doacaoId))).toHaveLength(2);
  });

  test("outra notificação para a mesma doação também não lança de novo", async () => {
    const ref = `doa_${doacaoId}`;
    const r = await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_2", refExterna: ref, idProvedor: null, payload: {} });
    expect(r.resultado).toBe("ja_processada");
    expect(await db.select().from(lancamentos).where(eq(lancamentos.doacaoId, doacaoId))).toHaveLength(2);
    expect(await saldo(db)).toBe(450);
  });

  test("rejeitada não confirma", async () => {
    const r = await servico.criarIntencao({ ...base, mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    const ref = `doa_${r.doacaoId}`;
    entrada.marcarResultado(ref, "rejeitado");
    const res = await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_3", refExterna: ref, idProvedor: null, payload: {} });
    expect(res.resultado).toBe("nao_aprovada");
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, r.doacaoId));
    expect(d!.status).toBe("pendente");
  });

  test("ref desconhecida", async () => {
    const res = await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_4", refExterna: "doa_nada", idProvedor: null, payload: {} });
    expect(res.resultado).toBe("desconhecida");
  });

  test("com gatilho imediato, agenda o repasse uma vez", async () => {
    await gravarConfig(db, { gatilhoRepasse: "imediato" });
    const r = await servico.criarIntencao({ ...base, mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    const ref = `doa_${r.doacaoId}`;
    entrada.marcarResultado(ref, "aprovado");
    agendar.mockClear();
    await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_5", refExterna: ref, idProvedor: null, payload: {} });
    await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_6", refExterna: ref, idProvedor: null, payload: {} });
    expect(agendar).toHaveBeenCalledTimes(1);
    await gravarConfig(db, { gatilhoRepasse: "diario" });
  });

  test("falha nos efeitos não impede a confirmação e é sinalizada", async () => {
    await gravarConfig(db, { gatilhoRepasse: "imediato" });
    agendar.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const r = await servico.criarIntencao({ ...base, mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    const ref = `doa_${r.doacaoId}`;
    entrada.marcarResultado(ref, "aprovado");
    const res = await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_7", refExterna: ref, idProvedor: null, payload: {} });
    expect(res).toEqual({ resultado: "confirmada", efeitosPendentes: true });
    await gravarConfig(db, { gatilhoRepasse: "diario" });
  });
});

describe("expirar e estornar", () => {
  test("expirarIntencoes só toca pendentes vencidas", async () => {
    const r = await servico.criarIntencao({ ...base, mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    relogio = new Date(relogio.getTime() + 31 * 60_000);
    const n = await servico.expirarIntencoes();
    expect(n).toBeGreaterThanOrEqual(1);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, r.doacaoId));
    expect(d!.status).toBe("expirada");
    const confirmadas = await db.select().from(doacoes).where(eq(doacoes.status, "confirmada"));
    expect(confirmadas.length).toBeGreaterThanOrEqual(3);
  });

  test("estornar gera reversões, pede reembolso e zera o efeito no saldo", async () => {
    const antes = await saldo(db);
    const r = await servico.criarIntencao({ ...base, valorTexto: "20", mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    const ref = `doa_${r.doacaoId}`;
    entrada.marcarResultado(ref, "aprovado");
    await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_8", refExterna: ref, idProvedor: null, payload: {} });
    expect(await saldo(db)).toBe(antes + 1800);
    const ok = await servico.estornar(r.doacaoId, "chave inválida há 30 dias");
    expect(ok).toBe(true);
    expect(await saldo(db)).toBe(antes);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, r.doacaoId));
    expect(d!.status).toBe("estornada");
    expect(entrada.reembolsos.at(-1)).toMatchObject({ valorCentavos: 2000 });
    expect(await servico.estornar(r.doacaoId, "de novo")).toBe(false);
  });
});

describe("buscarComprovante", () => {
  test("devolve os campos do recibo", async () => {
    const r = await servico.criarIntencao({ ...base, valorTexto: "10" });
    if (!r.ok) throw new Error("setup");
    const pendente = await servico.buscarComprovante(r.doacaoId);
    expect(pendente).toMatchObject({ status: "pendente", valorCentavos: 1000, numeroPublico: 1, previsaoRepasse: null });
    const ref = `doa_${r.doacaoId}`;
    entrada.marcarResultado(ref, "aprovado");
    await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_9", refExterna: ref, idProvedor: null, payload: {} });
    const c = await servico.buscarComprovante(r.doacaoId);
    expect(c).toMatchObject({
      status: "confirmada",
      valorCentavos: 1000,
      taxaCentavos: 100,
      liquidoCentavos: 900,
      apelidoTexto: "pastel_de_vento",
      mensagem: "toma, compra um pastel",
      previsaoRepasse: "no próximo repasse",
    });
    expect(c!.numeroComprovante).toBeGreaterThan(0);
    expect(await servico.buscarComprovante("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("estorno e repasse", () => {
  test("não estorna doação cujo repasse está agendado ou enviando", async () => {
    const r = await servico.criarIntencao({ ...base, valorTexto: "5", mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
    await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_10", refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, r.doacaoId));
    const [chave] = await db.select().from(chavesPix).where(eq(chavesPix.recebedorId, d!.recebedorId));
    const [rep] = await db
      .insert(repasses)
      .values({ recebedorId: d!.recebedorId, chavePixId: chave!.id, valorCentavos: 450, status: "agendado", refExterna: "rep_teste" })
      .returning();
    await db.update(doacoes).set({ repasseId: rep!.id }).where(eq(doacoes.id, r.doacaoId));
    expect(await servico.estornar(r.doacaoId, "tentativa")).toBe(false);
    await db.update(repasses).set({ status: "falhou" }).where(eq(repasses.id, rep!.id));
    expect(await servico.estornar(r.doacaoId, "agora pode")).toBe(true);
  });
});

describe("estorno com reembolso falho", () => {
  test("se o provedor não reembolsa, a doação continua confirmada e nada é lançado", async () => {
    const r = await servico.criarIntencao({ ...base, valorTexto: "5", mensagem: "", apelido: "" });
    if (!r.ok) throw new Error("setup");
    entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
    await servico.processarNotificacao({ provedor: "fake", idExterno: "evt_11", refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
    const antes = await saldo(db);
    entrada.falharProximoReembolso("indisponível");
    expect(await servico.estornar(r.doacaoId, "teste")).toBe(false);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, r.doacaoId));
    expect(d!.status).toBe("confirmada");
    expect(await saldo(db)).toBe(antes);
  });
});
