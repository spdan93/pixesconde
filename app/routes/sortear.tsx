import { redirect } from "react-router";
import type { Route } from "./+types/sortear";
import { servicosContext } from "~/contexto.server";

/** Sorteia uma chave elegível e manda para a página de mandar Pix. Sem ninguém na roda, manda cadastrar. */
export async function loader({ context }: Route.LoaderArgs) {
  const { recebedores } = context.get(servicosContext);
  const numero = await recebedores.sortear();
  if (numero === null) return redirect("/cadastrar?motivo=vazio");
  return redirect(`/mandar/${numero}`, { headers: { "Cache-Control": "no-store" } });
}
