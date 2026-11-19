import { Link } from "react-router";
import type { Route } from "./+types/ranking";
import { servicosContext } from "~/contexto.server";
import type { CriterioRanking, Periodo } from "@/domain/ranking/servico";
import { formatarReais } from "~/util/formatos";

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: "tudo", texto: "desde sempre" },
  { valor: "mes", texto: "últimos 30 dias" },
  { valor: "semana", texto: "últimos 7 dias" },
];
const CRITERIOS: { valor: CriterioRanking; texto: string }[] = [
  { valor: "valor", texto: "por valor" },
  { valor: "quantidade", texto: "por quantidade" },
];

export function meta(_args: Route.MetaArgs) {
  return [{ title: "maiores doadores — pix esconde" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { ranking, config } = context.get(servicosContext);
  const url = new URL(request.url);
  const porBruto = url.searchParams.get("por");
  const periodoBruto = url.searchParams.get("periodo");
  const por: CriterioRanking = CRITERIOS.some((c) => c.valor === porBruto) ? (porBruto as CriterioRanking) : "valor";
  const periodo: Periodo = PERIODOS.some((p) => p.valor === periodoBruto) ? (periodoBruto as Periodo) : "tudo";
  const destaque = url.searchParams.get("apelido");
  const cfg = await config();
  const dados = await ranking.doadores({ por, periodo, limite: 100, excluir: cfg.apelidosForaDoRanking });
  return { ranking: dados, por, periodo, destaque };
}

export default function RankingPagina({ loaderData: d }: Route.ComponentProps) {
  const { ranking, por, periodo, destaque } = d;
  const posicaoDestaque = destaque ? ranking.posicoes.find((p) => p.apelido === destaque) : null;
  return (
    <>
      <h1 className="font-titulo text-4xl font-bold leading-none tracking-tight">Maiores doadores</h1>
      <p className="mt-2 max-w-xl text-cinza">
        Só Pix confirmado. Apelido só soma depois de confirmado por e-mail; o resto vira “anônimos”, no fim, sem número.
      </p>

      {destaque && (
        <p className="mt-5 max-w-xl border-2 border-pix p-3 text-[14px]">
          Apelido <b>{destaque}</b> confirmado.{" "}
          {posicaoDestaque
            ? `Você está em ${posicaoDestaque.posicao}º com ${formatarReais(posicaoDestaque.totalCentavos)}.`
            : "Seus próximos Pix neste navegador já contam direto."}
        </p>
      )}

      <nav aria-label="filtros" className="mt-6 flex flex-col gap-2 text-[13px] sm:flex-row sm:gap-8">
        <div className="flex gap-4">
          {CRITERIOS.map((c) => (
            <Link key={c.valor} to={`/ranking?por=${c.valor}&periodo=${periodo}`} className={`link ${c.valor === por ? "font-bold" : "text-cinza"}`} aria-current={c.valor === por ? "true" : undefined}>
              {c.texto}
            </Link>
          ))}
        </div>
        <div className="flex gap-4">
          {PERIODOS.map((p) => (
            <Link key={p.valor} to={`/ranking?por=${por}&periodo=${p.valor}`} className={`link ${p.valor === periodo ? "font-bold" : "text-cinza"}`} aria-current={p.valor === periodo ? "true" : undefined}>
              {p.texto}
            </Link>
          ))}
        </div>
      </nav>

      {ranking.posicoes.length === 0 && ranking.anonimos.quantidade === 0 ? (
        <p className="mt-8 text-cinza">Ninguém mandou nada nesse período. O primeiro Pix abre o ranking.</p>
      ) : (
        <table className="mt-6 w-full max-w-2xl border-collapse text-[15px]">
          <thead>
            <tr className="linha-solida text-left text-[12px]">
              <th className="py-2 font-bold">#</th>
              <th className="py-2 font-bold">apelido</th>
              <th className="py-2 text-right font-bold">total</th>
              <th className="py-2 text-right font-bold">pix</th>
            </tr>
          </thead>
          <tbody>
            {ranking.posicoes.map((p) => (
              <tr key={p.apelido} className={`linha-pontilhada ${p.apelido === destaque ? "bg-pix/10 font-bold" : ""}`}>
                <td className="py-2.5 pr-3 text-cinza">{p.posicao}</td>
                <td className="py-2.5 pr-3">{p.apelido}</td>
                <td className="py-2.5 text-right">{formatarReais(p.totalCentavos)}</td>
                <td className="py-2.5 text-right text-cinza">{p.quantidade}</td>
              </tr>
            ))}
            {ranking.anonimos.quantidade > 0 && (
              <tr className="text-cinza">
                <td className="py-2.5 pr-3">—</td>
                <td className="py-2.5 pr-3">anônimos</td>
                <td className="py-2.5 text-right">{formatarReais(ranking.anonimos.totalCentavos)}</td>
                <td className="py-2.5 text-right">{ranking.anonimos.quantidade}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
