import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarDbTeste } from "@/infra/db/teste";
import type { Db } from "@/infra/db/client";
import { apelidos, doacoes, recebedores } from "@/infra/db/schema";
import { criarServicoRanking, type ServicoRanking } from "./servico";

let db: Db;
let fechar: () => Promise<void>;
let servico: ServicoRanking;
const agora = new Date("2026-11-18T20:00:00Z");
const dias = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60_000);

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
  servico = criarServicoRanking(db, () => agora);
  const [r] = await db.insert(recebedores).values({ tokenHash: "t1" }).returning();
  const [pastel] = await db
    .insert(apelidos)
    .values({ nome: "pastel_de_vento", emailHash: "h1", emailCifrado: "e1", confirmadoEm: agora })
    .returning();
  const [tia] = await db
    .insert(apelidos)
    .values({ nome: "tia_do_zap", emailHash: "h2", emailCifrado: "e2", confirmadoEm: agora })
    .returning();
  const [naoConfirmado] = await db
    .insert(apelidos)
    .values({ nome: "fantasma", emailHash: "h3", emailCifrado: "e3", confirmadoEm: null })
    .returning();
  const [dono] = await db
    .insert(apelidos)
    .values({ nome: "dono_da_casa", emailHash: "h4", emailCifrado: "e4", confirmadoEm: agora })
    .returning();

  const linha = (valor: number, apelidoId: string | null, apelidoTexto: string | null, em: Date, status: "confirmada" | "pendente" = "confirmada") => ({
    recebedorId: r!.id,
    valorCentavos: valor,
    taxaBp: 1000,
    taxaCentavos: valor / 10,
    liquidoCentavos: valor - valor / 10,
    apelidoId,
    apelidoTexto,
    status,
    refExterna: `doa_${crypto.randomUUID()}`,
    expiraEm: em,
    criadaEm: em,
    confirmadaEm: status === "confirmada" ? em : null,
  });

  await db.insert(doacoes).values([
    linha(500, pastel!.id, "pastel_de_vento", dias(1)),
    linha(500, pastel!.id, "pastel_de_vento", dias(2)),
    linha(500, pastel!.id, "pastel_de_vento", dias(40)),
    linha(2000, tia!.id, "tia_do_zap", dias(10)),
    linha(10000, naoConfirmado!.id, "fantasma", dias(1)),
    linha(300000, dono!.id, "dono_da_casa", dias(1)),
    linha(700, null, "sem_vinculo", dias(1)),
    linha(900, null, null, dias(3)),
    linha(99900, pastel!.id, "pastel_de_vento", dias(1), "pendente"),
  ]);
});

afterAll(async () => {
  await fechar();
});

describe("ranking de doadores", () => {
  test("por valor, tudo: só apelidos confirmados, numerados, e os demais somados em 'anônimo' no fim", async () => {
    const r = await servico.doadores({ por: "valor", periodo: "tudo", limite: 10, excluir: ["dono_da_casa"] });
    expect(r.posicoes).toEqual([
      { posicao: 1, apelido: "tia_do_zap", totalCentavos: 2000, quantidade: 1 },
      { posicao: 2, apelido: "pastel_de_vento", totalCentavos: 1500, quantidade: 3 },
    ]);
    // fantasma (não confirmado) + sem_vinculo + sem apelido; o dono excluído não entra em lugar nenhum
    expect(r.anonimos).toEqual({ totalCentavos: 10000 + 700 + 900, quantidade: 3 });
  });

  test("por quantidade", async () => {
    const r = await servico.doadores({ por: "quantidade", periodo: "tudo", limite: 10, excluir: [] });
    expect(r.posicoes[0]!.apelido).toBe("pastel_de_vento");
  });

  test("período semana corta o que é mais velho que 7 dias", async () => {
    const r = await servico.doadores({ por: "valor", periodo: "semana", limite: 10, excluir: ["dono_da_casa"] });
    expect(r.posicoes).toEqual([{ posicao: 1, apelido: "pastel_de_vento", totalCentavos: 1000, quantidade: 2 }]);
  });

  test("período mês", async () => {
    const r = await servico.doadores({ por: "valor", periodo: "mes", limite: 10, excluir: ["dono_da_casa"] });
    expect(r.posicoes.map((p) => [p.apelido, p.totalCentavos])).toEqual([
      ["tia_do_zap", 2000],
      ["pastel_de_vento", 1000],
    ]);
  });

  test("limite corta a lista", async () => {
    const r = await servico.doadores({ por: "valor", periodo: "tudo", limite: 1, excluir: [] });
    expect(r.posicoes).toHaveLength(1);
    expect(r.posicoes[0]!.apelido).toBe("dono_da_casa");
  });

  test("resumo da home conta chaves elegíveis e total confirmado", async () => {
    expect(await servico.resumoHome()).toEqual({ totalChaves: 1, totalCentavos: 500 + 500 + 500 + 2000 + 10000 + 300000 + 700 + 900 });
  });
});
