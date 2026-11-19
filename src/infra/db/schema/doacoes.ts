import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { recebedores } from "./recebedores";
import { apelidos } from "./apelidos";
import { repasses } from "./repasses";

export const statusDoacao = pgEnum("status_doacao", ["pendente", "confirmada", "expirada", "estornada"]);

/** Uma intenção de Pix sem motivo, que vira doação quando o webhook confirma. */
export const doacoes = pgTable(
  "doacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numeroComprovante: integer("numero_comprovante").generatedAlwaysAsIdentity().notNull().unique(),
    recebedorId: uuid("recebedor_id")
      .notNull()
      .references(() => recebedores.id),
    valorCentavos: integer("valor_centavos").notNull(),
    taxaBp: integer("taxa_bp").notNull(),
    taxaCentavos: integer("taxa_centavos").notNull(),
    liquidoCentavos: integer("liquido_centavos").notNull(),
    mensagem: text("mensagem"),
    mensagemOculta: boolean("mensagem_oculta").notNull().default(false),
    apelidoTexto: text("apelido_texto"),
    apelidoId: uuid("apelido_id").references(() => apelidos.id),
    status: statusDoacao("status").notNull().default("pendente"),
    refExterna: text("ref_externa").notNull().unique(),
    provedorPagamentoId: text("provedor_pagamento_id"),
    repasseId: uuid("repasse_id").references(() => repasses.id),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    confirmadaEm: timestamp("confirmada_em", { withTimezone: true }),
    estornadaEm: timestamp("estornada_em", { withTimezone: true }),
  },
  (t) => [
    index("doacoes_recebedor_status_idx").on(t.recebedorId, t.status),
    index("doacoes_status_expira_idx").on(t.status, t.expiraEm),
    index("doacoes_apelido_idx").on(t.apelidoId),
  ],
);
