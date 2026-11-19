import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext, servicosContext } from "~/contexto.server";
import { montarServicos, rodarCron } from "~/servicos.server";
import { semIndexacao } from "~/util/robots";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const servicos = montarServicos(env);
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    context.set(servicosContext, servicos);
    try {
      const resposta = await requestHandler(request, context);
      // Demonstração não aparece em busca: quem chegasse por lá acharia que o Pix é de verdade.
      return servicos.modoDemo ? semIndexacao(resposta) : resposta;
    } finally {
      ctx.waitUntil(servicos.fechar());
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(rodarCron(env));
  },
} satisfies ExportedHandler<Env>;
