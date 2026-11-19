import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/webhooks.fake";
import { cloudflareContext, servicosContext } from "~/contexto.server";
import { doacoes } from "@/infra/db/schema";
import type { FakeEntrada } from "@/providers/payment-in/fake";

const RESULTADOS = new Set(["aprovado", "rejeitado"]);

/**
 * Webhook do provedor falso. Marca o resultado no fake e passa pelo mesmo
 * `processarNotificacao` que o webhook real do Mercado Pago vai usar.
 * O id externo é determinístico (ref + resultado) para o reenvio ser ignorado.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  if (env.PROVEDOR_PAGAMENTO !== "fake") throw new Response("não existe", { status: 404 });
  const s = context.get(servicosContext);

  const corpo = await lerCorpo(request);
  const ref = String(corpo.ref ?? "");
  const resultado = String(corpo.resultado ?? "");
  const voltar = typeof corpo.voltar === "string" && corpo.voltar.startsWith("/") ? corpo.voltar : null;
  if (!ref || !RESULTADOS.has(resultado)) return Response.json({ erro: "ref e resultado (aprovado|rejeitado) são obrigatórios" }, { status: 400 });

  const [d] = await s.db.select({ valor: doacoes.valorCentavos }).from(doacoes).where(eq(doacoes.refExterna, ref)).limit(1);
  (s.provedores.entrada as FakeEntrada).marcarResultado(ref, resultado as "aprovado" | "rejeitado", d?.valor);

  const r = await s.doacoes.processarNotificacao({
    provedor: "fake",
    idExterno: `fake_${ref}_${resultado}`,
    refExterna: ref,
    idProvedor: `fake_pg_${ref}`,
    payload: { ref, resultado },
  });

  if (voltar) return redirect(voltar);
  return Response.json(r, { status: 200 });
}

export async function loader() {
  return Response.json({ erro: "use POST" }, { status: 405 });
}

async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}
