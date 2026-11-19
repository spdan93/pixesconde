import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import type { Db } from "./client";

const pastaMigracoes = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/** Postgres em memória com as mesmas migrações da produção. Um por arquivo de teste. */
export async function criarDbTeste(): Promise<{ db: Db; fechar(): Promise<void> }> {
  const cliente = new PGlite();
  const db = drizzle(cliente, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: pastaMigracoes });
  return { db, fechar: () => cliente.close() };
}
