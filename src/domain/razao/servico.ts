import { sql } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import { lancamentos } from "@/infra/db/schema";

export type TipoLancamento = (typeof lancamentos.$inferSelect)["tipo"];

/**
 * Livro-razão append-only. Sinal: entrada +, taxa −, saída −, reversões invertem.
 * O saldo que a plataforma deveria ter no provedor é a soma de tudo.
 */
export async function lancar(
  db: Db,
  i: { tipo: TipoLancamento; valorCentavos: number; doacaoId?: string; repasseId?: string },
): Promise<void> {
  await db.insert(lancamentos).values({
    tipo: i.tipo,
    valorCentavos: i.valorCentavos,
    doacaoId: i.doacaoId ?? null,
    repasseId: i.repasseId ?? null,
  });
}

export async function saldo(db: Db): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`coalesce(sum(${lancamentos.valorCentavos}), 0)::int` })
    .from(lancamentos);
  return Number(linha?.total ?? 0);
}

/** Últimos lançamentos, para o script de operação. */
export async function ultimosLancamentos(db: Db, limite = 50) {
  return db.select().from(lancamentos).orderBy(sql`${lancamentos.id} desc`).limit(limite);
}
