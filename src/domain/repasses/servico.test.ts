import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { criarDbTeste } from "@/infra/db/teste";
import type { Db } from "@/infra/db/client";
import { lerConfig } from "@/infra/db/config";
import { doacoes, repasses } from "@/infra/db/schema";
import { criarProvedores } from "@/providers";
import type { FakeEntrada } from "@/providers/payment-in/fake";
import type { FakeSaida } from "@/providers/payout/fake";
import { criarServicoRecebedores, type ServicoRecebedores } from "@/domain/recebedores/servico";
import { criarServicoDoacoes, type ServicoDoacoes } from "@/domain/doacoes/servico";
import { saldo } from "@/domain/razao/servico";
import { criarServicoRepasses, type ServicoRepasses } from "./servico";

const SEGREDOS = {
  chaveCifra: "wJ1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0a=",
  segredoHmac: "Zz1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0b=",
};

let db: Db;
let fechar: () => Promise<void>;
let recebedores: ServicoRecebedores;
let doacoesSvc: ServicoDoacoes;
let servico: ServicoRepasses;
let entrada: FakeEntrada;
let saida: FakeSaida;
let relogio = new Date("2026-11-18T20:00:00Z");
const ids: Record<string, string> = {};

const provedores = criarProvedores({ PROVEDOR_PAGAMENTO: "fake", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://x" }, { silencioso: true });

async function cadastrar(nome: string, chave: string) {
  const r = await recebedores.cadastrar(chave);
  if (!r.ok) throw new Error(`setup ${nome}`);
  const priv = await recebedores.buscarPorToken(r.token);
  ids[nome] = priv!.id;
  return r.numeroPublico;
}

async function doar(numeroPublico: number, valorTexto: string) {
  const r = await doacoesSvc.criarIntencao({ numeroPublico, valorTexto, mensagem: "", apelido: "", apelidoIdDoCookie: null });
  if (!r.ok) throw new Error("setup doar");
  entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
  await doacoesSvc.processarNotificacao({ provedor: "fake", idExterno: `evt_${r.doacaoId}`, refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
  return r.doacaoId;
}

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
  recebedores = criarServicoRecebedores(db, SEGREDOS);
  entrada = provedores.entrada as FakeEntrada;
  saida = provedores.saida as FakeSaida;
  doacoesSvc = criarServicoDoacoes({ db, provedores, recebedores, config: () => lerConfig(db), urlPublica: "http://x", agora: () => relogio });
  servico = criarServicoRepasses({ db, provedores, recebedores, doacoes: doacoesSvc, config: () => lerConfig(db), agora: () => relogio });
  doacoesSvc.setRepasses(servico);
});

afterAll(async () => {
  await fechar();
});

describe("agrupamento", () => {
  test("duas doações confirmadas viram um repasse só, com a soma dos líquidos", async () => {
    const n = await cadastrar("boa", "7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
    const d1 = await doar(n, "5");
    const d2 = await doar(n, "20");
    const repasseId = await servico.agendarParaRecebedor(ids.boa!);
    expect(repasseId).toBeTruthy();
    const [r] = await db.select().from(repasses).where(eq(repasses.id, repasseId!));
    expect(r).toMatchObject({ valorCentavos: 450 + 1800, status: "agendado", recebedorId: ids.boa });
    const marcadas = await db.select().from(doacoes).where(eq(doacoes.repasseId, repasseId!));
    expect(marcadas.map((d) => d.id).sort()).toEqual([d1, d2].sort());
  });

  test("nova doação se junta ao repasse ainda agendado", async () => {
    await doar(1, "10");
    const repasseId = await servico.agendarParaRecebedor(ids.boa!);
    const [r] = await db.select().from(repasses).where(eq(repasses.id, repasseId!));
    expect(r!.valorCentavos).toBe(2250 + 900);
    expect(await db.select().from(repasses).where(eq(repasses.recebedorId, ids.boa!))).toHaveLength(1);
  });

  test("sem doações pendentes de repasse devolve null", async () => {
    const n = await cadastrar("vazia", "22222222-2222-4333-8444-555555555555");
    expect(n).toBe(2);
    expect(await servico.agendarParaRecebedor(ids.vazia!)).toBeNull();
  });
});

describe("processarAgendados", () => {
  test("envia, conclui, lança saída e ativa a chave", async () => {
    const antes = await saldo(db);
    const r = await servico.processarAgendados();
    expect(r).toEqual({ concluidos: 1, falhos: 0 });
    const [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.boa!));
    expect(rep!.status).toBe("concluido");
    expect(rep!.provedorId).toBe(`fake_${rep!.refExterna}`);
    expect(await saldo(db)).toBe(antes - 3150);
    expect(saida.envios.at(-1)).toMatchObject({ chavePix: "7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93", valorCentavos: 3150, descricao: "PIX ESCONDE" });
    expect((await recebedores.buscarPublico(1))!.status).toBe("ativa");
    const comprovante = await doacoesSvc.buscarComprovante((await db.select().from(doacoes).where(eq(doacoes.repasseId, rep!.id)))[0]!.id);
    expect(comprovante!.previsaoRepasse).toBe("repassado");
  });

  test("chave inválida falha de vez e marca o recebedor", async () => {
    const n = await cadastrar("invalida", "00000000-04b1-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    await servico.agendarParaRecebedor(ids.invalida!);
    const r = await servico.processarAgendados();
    expect(r).toEqual({ concluidos: 0, falhos: 1 });
    const [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.invalida!));
    expect(rep!.status).toBe("falhou");
    expect(rep!.erro).toMatch(/Bacen/);
    expect((await recebedores.buscarPublico(n))!.status).toBe("invalida");
  });

  test("falha transitória reagenda com espera crescente e desiste na sexta", async () => {
    const n = await cadastrar("instavel", "ffffffff-04b1-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    await servico.agendarParaRecebedor(ids.instavel!);
    const r1 = await servico.processarAgendados();
    expect(r1).toEqual({ concluidos: 0, falhos: 0 });
    let [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.instavel!));
    expect(rep!.status).toBe("agendado");
    expect(rep!.tentativas).toBe(1);
    expect(rep!.agendadoPara.getTime()).toBe(relogio.getTime() + 2 * 60_000);
    // ainda não chegou a hora
    expect(await servico.processarAgendados()).toEqual({ concluidos: 0, falhos: 0 });
    expect((await db.select().from(repasses).where(eq(repasses.recebedorId, ids.instavel!)))[0]!.tentativas).toBe(1);
    for (let t = 2; t <= 5; t++) {
      relogio = new Date(relogio.getTime() + 2 ** t * 60_000 + 1);
      await servico.processarAgendados();
    }
    [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.instavel!));
    expect(rep!.tentativas).toBe(5);
    expect(rep!.status).toBe("agendado");
    relogio = new Date(relogio.getTime() + 2 ** 6 * 60_000);
    const fim = await servico.processarAgendados();
    expect(fim).toEqual({ concluidos: 0, falhos: 1 });
    [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.instavel!));
    expect(rep!.status).toBe("falhou");
    // recebedor com falha transitória definitiva NÃO vira inválida
    expect((await recebedores.buscarPublico(n))!.status).toBe("aguardando_validacao");
  });

  test("agendarTodos cobre todo recebedor com crédito pendente, inclusive o de repasse falho, e pula o inválido", async () => {
    await doar(1, "5");
    await doar(2, "5");
    // boa (1) e vazia (2) têm doação nova; instavel tem doação presa num repasse que falhou; invalida é pulado
    expect(await servico.agendarTodos()).toBe(3);
    const doInstavel = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.instavel!));
    expect(doInstavel.map((r) => r.status).sort()).toEqual(["agendado", "falhou"]);
  });
});

