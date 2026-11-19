import type { Db } from "./client";
import type { SQL } from "drizzle-orm";

/**
 * `db.execute` devolve um array no postgres.js e `{ rows }` no PGlite.
 * Esta função normaliza para um array de linhas tipado pelo chamador.
 */
export async function executarLinhas<T extends Record<string, unknown>>(db: Db, consulta: SQL): Promise<T[]> {
  const resultado = (await db.execute(consulta)) as unknown;
  if (Array.isArray(resultado)) return resultado as T[];
  return ((resultado as { rows?: T[] }).rows ?? []) as T[];
}
