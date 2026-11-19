import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import * as schema from "./schema";

/** Mesma API para Postgres real (produção/dev) e PGlite (testes). */
export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

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
