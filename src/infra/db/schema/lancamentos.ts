import { bigserial, integer, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { doacoes } from "./doacoes";
import { repasses } from "./repasses";

export const tipoLancamento = pgEnum("tipo_lancamento", [
  "entrada",
  "taxa",
  "saida",
  "reversao_entrada",
  "reversao_taxa",
]);

/**
 * Livro-razão append-only. Valor com sinal: entrada +, taxa −, saída −,
 * reversões invertem o sinal do lançamento original. Nada no código atualiza
 * ou apaga linhas daqui.
 */
export const lancamentos = pgTable("lancamentos", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tipo: tipoLancamento("tipo").notNull(),
  valorCentavos: integer("valor_centavos").notNull(),
  doacaoId: uuid("doacao_id").references(() => doacoes.id),
  repasseId: uuid("repasse_id").references(() => repasses.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
