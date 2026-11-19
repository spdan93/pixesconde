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

/**
 * Reivindicação de apelido pendente. O apelido só nasce (ou é vinculado) quando o
 * token é confirmado: pedir não reserva nada, e quem confirma primeiro leva.
 */
export const tokensMagicos = pgTable("tokens_magicos", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Preenchido quando a reivindicação é de um apelido já confirmado (dono em outro aparelho). */
  apelidoId: uuid("apelido_id").references(() => apelidos.id),
  nome: text("nome").notNull(),
  emailHash: text("email_hash").notNull(),
  emailCifrado: text("email_cifrado").notNull(),
  doacaoId: uuid("doacao_id"),
  tokenHash: text("token_hash").notNull().unique(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  usadoEm: timestamp("usado_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
