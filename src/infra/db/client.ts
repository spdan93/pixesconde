import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Tipo comum ao Postgres real (postgres.js, produção/dev), ao PGlite (testes)
 * e às transações de ambos: todo serviço recebe um `Db` e nunca sabe qual é.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Conexão via postgres.js. `prepare: false` porque o pooler do Supabase em modo
 * transação (e o Hyperdrive) não suportam prepared statements nomeados.
 */
export function criarDb(connectionString: string): { db: Db; fechar(): Promise<void> } {
  const cliente = postgres(connectionString, { max: 5, prepare: false });
  const db = drizzle(cliente, { schema, casing: "snake_case" });
  return {
    db,
    fechar: () => cliente.end({ timeout: 5 }),
  };
}
