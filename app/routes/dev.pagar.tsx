import { eq } from "drizzle-orm";
import type { Route } from "./+types/dev.pagar";
import { cloudflareContext, servicosContext } from "~/contexto.server";
import { doacoes } from "@/infra/db/schema";
import { formatarReais } from "@/domain/dinheiro";
import { Botao } from "~/componentes/Botao";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "pagamento de mentira — pix esconde (dev)" }, { name: "robots", content: "noindex" }];
}

/** Só existe quando o provedor de entrada é o falso. Substitui o checkout do Mercado Pago em dev. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  if (env.PROVEDOR_PAGAMENTO !== "fake") throw new Response("não existe", { status: 404 });
  const { db } = context.get(servicosContext);
  const [d] = await db.select().from(doacoes).where(eq(doacoes.refExterna, params.ref)).limit(1);
  if (!d) throw new Response("cobrança desconhecida", { status: 404 });
  return { ref: params.ref, valorCentavos: d.valorCentavos, doacaoId: d.id, status: d.status };
}

export default function DevPagar({ loaderData: d }: Route.ComponentProps) {
  const voltar = `/comprovante/${d.doacaoId}`;
  return (
    <div className="mx-auto max-w-md border-2 border-dashed border-carimbo p-6">
      <p className="font-titulo text-sm font-bold uppercase text-carimbo">ambiente de desenvolvimento</p>
      <h1 className="mt-2 font-titulo text-3xl font-bold leading-none">Pagamento de mentira</h1>
      <p className="mt-2 text-cinza">
        Aqui seria o checkout do Mercado Pago. Cobrança <code className="text-tinta">{d.ref}</code> de{" "}
        <b className="text-tinta">{formatarReais(d.valorCentavos)}</b>, estado atual: {d.status}.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <form method="post" action="/webhooks/fake">
          <input type="hidden" name="ref" value={d.ref} />
          <input type="hidden" name="resultado" value="aprovado" />
          <input type="hidden" name="voltar" value={voltar} />
          <Botao variante="primario" type="submit" className="w-full">
            Aprovar pagamento
          </Botao>
        </form>
        <form method="post" action="/webhooks/fake">
          <input type="hidden" name="ref" value={d.ref} />
          <input type="hidden" name="resultado" value="rejeitado" />
          <input type="hidden" name="voltar" value={voltar} />
          <Botao variante="contorno" type="submit" className="w-full">
            Rejeitar pagamento
          </Botao>
        </form>
        <a href={voltar} className="link text-center text-[13px] text-cinza">
          voltar sem pagar (fica pendente até expirar)
        </a>
      </div>
    </div>
  );
}
