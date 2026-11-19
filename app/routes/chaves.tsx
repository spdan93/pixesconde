import { Link } from "react-router";
import type { Route } from "./+types/chaves";
import { servicosContext } from "~/contexto.server";
import type { OrdemLista } from "@/domain/recebedores/servico";
import { ListaRecebedores } from "~/componentes/ListaRecebedores";

const ORDENS: { valor: OrdemLista; texto: string }[] = [
  { valor: "recentes", texto: "mais recentes" },
  { valor: "menos_receberam", texto: "quem menos recebeu" },
  { valor: "mais_receberam", texto: "quem mais recebeu" },
  { valor: "aleatoria", texto: "aleatório" },
];
const POR_PAGINA = 30;

export function meta(_args: Route.MetaArgs) {
  return [{ title: "chaves na roda — pix esconde" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { recebedores } = context.get(servicosContext);
  const url = new URL(request.url);
  const ordemBruta = url.searchParams.get("ordem");
  const ordem: OrdemLista = ORDENS.some((o) => o.valor === ordemBruta) ? (ordemBruta as OrdemLista) : "recentes";
  const paginaBruta = Number(url.searchParams.get("pagina"));
  const pagina = Number.isInteger(paginaBruta) && paginaBruta >= 1 ? paginaBruta : 1;
  const { itens, total } = await recebedores.listarPublico({ ordem, limite: POR_PAGINA, pagina });
  return { itens, total, ordem, pagina, porPagina: POR_PAGINA, agora: new Date().toISOString() };
}

export default function Chaves({ loaderData }: Route.ComponentProps) {
  const { itens, total, ordem, pagina, porPagina } = loaderData;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <>
      <h1 className="font-titulo text-4xl font-bold leading-none tracking-tight">
        {total === 1 ? "1 chave na roda" : `${total} chaves na roda`}
      </h1>
      <nav aria-label="ordenação" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <span className="text-cinza">ordenar:</span>
        {ORDENS.map((o) => (
          <Link
            key={o.valor}
            to={`/chaves?ordem=${o.valor}`}
            className={`link ${o.valor === ordem ? "font-bold" : "text-cinza"}`}
            aria-current={o.valor === ordem ? "true" : undefined}
          >
            {o.texto}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <ListaRecebedores itens={itens} agora={new Date(loaderData.agora)} />
      </div>
      {paginas > 1 && (
        <nav aria-label="páginas" className="mt-6 flex items-center gap-4 text-[13px]">
          {pagina > 1 && (
            <Link to={`/chaves?ordem=${ordem}&pagina=${pagina - 1}`} className="link">
              ← anteriores
            </Link>
          )}
          <span className="text-cinza">
            página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link to={`/chaves?ordem=${ordem}&pagina=${pagina + 1}`} className="link">
              próximas →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
