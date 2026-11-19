import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const statusRecebedor = pgEnum("status_recebedor", [
  "aguardando_validacao",
  "ativa",
  "pausada",
  "removida",
  "invalida",
]);

/** Quem recebe. O número público é a única identidade exposta ("anônimo #0427"). */
export const recebedores = pgTable("recebedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  numeroPublico: integer("numero_publico").generatedAlwaysAsIdentity().notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  status: statusRecebedor("status").notNull().default("aguardando_validacao"),
  invalidaDesde: timestamp("invalida_desde", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Histórico de chaves de um recebedor: só uma ativa por vez; a mesma chave só pode estar ativa uma vez na plataforma. */
export const chavesPix = pgTable(
  "chaves_pix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recebedorId: uuid("recebedor_id")
      .notNull()
      .references(() => recebedores.id),
    chaveCifrada: text("chave_cifrada").notNull(),
    chaveHmac: text("chave_hmac").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
    desativadaEm: timestamp("desativada_em", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("chaves_pix_hmac_ativa_unq").on(t.chaveHmac).where(sql`${t.ativa} = true`),
    index("chaves_pix_recebedor_idx").on(t.recebedorId),
  ],
);
