import { Form } from "react-router";
import type { Route } from "./+types/comprovante";
import { servicosContext } from "~/contexto.server";
import { formatarBp, formatarReais } from "@/domain/dinheiro";
import { lerCookie, nomeCookieDoador } from "~/util/cookies";
import { dataHora, nomeAnonimo, numeroComprovante } from "~/util/formatos";
import { Botao } from "~/componentes/Botao";
import { Campo, classeInput } from "~/componentes/Campo";
import { Carimbo } from "~/componentes/Carimbo";

export function meta({ loaderData: d, location }: Route.MetaArgs) {
  if (!d) return [{ title: "comprovante — pix esconde" }];
  const c = d.comprovante;
  const titulo = `Pix sem motivo de ${formatarReais(c.valorCentavos)} para ${nomeAnonimo(c.numeroPublico)}`;
  const tags: Record<string, string>[] = [
    { title: `${titulo} — pix esconde` },
    { property: "og:title", content: titulo },
    { property: "og:description", content: c.mensagem && !c.mensagemOculta ? `“${c.mensagem}”` : "Motivo: nenhum." },
    { property: "og:type", content: "article" },
    { property: "og:url", content: `${d.urlPublica}${location.pathname}` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
  if (c.status === "confirmada") {
    tags.push({ property: "og:image", content: `${d.urlPublica}/comprovante/${c.id}/imagem.png` });
    tags.push({ property: "og:image:width", content: "1080" }, { property: "og:image:height", content: "1080" });
  }
  if (c.status === "pendente") tags.push({ httpEquiv: "refresh", content: "3" });
  return tags;
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const s = context.get(servicosContext);
  const comprovante = await s.doacoes.buscarComprovante(params.id);
  if (!comprovante) throw new Response("comprovante não encontrado", { status: 404 });
  const segredo = lerCookie(request, nomeCookieDoador(params.id));
  const ehODoador = await s.apelidos.ehODoador(params.id, segredo);
  return { comprovante, ehODoador, urlPublica: s.urlPublica };
}

export default function Comprovante({ loaderData: d, actionData }: Route.ComponentProps) {
  const c = d.comprovante;
  const nome = nomeAnonimo(c.numeroPublico);
  const confirmada = c.status === "confirmada";
  const pendente = c.status === "pendente";
  const vinculo = (actionData ?? null) as { vinculo?: { ok: boolean; mensagem: string } } | null;

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[auto_1fr] lg:gap-12">
      <article aria-label="comprovante" className="relative w-full max-w-[420px] border-2 border-tinta p-6">
        <div className="absolute right-4 top-3">
          {confirmada && <Carimbo texto="PAGO" tom="pix" />}
          {pendente && <span className="font-titulo text-sm font-bold text-cinza">AGUARDANDO</span>}
          {c.status === "expirada" && <Carimbo texto="EXPIROU" tom="vermelho" />}
          {(c.status === "estornada" || c.status === "estornando") && <Carimbo texto="DEVOLVIDO" tom="vermelho" />}
        </div>
        <h1 className="mb-4 font-titulo text-[22px] font-bold leading-tight">
          Comprovante de Pix
          <br />
          sem motivo
        </h1>
        <dl className="text-[14px]">
          <Linha rotulo="valor">
            <b>{formatarReais(c.valorCentavos)}</b>
          </Linha>
          <Linha rotulo="para">{nome}</Linha>
          <Linha rotulo="de">{c.apelidoTexto ?? "anônimo"}</Linha>
          <Linha rotulo="motivo">nenhum</Linha>
          <Linha rotulo="mensagem">{c.mensagem && !c.mensagemOculta ? <i>“{c.mensagem}”</i> : <span className="text-cinza">—</span>}</Linha>
          <Linha rotulo="chega lá">
            {formatarReais(c.liquidoCentavos)}
            {c.previsaoRepasse ? `, ${c.previsaoRepasse}` : ""}
            <span className="text-cinza"> (taxa {formatarBp(c.taxaBp)}: {formatarReais(c.taxaCentavos)})</span>
          </Linha>
          <Linha rotulo="quando">{dataHora(new Date(c.confirmadaEm ?? c.criadaEm))}</Linha>
          <Linha rotulo="nº" ultima>
            {numeroComprovante(c.numeroComprovante)}
          </Linha>
        </dl>
      </article>

      <div>
        {confirmada && (
          <>
            <h2 className="font-titulo text-[34px] font-bold leading-none tracking-tight">
              Pronto. Você fez uma pessoa
              <br />
              olhar pro celular confusa.
            </h2>
            <p className="mt-3 max-w-md text-cinza">
              Esse comprovante é público e não tem nada que identifique você nem quem recebeu. Compartilhe à vontade.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Botao variante="primario" href={`/comprovante/${c.id}/imagem.png`}>
                Baixar imagem do comprovante
              </Botao>
              <Botao variante="contorno" href="/sortear">
                Mandar outro, pra outro
              </Botao>
            </div>
          </>
        )}
        {pendente && (
          <>
            <h2 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Esperando o pagamento confirmar.</h2>
            <p className="mt-3 max-w-md text-cinza">
              Assim que o Mercado Pago avisar, esta página vira comprovante sozinha. Pix costuma levar segundos.
            </p>
          </>
        )}
        {c.status === "expirada" && (
          <>
            <h2 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Esse Pix não aconteceu.</h2>
            <p className="mt-3 max-w-md text-cinza">O tempo para pagar passou. Nada foi cobrado. Quer tentar de novo?</p>
            <div className="mt-5">
              <Botao variante="primario" href={`/mandar/${c.numeroPublico}`}>
                Mandar de novo para {nome}
              </Botao>
            </div>
          </>
        )}
        {(c.status === "estornada" || c.status === "estornando") && (
          <>
            <h2 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Esse Pix voltou pra você.</h2>
            <p className="mt-3 max-w-md text-cinza">
              A chave de quem ia receber não existia mais quando fomos pagar, e ninguém trocou em 30 dias. O valor foi
              devolvido pelo Mercado Pago.
            </p>
          </>
        )}

        {confirmada && d.ehODoador && c.apelidoTexto && (
          <section aria-labelledby="vincular" className="mt-8 max-w-md border-2 border-tinta p-5">
            <h3 id="vincular" className="font-bold">
              Quer que esse Pix conte no ranking como {c.apelidoTexto}?
            </h3>
            {vinculo?.vinculo?.ok ? (
              <p className="mt-2 text-[14px]">{vinculo.vinculo.mensagem}</p>
            ) : (
              <Form method="post" className="mt-3">
                <input type="hidden" name="intent" value="vincular" />
                <Campo rotulo="Seu e-mail" htmlFor="email" erro={vinculo?.vinculo?.mensagem ?? null} dica="Só pra provar que o apelido é seu. Não aparece em lugar nenhum.">
                  <input id="email" name="email" type="email" required autoComplete="email" className={classeInput} />
                </Campo>
                <Botao variante="contorno" tamanho="p" type="submit">
                  Confirmar apelido
                </Botao>
              </Form>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Linha({ rotulo, children, ultima }: { rotulo: string; children: React.ReactNode; ultima?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${ultima ? "" : "linha-pontilhada"}`}>
      <dt className="text-cinza">{rotulo}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
