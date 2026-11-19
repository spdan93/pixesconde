import { Link } from "react-router";
import type { Ranking } from "@/domain/ranking/servico";
import { formatarReais } from "~/util/formatos";

export function RankingResumo({ ranking }: { ranking: Ranking }) {
  const vazio = ranking.posicoes.length === 0 && ranking.anonimos.quantidade === 0;
  return (
    <section aria-labelledby="ranking-resumo" className="border-2 border-tinta p-5">
      <h2 id="ranking-resumo" className="mb-1.5 font-titulo text-lg font-bold">
        Maiores doadores
      </h2>
      {vazio ? (
        <p className="text-[13px] text-cinza">Ninguém mandou nada ainda. O primeiro Pix abre o ranking.</p>
      ) : (
        <ol className="text-[14px]">
          {ranking.posicoes.map((p) => (
            <li key={p.apelido} className="linha-pontilhada flex justify-between py-1.5">
              <span>
                {p.posicao}. {p.apelido}
              </span>
              <span>{formatarReais(p.totalCentavos)}</span>
            </li>
          ))}
          {ranking.anonimos.quantidade > 0 && (
            <li className="flex justify-between py-1.5 text-cinza">
              <span>anônimos ({ranking.anonimos.quantidade})</span>
              <span>{formatarReais(ranking.anonimos.totalCentavos)}</span>
            </li>
          )}
        </ol>
      )}
      <Link to="/ranking" className="link mt-2 inline-block text-[12px] text-cinza">
        ver ranking completo
      </Link>
    </section>
  );
}