describe("devolverRetidos", () => {
  test("recebedor inválido há mais de 30 dias tem as doações estornadas", async () => {
    const antes = await saldo(db);
    expect(await servico.devolverRetidos(30)).toBe(0);
    relogio = new Date(relogio.getTime() + 31 * 24 * 60 * 60_000);
    const n = await servico.devolverRetidos(30);
    expect(n).toBe(1);
    expect(await saldo(db)).toBe(antes - 450);
    const estornadas = await db.select().from(doacoes).where(eq(doacoes.status, "estornada"));
    expect(estornadas).toHaveLength(1);
    expect(estornadas[0]!.recebedorId).toBe(ids.invalida);
  });

  test("listarDoRecebedor traz os repasses com estado", async () => {
    const lista = await servico.listarDoRecebedor(ids.boa!);
    expect(lista.length).toBeGreaterThanOrEqual(2);
    expect(lista.some((r) => r.status === "concluido")).toBe(true);
  });
});

describe("segurança do dinheiro", () => {
  test("recebedor inválido não ganha repasse novo", async () => {
    expect(await servico.agendarParaRecebedor(ids.invalida!)).toBeNull();
  });

  test("devolverRetidos não estorna doação presa num repasse agendado ou enviando", async () => {
    const n = await cadastrar("presa", "33333333-04b1-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    const repasseId = await servico.agendarParaRecebedor(ids.presa!);
    expect(repasseId).toBeTruthy();
    await recebedores.marcarInvalida(ids.presa!);
    relogio = new Date(relogio.getTime() + 31 * 24 * 60 * 60_000);
    const antes = await saldo(db);
    expect(await servico.devolverRetidos(30)).toBe(0);
    expect(await saldo(db)).toBe(antes);
    // depois que o repasse falha de vez, aí sim devolve
    await db.update(repasses).set({ status: "falhou", erro: "teste" }).where(eq(repasses.id, repasseId!));
    expect(await servico.devolverRetidos(30)).toBe(1);
  });

  test("erro lançado pelo provedor deixa o repasse em 'enviando' e a conciliação decide", async () => {
    const n = await cadastrar("ambigua", "44444444-04b1-4d8a-9f27-c21e5a6b0d93");
    await servico.processarAgendados(); // escoa o que testes anteriores deixaram agendado
    await doar(n, "5");
    await servico.agendarParaRecebedor(ids.ambigua!);
    saida.lancarNoProximoEnvio(new Error("timeout"));
    expect(await servico.processarAgendados()).toEqual({ concluidos: 0, falhos: 0 });
    let [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.ambigua!));
    expect(rep!.status).toBe("enviando");
    expect(rep!.erro).toMatch(/timeout/);
    // provedor não conhece a transferência: nunca saiu → volta para agendado (sem contar tentativa como falha definitiva)
    saida.definirConsulta(rep!.refExterna, "desconhecido");
    relogio = new Date(relogio.getTime() + 6 * 60_000); // carência da conciliação
    expect(await servico.processarAgendados()).toEqual({ concluidos: 0, falhos: 0 });
    [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.ambigua!));
    expect(rep!.status).toBe("agendado");
    expect(rep!.tentativas).toBe(1);
    // na próxima rodada o fake envia normalmente
    relogio = new Date(relogio.getTime() + 3 * 60_000);
    expect(await servico.processarAgendados()).toEqual({ concluidos: 1, falhos: 0 });
  });

  test("erro lançado, mas o provedor diz que concluiu: conclui sem reenviar", async () => {
    const n = await cadastrar("ambigua2", "55555555-04b1-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    await servico.agendarParaRecebedor(ids.ambigua2!);
    const enviosAntes = saida.envios.length;
    saida.lancarNoProximoEnvio(new Error("timeout"));
    await servico.processarAgendados();
    const [rep] = await db.select().from(repasses).where(eq(repasses.recebedorId, ids.ambigua2!));
    saida.definirConsulta(rep!.refExterna, "concluido");
    relogio = new Date(relogio.getTime() + 6 * 60_000); // carência da conciliação
    const antes = await saldo(db);
    expect(await servico.processarAgendados()).toEqual({ concluidos: 1, falhos: 0 });
    expect(await saldo(db)).toBe(antes - 450);
    expect(saida.envios.slice(enviosAntes).filter((e) => e.refExterna === rep!.refExterna)).toHaveLength(0); // nenhum reenvio deste
  });
});

