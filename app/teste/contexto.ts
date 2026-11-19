import { RouterContextProvider } from "react-router";
import { criarDbTeste } from "@/infra/db/teste";
import { montarServicos, type Servicos } from "~/servicos.server";
import { cloudflareContext, servicosContext } from "~/contexto.server";

export const ENV_TESTE = {
  HYPERDRIVE: { connectionString: "postgres://nao-usado" },
  PROVEDOR_PAGAMENTO: "fake",
  PROVEDOR_REPASSE: "fake",
  PROVEDOR_EMAIL: "console",
  PROVEDOR_CAPTCHA: "sempre-ok",
  URL_PUBLICA: "http://localhost:5173",
  CHAVE_CIFRA: "wJ1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0a=",
  SEGREDO_HMAC: "Zz1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0b=",
  SEGREDO_COOKIE: "Cc1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0c=",
};

export type ContextoTeste = {
  servicos: Servicos;
  /** Um RouterContextProvider novo por requisição simulada (config em cache por requisição). */
  contexto(): RouterContextProvider;
  relogio: { agora: Date };
  fechar(): Promise<void>;
};

/**
 * Serviços reais sobre PGlite + provedores falsos, embrulhados no mesmo contexto
 * que o Worker entrega aos loaders e actions. Testa rota sem HTTP.
 */
export async function criarContextoTeste(): Promise<ContextoTeste> {
  const { db, fechar } = await criarDbTeste();
  const relogio = { agora: new Date("2026-11-18T20:00:00Z") };
  const servicos = montarServicos(ENV_TESTE, { db, fechar, agora: () => relogio.agora, silencioso: true });
  return {
    servicos,
    relogio,
    contexto() {
      const c = new RouterContextProvider();
      c.set(cloudflareContext, { env: ENV_TESTE as unknown as Env, ctx: { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext });
      // um grafo novo por requisição para o cache de config não vazar entre testes, mas sobre o mesmo db
      c.set(servicosContext, montarServicos(ENV_TESTE, { db, fechar: async () => {}, agora: () => relogio.agora, provedores: servicos.provedores }));
      return c;
    },
    fechar,
  };
}

export function requisicao(url: string, init?: RequestInit): Request {
  return new Request(new URL(url, "http://localhost:5173"), init);
}

export function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}
