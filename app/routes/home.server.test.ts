import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, requisicao, type ContextoTeste } from "~/teste/contexto";
import { loader as homeLoader } from "./home";
import { loader as chavesLoader } from "./chaves";

let t: ContextoTeste;

beforeAll(async () => {
  t = await criarContextoTeste();
  for (let i = 0; i < 10; i++) {
    const hex = (i + 1).toString(16).padStart(8, "a");
    await t.servicos.recebedores.cadastrar(`${hex}-04b1-4d8a-9f27-c21e5a6b0d93`);
  }
});

afterAll(async () => {
  await t.fechar();
});

describe("home", () => {
  test("loader devolve resumo, até 8 chaves recentes e o topo do ranking", async () => {
    const dados = await homeLoader({ request: requisicao("/"), params: {}, context: t.contexto() } as never);
    expect(dados.resumo).toEqual({ totalChaves: 10, totalCentavos: 0 });
    expect(dados.recebedores).toHaveLength(8);
    expect(dados.recebedores[0]!.numeroPublico).toBe(10);
    expect(dados.ranking.posicoes).toEqual([]);
    expect(dados.taxaTexto).toBe("10%");
  });
});

describe("chaves", () => {
  test("lê ordem e página da URL e ignora valores inválidos", async () => {
    const ok = await chavesLoader({ request: requisicao("/chaves?ordem=menos_receberam&pagina=2"), params: {}, context: t.contexto() } as never);
    expect(ok.ordem).toBe("menos_receberam");
    expect(ok.pagina).toBe(2);
    const ruim = await chavesLoader({ request: requisicao("/chaves?ordem=hack&pagina=-3"), params: {}, context: t.contexto() } as never);
    expect(ruim.ordem).toBe("recentes");
    expect(ruim.pagina).toBe(1);
    expect(ruim.total).toBe(10);
    expect(ruim.itens.length).toBeGreaterThan(0);
  });
});
