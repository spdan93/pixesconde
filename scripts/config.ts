/**
 * Lê ou altera a configuração que muda a quente.
 *   pnpm tsx scripts/config.ts                      → mostra tudo
 *   pnpm tsx scripts/config.ts set taxaBp 1500      → altera (JSON para listas: '["bobo","feio"]')
 */
import { abrirServicos } from "./_ambiente";
import { ConfigSchema, gravarConfig } from "../src/infra/db/config";

async function main() {
  const s = abrirServicos();
  try {
    const [cmd, chave, valorBruto] = process.argv.slice(2);
    if (cmd === "set") {
      if (!chave || valorBruto === undefined) throw new Error("uso: set <chave> <valor>");
      if (!(chave in ConfigSchema.shape)) throw new Error(`chave desconhecida: ${chave}. Válidas: ${Object.keys(ConfigSchema.shape).join(", ")}`);
      let valor: unknown = valorBruto;
      try {
        valor = JSON.parse(valorBruto);
      } catch {
        /* texto puro */
      }
      const parcial = ConfigSchema.partial().parse({ [chave]: valor });
      await gravarConfig(s.db, parcial);
      console.log(`${chave} =`, parcial[chave as keyof typeof parcial]);
    }
    console.log(JSON.stringify(await s.config(), null, 2));
  } finally {
    await s.fecharTudo();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
