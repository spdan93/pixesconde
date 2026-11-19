import { Form, redirect } from "react-router";
import type { Route } from "./+types/apelido.confirmar";
import { servicosContext } from "~/contexto.server";
import { cookieApelido } from "~/util/cookies";
import { Botao } from "~/componentes/Botao";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "confirmar apelido — pix esconde" }, { name: "robots", content: "noindex" }];
}

/**
 * Link mágico do e-mail. O GET só mostra a página (scanners de e-mail abrem links e não podem
 * queimar o token nem levar o cookie). Quem confirma é o POST, no navegador da pessoa.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const s = context.get(servicosContext);
  const t = await s.apelidos.espiarToken(params.token);
  return t ? { nome: t.nome, valido: true as const } : { nome: null, valido: false as const };
}

export async function action({ params, context }: Route.ActionArgs) {
  const s = context.get(servicosContext);
  const r = await s.apelidos.confirmarToken(params.token);
  if (!r.ok) return { ok: false as const };
  return redirect(`/ranking?apelido=${encodeURIComponent(r.nome)}`, {
    headers: { "Set-Cookie": cookieApelido(r.cookie, s.emProducao) },
  });
}

export default function ConfirmarApelido({ loaderData: d, actionData }: Route.ComponentProps) {
  const falhou = !d.valido || actionData?.ok === false;
  if (falhou) {
    return (
      <div className="max-w-xl">
        <h1 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Esse link já foi usado, ou expirou.</h1>
        <p className="mt-3 text-cinza">
          O link vale 30 minutos e só funciona uma vez. Se você já confirmou antes, o apelido já é seu. Se não, volte ao
          comprovante e peça outro.
        </p>
        <div className="mt-6">
          <Botao variante="contorno" href="/ranking">
            Ver o ranking
          </Botao>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-xl">
      <h1 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Confirmar o apelido {d.nome}?</h1>
      <p className="mt-3 text-cinza">
        A partir daqui, seus Pix sem motivo neste navegador contam no ranking como <b className="text-tinta">{d.nome}</b>. O
        e-mail não aparece para ninguém.
      </p>
      <Form method="post" className="mt-6">
        <Botao variante="primario" type="submit">
          Confirmar apelido
        </Botao>
      </Form>
    </div>
  );
}
