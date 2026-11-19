import { redirect } from "react-router";
import type { Route } from "./+types/apelido.confirmar";
import { servicosContext } from "~/contexto.server";
import { cookieApelido } from "~/util/cookies";
import { Botao } from "~/componentes/Botao";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "confirmar apelido — pix esconde" }, { name: "robots", content: "noindex" }];
}

/** Link mágico do e-mail. Confirma o apelido, grava o cookie de dono e manda para o ranking. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const s = context.get(servicosContext);
  const r = await s.apelidos.confirmarToken(params.token);
  if (!r.ok) return { ok: false as const };
  return redirect(`/ranking?apelido=${encodeURIComponent(r.nome)}`, {
    headers: { "Set-Cookie": cookieApelido(r.cookie, s.emProducao) },
  });
}

export default function ConfirmarApelido() {
  return (
    <div className="max-w-xl">
      <h1 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Esse link já foi usado, ou expirou.</h1>
      <p className="mt-3 text-cinza">
        O link vale 30 minutos e só funciona uma vez. Se você já clicou antes, o apelido já está confirmado. Se não,
        volte ao comprovante e peça outro.
      </p>
      <div className="mt-6 flex gap-3">
        <Botao variante="contorno" href="/ranking">
          Ver o ranking
        </Botao>
      </div>
    </div>
  );
}
