import { and, desc, eq, gte, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import { apelidos, doacoes, recebedores } from "@/infra/db/schema";

export type Periodo = "tudo" | "mes" | "semana";
export type CriterioRanking = "valor" | "quantidade";

export type PosicaoRanking = { posicao: number; apelido: string; totalCentavos: number; quantidade: number };

export type Ranking = {
  posicoes: PosicaoRanking[];
  /** Tudo que não tem apelido confirmado, somado numa linha só, fora da numeração. */
  anonimos: { totalCentavos: number; quantidade: number };
};

export interface ServicoRanking {
  doadores(i: { por: CriterioRanking; periodo: Periodo; limite: number; excluir: string[] }): Promise<Ranking>;
  resumoHome(): Promise<{ totalChaves: number; totalCentavos: number }>;
}

const DIAS = { semana: 7, mes: 30 } as const;

export function criarServicoRanking(db: Db, agora: () => Date = () => new Date()): ServicoRanking {
  function desde(periodo: Periodo): Date | null {
    if (periodo === "tudo") return null;
    return new Date(agora().getTime() - DIAS[periodo] * 24 * 60 * 60_000);
  }

  return {
    async doadores({ por, periodo, limite, excluir }) {
      const inicio = desde(periodo);
      const filtroPeriodo = inicio ? gte(doacoes.confirmadaEm, inicio) : undefined;
      const total = sql<number>`sum(${doacoes.valorCentavos})::int`;
      const quantidade = sql<number>`count(*)::int`;

      const confirmados = await db
        .select({ apelido: apelidos.nome, totalCentavos: total, quantidade })
        .from(doacoes)
        .innerJoin(apelidos, eq(apelidos.id, doacoes.apelidoId))
        .where(
          and(
            eq(doacoes.status, "confirmada"),
            isNotNull(apelidos.confirmadoEm),
            excluir.length ? notInArray(apelidos.nome, excluir) : undefined,
            filtroPeriodo,
          ),
        )
        .groupBy(apelidos.nome)
        .orderBy(...(por === "valor" ? [desc(total), desc(quantidade)] : [desc(quantidade), desc(total)]), apelidos.nome)
        .limit(limite);

      const [anon] = await db
        .select({
          totalCentavos: sql<number>`coalesce(sum(${doacoes.valorCentavos}), 0)::int`,
          quantidade,
        })
        .from(doacoes)
        .leftJoin(apelidos, eq(apelidos.id, doacoes.apelidoId))
        .where(and(eq(doacoes.status, "confirmada"), or(isNull(apelidos.id), isNull(apelidos.confirmadoEm)), filtroPeriodo));

      return {
        posicoes: confirmados.map((c, i) => ({
          posicao: i + 1,
          apelido: c.apelido,
          totalCentavos: Number(c.totalCentavos),
          quantidade: Number(c.quantidade),
        })),
        anonimos: { totalCentavos: Number(anon?.totalCentavos ?? 0), quantidade: Number(anon?.quantidade ?? 0) },
      };
    },

    async resumoHome() {
      const [chaves] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(recebedores)
        .where(inArray(recebedores.status, ["ativa", "aguardando_validacao"]));
      const [soma] = await db
        .select({ total: sql<number>`coalesce(sum(${doacoes.valorCentavos}), 0)::int` })
        .from(doacoes)
        .where(eq(doacoes.status, "confirmada"));
      return { totalChaves: Number(chaves?.n ?? 0), totalCentavos: Number(soma?.total ?? 0) };
    },
  };
}
