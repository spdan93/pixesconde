import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { limites } from "./db/schema";

/**
 * Limite por chave (ex.: "cadastro:<ip>") em janelas fixas de `janelaMin` minutos.
 * Devolve true enquanto a contagem da janela não passa de `maximo`.
 */
export async function permitir(db: Db, chave: string, janelaMin: number, maximo: number, agora = new Date()): Promise<boolean> {
  const tamanho = janelaMin * 60_000;
  const janela = new Date(Math.floor(agora.getTime() / tamanho) * tamanho);
  const [linha] = await db
    .insert(limites)
    .values({ chave, janela, contagem: 1 })
    .onConflictDoUpdate({
      target: [limites.chave, limites.janela],
      set: { contagem: sql`${limites.contagem} + 1` },
    })
    .returning({ contagem: limites.contagem });
  return (linha?.contagem ?? Infinity) <= maximo;
}

/** IP do cliente atrás da Cloudflare; "local" em dev e testes. */
export function ipDaRequisicao(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "local";
}
