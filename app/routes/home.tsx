import type { Route } from "./+types/home";
import { servicosContext } from "~/contexto.server";
import { formatarBp, formatarReais } from "~/util/formatos";
import { Botao } from "~/componentes/Botao";
import { Carimbo } from "~/componentes/Carimbo";
import { ListaRecebedores } from "~/componentes/ListaRecebedores";
import { RankingResumo } from "~/componentes/RankingResumo";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "pix esconde — mande um Pix pra um estranho" },
    { name: "description", content: "Pix sem motivo para desconhecidos. A partir de R$ 5. Ninguém sabe quem mandou, ninguém sabe quem recebeu." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { recebedores, ranking, config } = context.get(servicosContext);
  const cfg = await config();
  const [resumo, lista, topo] = await Promise.all([
    ranking.resumoHome(),
    recebedores.listarPublico({ ordem: "recentes", limite: 8, pagina: 1 }),
    ranking.doadores({ por: "valor", periodo: "tudo", limite: 3, excluir: cfg.apelidosForaDoRanking }),
  ]);
  return {
    resumo,
    recebedores: lista.itens,
    totalChaves: lista.total,
    ranking: topo,
    taxaTexto: formatarBp(cfg.taxaBp),
    minimoTexto: formatarReais(cfg.minimoCentavos),
    agora: new Date().toISOString(),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { resumo, recebedores, totalChaves, ranking, minimoTexto } = loaderData;
  const agora = new Date(loaderData.agora);
  return (
    <>
      <section className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
        <div>
          <h1 className="font-titulo text-[44px] font-bold leading-[0.98] tracking-tight sm:text-manchete">
            Mande um Pix
            <br />
            pra um estranho.
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-cinza">
            Nenhuma causa. Nenhuma razão. A partir de {minimoTexto}. Quem recebe não sabe quem mandou, quem manda não
            sabe quem recebeu.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Botao variante="primario" href="/sortear">
              Sortear uma chave
            </Botao>
            <Botao variante="contorno" href="/chaves">
              Escolher na lista
            </Botao>
          </div>
          <p className="mt-3 text-[12px] text-cinza">
            {resumo.totalChaves === 1 ? "1 chave cadastrada" : `${resumo.totalChaves} chaves cadastradas`} ·{" "}
            {formatarReais(resumo.totalCentavos)} mandados sem motivo até agora
          </p>
        </div>
        <div className="flex flex-col gap-7">
          <Carimbo texto="SEM MOTIVO" tom="vermelho" className="self-start" />
          <RankingResumo ranking={ranking} />
        </div>
      </section>

      <section aria-labelledby="chaves-recentes" className="mt-12">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="chaves-recentes" className="font-titulo text-2xl font-bold">
            Quem está na roda
          </h2>
          {totalChaves > recebedores.length && (
            <a href="/chaves" className="link text-[12px] text-cinza">
              ver todas as {totalChaves}
            </a>
          )}
        </div>
        <ListaRecebedores itens={recebedores} agora={agora} />
      </section>
    </>
  );
}
