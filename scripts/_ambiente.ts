import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { criarDb } from "../src/infra/db/client";
import { montarServicos, type Servicos } from "../app/servicos.server";

/**
 * Scripts de operação rodam em Node, fora do Worker. Carregam `.dev.vars` se as
 * variáveis não vieram do ambiente, abrem o Postgres de DATABASE_URL e montam os
 * mesmos serviços do site (nada de INSERT cru: o razão fica consistente).
 */
export function carregarDevVars() {
  try {
    const texto = readFileSync(fileURLToPath(new URL("../.dev.vars", import.meta.url)), "utf8");
    for (const linha of texto.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
    }
  } catch {
    /* sem .dev.vars: só o ambiente */
  }
}

export function abrirServicos(opts: { agora?: () => Date } = {}): Servicos & { fecharTudo(): Promise<void> } {
  carregarDevVars();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida (ver .dev.vars.example)");
    process.exit(1);
  }
  const { db, fechar } = criarDb(url);
  const servicos = montarServicos(
    {
      HYPERDRIVE: { connectionString: url },
      PROVEDOR_PAGAMENTO: process.env.PROVEDOR_PAGAMENTO ?? "fake",
      PROVEDOR_REPASSE: process.env.PROVEDOR_REPASSE ?? "fake",
      URL_PUBLICA: process.env.URL_PUBLICA ?? "http://localhost:5173",
      MODO_DEMO: process.env.MODO_DEMO,
      CHAVE_CIFRA: process.env.CHAVE_CIFRA ?? "",
      SEGREDO_HMAC: process.env.SEGREDO_HMAC ?? "",
      SEGREDO_COOKIE: process.env.SEGREDO_COOKIE ?? "",
    },
    { db, fechar, silencioso: true, agora: opts.agora },
  );
  return { ...servicos, fecharTudo: fechar };
}
