import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/infra/db/schema";
import { aplicarMigracoes } from "../src/infra/db/migrar";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Ex.: postgres://postgres@localhost:5433/pix_esconde");
  process.exit(1);
}

const cliente = postgres(url, { max: 1, prepare: false });
const db = drizzle(cliente, { schema, casing: "snake_case" });
await aplicarMigracoes(db);
console.log("migrações aplicadas em", url.replace(/\/\/.*@/, "//***@"));
await cliente.end();
