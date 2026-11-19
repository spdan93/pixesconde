/**
 * Moderação sem painel.
 *   pnpm tsx scripts/denuncias.ts                 → lista denúncias abertas
 *   pnpm tsx scripts/denuncias.ts resolver <id>   → marca resolvida (a mensagem continua oculta)
 *   pnpm tsx scripts/denuncias.ts reexibir <id>   → resolve e volta a mostrar a mensagem (denúncia improcedente)
 */
import { and, eq, isNull } from "drizzle-orm";
import { abrirServicos } from "./_ambiente";
import { denuncias, doacoes } from "../src/infra/db/schema";

async function main() {
  const s = abrirServicos();
  try {
    const [cmd, id] = process.argv.slice(2);
    if ((cmd === "resolver" || cmd === "reexibir") && id) {
      const [d] = await s.db.update(denuncias).set({ resolvidaEm: new Date() }).where(and(eq(denuncias.id, id), isNull(denuncias.resolvidaEm))).returning();
      if (!d) throw new Error("denúncia não encontrada ou já resolvida");
      if (cmd === "reexibir") await s.db.update(doacoes).set({ mensagemOculta: false }).where(eq(doacoes.id, d.doacaoId));
      console.log(`${cmd}: ${id}`);
    }
    const abertas = await s.db
      .select({ id: denuncias.id, motivo: denuncias.motivo, criadaEm: denuncias.criadaEm, mensagem: doacoes.mensagem, apelido: doacoes.apelidoTexto, doacaoId: doacoes.id })
      .from(denuncias)
      .innerJoin(doacoes, eq(doacoes.id, denuncias.doacaoId))
      .where(isNull(denuncias.resolvidaEm));
    if (abertas.length === 0) console.log("nenhuma denúncia aberta");
    for (const a of abertas) console.log(`${a.id}  ${a.criadaEm.toISOString()}  de ${a.apelido ?? "anônimo"}: “${a.mensagem}”  (motivo: ${a.motivo ?? "-"})`);
  } finally {
    await s.fecharTudo();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
