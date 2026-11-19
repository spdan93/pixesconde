/**
 * Conciliação à mão: saldo que o razão diz que a plataforma tem, últimos lançamentos,
 * e o que está preso (repasses falhos, estornos pendentes, recebedores inválidos).
 *   pnpm tsx scripts/razao.ts
 */
import { eq, inArray } from "drizzle-orm";
import { abrirServicos } from "./_ambiente";
import { saldo, ultimosLancamentos } from "../src/domain/razao/servico";
import { formatarReais } from "../src/domain/dinheiro";
import { doacoes, recebedores, repasses } from "../src/infra/db/schema";

async function main() {
  const s = abrirServicos();
  try {
    console.log(`saldo segundo o razão: ${formatarReais(await saldo(s.db))}`);
    console.log("(compare com o saldo real da conta no provedor; divergência = investigar)\n");

    const falhos = await s.db.select().from(repasses).where(eq(repasses.status, "falhou"));
    const enviando = await s.db.select().from(repasses).where(eq(repasses.status, "enviando"));
    const estornando = await s.db.select().from(doacoes).where(eq(doacoes.status, "estornando"));
    const invalidos = await s.db.select().from(recebedores).where(inArray(recebedores.status, ["invalida"]));
    console.log(`repasses falhos: ${falhos.length}   enviando (em conciliação): ${enviando.length}   estornos pendentes: ${estornando.length}   recebedores inválidos: ${invalidos.length}\n`);
    for (const r of falhos) console.log(`  falhou  ${r.refExterna}  ${formatarReais(r.valorCentavos)}  ${r.erro ?? ""}`);
    for (const r of enviando) console.log(`  enviando  ${r.refExterna}  ${formatarReais(r.valorCentavos)}  desde ${r.reclamadoEm?.toISOString() ?? "?"}  ${r.erro ?? ""}`);

    console.log("\núltimos lançamentos:");
    for (const l of await ultimosLancamentos(s.db, 20)) {
      console.log(`  ${l.criadoEm.toISOString()}  ${l.tipo.padEnd(17)} ${formatarReais(l.valorCentavos).padStart(14)}  ${l.doacaoId ?? l.repasseId ?? ""}`);
    }
  } finally {
    await s.fecharTudo();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
