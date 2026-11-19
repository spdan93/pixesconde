import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./client";
import { configuracao } from "./schema";

export const ConfigSchema = z.object({
  taxaBp: z.number().int().min(0).max(10_000).default(1000),
  minimoCentavos: z.number().int().min(100).default(500),
  maximoCentavos: z.number().int().min(500).default(50_000),
  gatilhoRepasse: z.enum(["imediato", "diario"]).default("diario"),
  minimoRepasseCentavos: z.number().int().min(0).default(0),
  palavrasBloqueadas: z.array(z.string()).default([]),
  apelidosForaDoRanking: z.array(z.string()).default([]),
  expiracaoIntencaoMin: z.number().int().min(5).default(30),
});

export type Config = z.infer<typeof ConfigSchema>;

export const CONFIG_PADRAO: Config = ConfigSchema.parse({});

/** Lê a tabela chave/valor e completa com os padrões. Valores inválidos caem no padrão. */
export async function lerConfig(db: Db): Promise<Config> {
  const linhas = await db.select().from(configuracao);
  const bruto: Record<string, unknown> = {};
  for (const l of linhas) bruto[l.chave] = l.valor;
  const resultado = ConfigSchema.safeParse(bruto);
  if (resultado.success) return resultado.data;
  // Alguma chave inválida: mantém as válidas, descarta as outras.
  const valido: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bruto)) {
    const campo = ConfigSchema.shape[k as keyof Config];
    if (campo && campo.safeParse(v).success) valido[k] = v;
  }
  return ConfigSchema.parse(valido);
}

export async function gravarConfig(db: Db, parcial: Partial<Config>): Promise<void> {
  for (const [chave, valor] of Object.entries(parcial)) {
    if (valor === undefined) continue;
    await db
      .insert(configuracao)
      .values({ chave, valor })
      .onConflictDoUpdate({
        target: configuracao.chave,
        set: { valor, atualizadaEm: sql`now()` },
      });
  }
}
