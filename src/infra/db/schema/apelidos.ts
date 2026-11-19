import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Apelido público do doador, vinculado a um e-mail que nunca aparece. */
export const apelidos = pgTable("apelidos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  emailHash: text("email_hash").notNull().unique(),
  emailCifrado: text("email_cifrado").notNull(),
  confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const tokensMagicos = pgTable("tokens_magicos", {
  id: uuid("id").primaryKey().defaultRandom(),
  apelidoId: uuid("apelido_id")
    .notNull()
    .references(() => apelidos.id),
  doacaoId: uuid("doacao_id"),
  tokenHash: text("token_hash").notNull().unique(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  usadoEm: timestamp("usado_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
