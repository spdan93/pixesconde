import { integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { doacoes } from "./doacoes";

/** Configuração que muda a quente (taxa, limites, gatilho de repasse...). */
export const configuracao = pgTable("configuracao", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
  atualizadaEm: timestamp("atualizada_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Toda notificação recebida, para idempotência e auditoria. */
export const eventosWebhook = pgTable(
  "eventos_webhook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provedor: text("provedor").notNull(),
    idExterno: text("id_externo").notNull(),
    payload: jsonb("payload").notNull(),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
    processadoEm: timestamp("processado_em", { withTimezone: true }),
    resultado: text("resultado"),
  },
  (t) => [uniqueIndex("eventos_webhook_provedor_id_unq").on(t.provedor, t.idExterno)],
);

export const denuncias = pgTable("denuncias", {
  id: uuid("id").primaryKey().defaultRandom(),
  doacaoId: uuid("doacao_id")
    .notNull()
    .references(() => doacoes.id),
  motivo: text("motivo"),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  resolvidaEm: timestamp("resolvida_em", { withTimezone: true }),
});

/** Contadores por chave e janela de tempo, para limite por IP. */
export const limites = pgTable(
  "limites",
  {
    chave: text("chave").notNull(),
    janela: timestamp("janela", { withTimezone: true }).notNull(),
    contagem: integer("contagem").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.chave, t.janela] })],
);