describe("carência da conciliação", () => {
  test("repasse 'enviando' recém-reclamado por outro processo não é tocado; depois da carência, é", async () => {
    const n = await cadastrar("carencia", "66666666-04b1-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    const repasseId = await servico.agendarParaRecebedor(ids.carencia!);
    // simula outro processo que reclamou há 1 minuto e está no meio da chamada ao provedor
    await db.update(repasses).set({ status: "enviando", reclamadoEm: new Date(relogio.getTime() - 60_000) }).where(eq(repasses.id, repasseId!));
    await servico.processarAgendados();
    let [rep] = await db.select().from(repasses).where(eq(repasses.id, repasseId!));
    expect(rep!.status).toBe("enviando");
    relogio = new Date(relogio.getTime() + 6 * 60_000);
    await servico.processarAgendados();
    [rep] = await db.select().from(repasses).where(eq(repasses.id, repasseId!));
    expect(rep!.status).toBe("agendado"); // provedor não conhece: nunca saiu
  });
});

describe("compare-and-swap na transição", () => {
  test("se outro processo reclamou de novo enquanto o envio estava em curso, a conclusão antiga não se aplica", async () => {
    const n = await cadastrar("cas", "77777777-04b1-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    const repasseId = await servico.agendarParaRecebedor(ids.cas!);
    const antes = await saldo(db);
    // durante o envio de A, a conciliação reagenda e um processo B reclama a linha de novo
    saida.aoEnviar(async () => {
      await db.update(repasses).set({ status: "enviando", reclamadoEm: new Date(relogio.getTime() + 1) }).where(eq(repasses.id, repasseId!));
    });
    const r = await servico.processarAgendados();
    expect(r.concluidos).toBe(0);
    const [rep] = await db.select().from(repasses).where(eq(repasses.id, repasseId!));
    expect(rep!.status).toBe("enviando"); // a reivindicação de B segue intocada
    expect(await saldo(db)).toBe(antes); // e nada foi lançado por A
  });
});

describe("revisão final", () => {
  test("I3: três repasses falhos seguidos marcam o recebedor como inválido (entra na devolução)", async () => {
    const n = await cadastrar("teimosa", "ffffffff-1111-4d8a-9f27-c21e5a6b0d93");
    await doar(n, "5");
    await servico.processarAgendados(); // escoa
    for (let rodada = 1; rodada <= 3; rodada++) {
      const repasseId = await servico.agendarParaRecebedor(ids.teimosa!);
      expect(repasseId).toBeTruthy();
      for (let t = 0; t <= 5; t++) {
        relogio = new Date(relogio.getTime() + 2 ** (t + 1) * 60_000 + 1);
        await servico.processarAgendados();
      }
      const [rep] = await db.select().from(repasses).where(eq(repasses.id, repasseId!));
      expect(rep!.status).toBe("falhou");
      const status = (await recebedores.buscarPublico(n))!.status;
      expect(status).toBe(rodada < 3 ? "aguardando_validacao" : "invalida");
    }
  });
});
