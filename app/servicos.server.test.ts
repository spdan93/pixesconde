import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarDbTeste } from "@/infra/db/teste";
import type { Db } from "@/infra/db/client";
import { gravarConfig } from "@/infra/db/config";
import type { FakeEntrada } from "@/providers/payment-in/fake";
import { ENV_TESTE } from "~/teste/contexto";
import { montarServicos, rodarCron } from "./servicos.server";

let db: Db;
let fechar: () => Promise<void>;

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
});

afterAll(async () => {
  await fechar();
});

describe("I7: produção falha fechado com provedores de mentira", () => {
  test("URL pública https + provedor fake/console/sempre-ok lança", () => {
    expect(() => montarServicos({ ...ENV_TESTE, URL_PUBLICA: "https://pixesconde.com.br" }, { db, fechar: async () => {}, silencioso: true })).toThrow(
      /produção/,
    );
  });

  test("em dev (http) os fakes são aceitos", () => {
    expect(() => montarServicos(ENV_TESTE, { db, fechar: async () => {}, silencioso: true })).not.toThrow();
  });
});

describe("I2: cron agrupa créditos confirmados também em modo imediato", () => {
  test("doação confirmada sem repasse ganha repasse na próxima rodada do cron, em qualquer gatilho", async () => {
    const s = montarServicos(ENV_TESTE, { db, fechar: async () => {}, silencioso: true });
    await gravarConfig(db, { gatilhoRepasse: "imediato" });
    const cad = await s.recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
    if (!cad.ok) throw new Error("setup");
    // simula o efeito pós-confirmação falhando: desliga o agendador antes do webhook
    s.doacoes.setRepasses({ agendarParaRecebedor: async () => { throw new Error("boom"); } });
    const r = await s.doacoes.criarIntencao({ numeroPublico: cad.numeroPublico, valorTexto: "5", mensagem: "", apelido: "", apelidoIdDoCookie: null });
    if (!r.ok) throw new Error("setup");
    (s.provedores.entrada as FakeEntrada).marcarResultado(`doa_${r.doacaoId}`, "aprovado");
    const res = await s.doacoes.processarNotificacao({ provedor: "fake", idExterno: "evt_cron", refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
    expect(res).toEqual({ resultado: "confirmada", efeitosPendentes: true });
    const resumo = await rodarCron(ENV_TESTE, new Date("2026-11-18T20:00:00Z"), { db, fechar: async () => {}, provedores: s.provedores, silencioso: true });
    expect(resumo.agendados).toBe(1);
    expect(resumo.concluidos).toBe(1);
  });
});
