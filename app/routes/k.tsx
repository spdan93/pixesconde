import { useState } from "react";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/k";
import { servicosContext } from "~/contexto.server";
import { mensagemRecusa } from "@/domain/chaves/validar-chave";
import { MENSAGEM_DUPLICADA } from "./cadastrar";
import { dataHora, formatarReais, nomeAnonimo, tempoRelativo } from "~/util/formatos";
import { Botao } from "~/componentes/Botao";
import { Campo, classeInput } from "~/componentes/Campo";
import { Carimbo } from "~/componentes/Carimbo";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [
    { title: d ? `${nomeAnonimo(d.recebedor.numeroPublico)} — sua página secreta` : "pix esconde" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const s = context.get(servicosContext);
  const recebedor = await s.recebedores.buscarPorToken(params.token);
  // 404 genérico: não distingue "nunca existiu" de "existiu".
  if (!recebedor) throw new Response("não encontrado", { status: 404 });
  const [doacoes, repasses, cfg] = await Promise.all([
    s.doacoes.listarDoRecebedor(recebedor.id),
    s.repasses.listarDoRecebedor(recebedor.id),
    s.config(),
  ]);
  const confirmadas = doacoes.filter((d) => d.status === "confirmada");
  const totais = {
    recebidoCentavos: confirmadas.reduce((a, d) => a + d.valorCentavos, 0),
    taxaCentavos: confirmadas.reduce((a, d) => a + d.taxaCentavos, 0),
    repassadoCentavos: confirmadas.filter((d) => d.repasse === "concluido").reduce((a, d) => a + d.liquidoCentavos, 0),
    pendenteCentavos: confirmadas.filter((d) => d.repasse === "pendente").reduce((a, d) => a + d.liquidoCentavos, 0),
  };
  const url = new URL(request.url);
  return {
    recebedor,
    doacoes,
    repasses,
    totais,
    nova: url.searchParams.get("nova") === "1",
    aba: url.searchParams.get("aba") === "repasses" ? ("repasses" as const) : ("mensagens" as const),
    linkSecreto: `${s.urlPublica}/k/${params.token}`,
    gatilhoRepasse: cfg.gatilhoRepasse,
    agora: new Date().toISOString(),
  };
}

const INTENTS = new Set(["pausar", "reativar", "remover", "trocar", "denunciar"]);

export async function action({ params, request, context }: Route.ActionArgs) {
  const s = context.get(servicosContext);
  const recebedor = await s.recebedores.buscarPorToken(params.token);
  if (!recebedor) throw new Response("não encontrado", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (!INTENTS.has(intent)) return data({ erroTroca: null as string | null, erro: "ação desconhecida" }, { status: 400 });

  switch (intent) {
    case "pausar":
      await s.recebedores.pausar(recebedor.id);
      break;
    case "reativar":
      await s.recebedores.reativar(recebedor.id);
      break;
    case "remover":
      await s.recebedores.remover(recebedor.id);
      break;
    case "denunciar": {
      const doacaoId = String(form.get("doacaoId") ?? "");
      const minhas = await s.doacoes.listarDoRecebedor(recebedor.id);
      if (minhas.some((d) => d.id === doacaoId)) await s.apelidos.denunciar(doacaoId, String(form.get("motivo") ?? "") || null);
      break;
    }
    case "trocar": {
      const r = await s.recebedores.trocarChave(recebedor.id, String(form.get("chave") ?? ""));
      if (!r.ok) {
        return data({ erroTroca: r.motivo === "duplicada" ? MENSAGEM_DUPLICADA : mensagemRecusa(r.motivo), erro: null }, { status: 400 });
      }
      // Chave nova: o que estava retido volta a ser agrupado.
      await s.repasses.agendarParaRecebedor(recebedor.id);
      break;
    }
  }
  return redirect(`/k/${params.token}`);
}

const ESTADOS: Record<string, { texto: string; tom: "pix" | "vermelho" | null }> = {
  aguardando_validacao: { texto: "NA RODA", tom: "pix" },
  ativa: { texto: "NA RODA", tom: "pix" },
  pausada: { texto: "PAUSADA", tom: "vermelho" },
  removida: { texto: "FORA DA RODA", tom: "vermelho" },
  invalida: { texto: "CHAVE INVÁLIDA", tom: "vermelho" },
};

export default function PaginaSecreta({ loaderData: d, actionData }: Route.ComponentProps) {
  const r = d.recebedor;
  const nome = nomeAnonimo(r.numeroPublico);
  const agora = new Date(d.agora);
  const estado = ESTADOS[r.status]!;
  const [copiado, setCopiado] = useState(false);
  const [trocando, setTrocando] = useState(Boolean(actionData?.erroTroca));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(d.linkSecreto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem clipboard: o link está visível para copiar à mão */
    }
  }

  return (
    <>
      {d.nova && (
        <section aria-labelledby="novo" className="mb-10 max-w-xl border-2 border-tinta p-5">
          <Carimbo texto="NA RODA" tom="pix" />
          <h1 id="novo" className="mt-4 font-titulo text-[30px] font-bold leading-none tracking-tight">
            Você agora é {nome}.
          </h1>
          <p className="mt-2 text-cinza">
            Guarde este link. É o único jeito de ver o que chegou, ler as mensagens e tirar a chave da roda. Não
            pedimos e-mail, então não tem “esqueci”.
          </p>
          <p className="my-4 break-all border-2 border-tinta p-3 text-[13px]">{d.linkSecreto}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Botao variante="primario" onClick={copiar}>
              {copiado ? "Copiado" : "Copiar link"}
            </Botao>
            <Botao variante="contorno" href={`/k/${d.linkSecreto.split("/k/")[1]}`}>
              Entendi, me mostra a página
            </Botao>
          </div>
        </section>
      )}

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-titulo text-[34px] font-bold leading-none tracking-tight">{nome}</h1>
          <p className="mt-1 text-[13px] text-cinza">
            sua chave · {r.chaveMascarada} · na roda {tempoRelativo(new Date(r.criadoEm), agora)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estado.tom && <Carimbo texto={estado.texto} tom={estado.tom} className="!text-sm" />}
          <Form method="post" className="flex gap-2">
            {(r.status === "ativa" || r.status === "aguardando_validacao") && (
              <Botao variante="contorno" tamanho="p" type="submit" name="intent" value="pausar">
                pausar
              </Botao>
            )}
            {r.status === "pausada" && (
              <Botao variante="contorno" tamanho="p" type="submit" name="intent" value="reativar">
                voltar pra roda
              </Botao>
            )}
            {r.status !== "removida" && (
              <Botao
                variante="contorno"
                tamanho="p"
                type="submit"
                name="intent"
                value="remover"
                onClick={(e) => {
                  if (!confirm("Tirar a chave da roda? O que já chegou ainda é repassado; novos Pix não.")) e.preventDefault();
                }}
              >
                tirar da roda
              </Botao>
            )}
          </Form>
        </div>
      </header>

      {r.status === "invalida" && (
        <section className="mb-6 border-2 border-carimbo bg-aviso-fundo p-4 text-[14px]">
          <p className="font-bold">O banco recusou essa chave quando fomos pagar.</p>
          <p className="mt-1">
            O que chegou está guardado ({formatarReais(d.totais.pendenteCentavos)}). Troque por outra chave aleatória para
            receber. Sem troca em 30 dias, devolvemos para quem mandou.
          </p>
        </section>
      )}

      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        <Caixa rotulo="recebido no total" valor={d.totais.recebidoCentavos} nota={`${d.doacoes.filter((x) => x.status === "confirmada").length} pix`} />
        <Caixa rotulo="já caiu na sua conta" valor={d.totais.repassadoCentavos} nota={`${d.repasses.filter((x) => x.status === "concluido").length} repasses · taxa ${formatarReais(d.totais.taxaCentavos)}`} />
        <Caixa
          rotulo="próximo repasse"
          valor={d.totais.pendenteCentavos}
          nota={d.totais.pendenteCentavos === 0 ? "nada pendente" : d.gatilhoRepasse === "imediato" ? "em instantes" : "amanhã, por volta das 10h"}
        />
      </div>

      <section className="mb-8">
        <button type="button" onClick={() => setTrocando((v) => !v)} className="link text-[13px] text-cinza">
          {trocando ? "fechar troca de chave" : "trocar a chave Pix"}
        </button>
        {trocando && (
          <Form method="post" className="mt-3 max-w-md">
            <input type="hidden" name="intent" value="trocar" />
            <Campo rotulo="Nova chave aleatória" htmlFor="chave" erro={actionData?.erroTroca ?? null} dica="O número e o histórico continuam os mesmos. A chave antiga sai da roda.">
              <input id="chave" name="chave" autoComplete="off" spellCheck={false} className={classeInput} aria-invalid={Boolean(actionData?.erroTroca)} />
            </Campo>
            <Botao variante="contorno" tamanho="p" type="submit">
              Trocar chave
            </Botao>
          </Form>
        )}
      </section>

      <nav aria-label="abas" className="linha-solida mb-2 flex gap-6 text-[14px]">
        <Link to="?aba=mensagens" className={`py-2 ${d.aba === "mensagens" ? "-mb-0.5 border-b-[3px] border-pix font-bold" : "text-cinza"}`} aria-current={d.aba === "mensagens" ? "page" : undefined}>
          mensagens
        </Link>
        <Link to="?aba=repasses" className={`py-2 ${d.aba === "repasses" ? "-mb-0.5 border-b-[3px] border-pix font-bold" : "text-cinza"}`} aria-current={d.aba === "repasses" ? "page" : undefined}>
          repasses
        </Link>
      </nav>

      {d.aba === "mensagens" ? (
        d.doacoes.length === 0 ? (
          <p className="py-6 text-cinza">Nada chegou ainda. Alguém vai olhar pro seu número e achar bonito.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {d.doacoes.map((x) => (
                <tr key={x.id} className="linha-pontilhada align-top">
                  <td className="w-28 py-3 pr-3">
                    <b>{formatarReais(x.valorCentavos)}</b>
                    <div className="text-[12px] text-cinza">{x.confirmadaEm ? tempoRelativo(new Date(x.confirmadaEm), agora) : ""}</div>
                  </td>
                  <td className="py-3 pr-3">
                    {x.mensagem ? (
                      <span className={x.mensagemOculta ? "text-cinza line-through" : "italic"}>“{x.mensagem}”</span>
                    ) : (
                      <span className="text-cinza">sem mensagem</span>
                    )}
                    <div className="text-[12px] text-cinza">de {x.apelido ?? "anônimo"}</div>
                  </td>
                  <td className="py-3 text-right text-[12px] text-cinza">
                    {x.status === "estornada" ? "devolvido" : x.repasse === "concluido" ? "repassado" : "no próximo repasse"}
                    {x.mensagem && !x.mensagemOculta && (
                      <Form method="post" className="mt-1">
                        <input type="hidden" name="intent" value="denunciar" />
                        <input type="hidden" name="doacaoId" value={x.id} />
                        <button type="submit" className="link text-[11px]">
                          denunciar mensagem
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : d.repasses.length === 0 ? (
        <p className="py-6 text-cinza">Nenhum repasse ainda.</p>
      ) : (
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            {d.repasses.map((x) => (
              <tr key={x.id} className="linha-pontilhada align-top">
                <td className="w-28 py-3 pr-3">
                  <b>{formatarReais(x.valorCentavos)}</b>
                </td>
                <td className="py-3 pr-3">
                  {dataHora(new Date(x.concluidoEm ?? x.agendadoPara))}
                  {x.erro && <div className="text-[12px] text-carimbo">{x.erro}</div>}
                </td>
                <td className="py-3 text-right text-[12px] text-cinza">{x.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-[12px] text-cinza">Mensagem ofensiva? Denuncie. A gente esconde e a pessoa perde o apelido.</p>
    </>
  );
}

function Caixa({ rotulo, valor, nota }: { rotulo: string; valor: number; nota: string }) {
  return (
    <div className="border-2 border-tinta p-4">
      <div className="text-[12px] text-cinza">{rotulo}</div>
      <div className="font-titulo text-[30px] font-bold leading-none">{formatarReais(valor)}</div>
      <div className="mt-1 text-[12px] text-cinza">{nota}</div>
    </div>
  );
}
