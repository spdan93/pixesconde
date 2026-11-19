import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { chavesPix, recebedores } from "./recebedores";

export const statusRepasse = pgEnum("status_repasse", ["agendado", "enviando", "concluido", "falhou"]);

/** Um envio de Pix da plataforma para a chave do recebedor, agrupando doações confirmadas. */
export const repasses = pgTable(
  "repasses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recebedorId: uuid("recebedor_id")
      .notNull()
      .references(() => recebedores.id),
    chavePixId: uuid("chave_pix_id")
      .notNull()
      .references(() => chavesPix.id),
    valorCentavos: integer("valor_centavos").notNull(),
    status: statusRepasse("status").notNull().default("agendado"),
    refExterna: text("ref_externa").notNull().unique(),
    provedorId: text("provedor_id"),
    tentativas: integer("tentativas").notNull().default(0),
    erro: text("erro"),
    agendadoPara: timestamp("agendado_para", { withTimezone: true }).notNull().defaultNow(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  },
  (t) => [index("repasses_status_agendado_idx").on(t.status, t.agendadoPara)],
);
