import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { fileURLToPath } from "node:url";
import type * as schema from "./schema";

const pastaMigracoes = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/** Aplica as migrações versionadas em `drizzle/` num Postgres real. Uso em scripts Node. */
export async function aplicarMigracoes(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  await migrate(db, { migrationsFolder: pastaMigracoes });
}
