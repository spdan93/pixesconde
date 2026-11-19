import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/mandar";
import { servicosContext } from "~/contexto.server";
import { calcularTaxa, formatarBp, formatarReais, interpretarReais } from "@/domain/dinheiro";
import { MENSAGEM_MAX } from "@/domain/texto/validar-mensagem";
import { DESCRITOR_FATURA } from "@/domain/doacoes/servico";
import { ipDaRequisicao, permitir } from "@/infra/limites";
import { COOKIE_APELIDO, cookieDoador, lerCookie } from "~/util/cookies";
import { nomeAnonimo, tempoRelativo } from "~/util/formatos";
import { Botao } from "~/componentes/Botao";
import { Campo, classeInput } from "~/componentes/Campo";
import { Carimbo } from "~/componentes/Carimbo";

const SUGESTOES = [500, 1000, 2000, 5000];
const ELEGIVEIS = new Set(["ativa", "aguardando_validacao"]);

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: d ? `Pix para ${nomeAnonimo(d.recebedor.numeroPublico)} — pix esconde` : "pix esconde" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { recebedores, config } = context.get(servicosContext);
  const numero = Number(params.numero);
  const recebedor = Number.isInteger(numero) ? await recebedores.buscarPublico(numero) : null;
  if (!recebedor || !ELEGIVEIS.has(recebedor.status)) throw new Response("chave fora da roda", { status: 404 });
  const cfg = await config();
  return {
    recebedor,
    taxaBp: cfg.taxaBp,
    minimoCentavos: cfg.minimoCentavos,
    maximoCentavos: cfg.maximoCentavos,
    sugestoes: SUGESTOES,
    gatilhoRepasse: cfg.gatilhoRepasse,
    agora: new Date().toISOString(),
  };
}

type Erros = Partial<Record<"valor" | "mensagem" | "apelido" | "recebedor" | "formulario", string>>;

export async function action({ request, params, context }: Route.ActionArgs) {
  const s = context.get(servicosContext);
  const form = await request.formData();
  const valorEscolhido = String(form.get("valor") ?? "");
  const valorTexto = valorEscolhido === "outro" ? String(form.get("valor_outro") ?? "") : valorEscolhido;
  const mensagem = String(form.get("mensagem") ?? "");
  const apelido = String(form.get("apelido") ?? "");
  const valores = { valor: valorTexto, mensagem, apelido };

  const ip = ipDaRequisicao(request);
  if (!(await permitir(s.db, `mandar:${ip}`, 60, 30))) {
    return data({ erros: { formulario: "Calma. Muitos Pix em pouco tempo desse endereço. Tenta daqui a pouco." } as Erros, valores }, { status: 429 });
  }
  const captchaOk = await s.provedores.captcha.verificar(form.get("cf-turnstile-response") as string | null, ip);
  if (!captchaOk) {
    return data({ erros: { formulario: "Não conseguimos confirmar que você não é um robô. Recarrega e tenta de novo." } as Erros, valores }, { status: 400 });
  }

  const apelidoIdDoCookie = await s.apelidos.apelidoIdDoCookie(lerCookie(request, COOKIE_APELIDO));
  const r = await s.doacoes.criarIntencao({
    numeroPublico: Number(params.numero),
    valorTexto,
    mensagem,
    apelido,
    apelidoIdDoCookie,
  });
  if (!r.ok) return data({ erros: { [r.campo]: r.motivo } as Erros, valores }, { status: 400 });

  return redirect(r.urlPagamento, {
    headers: { "Set-Cookie": cookieDoador(r.doacaoId, r.segredoDoador, s.emProducao) },
  });
}

export default function Mandar({ loaderData: d, actionData }: Route.ComponentProps) {
  const erros: Erros = actionData?.erros ?? {};
  const valores = actionData?.valores;
  const navegando = useNavigation().state !== "idle";
  const [valorSel, setValorSel] = useState<string>(valores?.valor && !SUGESTOES.includes(interpretarReais(valores.valor) ?? -1) ? "outro" : (valores?.valor ?? "5"));
  const [valorOutro, setValorOutro] = useState(valorSel === "outro" ? (valores?.valor ?? "") : "");
  const [mensagem, setMensagem] = useState(valores?.mensagem ?? "");

  const centavos = interpretarReais(valorSel === "outro" ? valorOutro : valorSel) ?? 0;
  const { taxa, liquido } = calcularTaxa(centavos, d.taxaBp);
  const nome = nomeAnonimo(d.recebedor.numeroPublico);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
      <div>
        <h1 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Pix para {nome}</h1>
        <p className="mt-2 mb-7 text-cinza">Você não sabe quem é. A pessoa não vai saber quem você é. É assim mesmo.</p>

        <Form method="post" noValidate>
          {erros.formulario && (
            <p role="alert" className="mb-5 border-2 border-carimbo bg-aviso-fundo p-3 text-[14px]">
              {erros.formulario}
            </p>
          )}
          {erros.recebedor && (
            <p role="alert" className="mb-5 border-2 border-carimbo bg-aviso-fundo p-3 text-[14px]">
              {erros.recebedor}
            </p>
          )}

          <fieldset className="mb-5">
            <legend className="mb-1.5 block font-bold">Quanto</legend>
            <div className="flex flex-wrap gap-2">
              {d.sugestoes.map((c) => {
                const v = String(c / 100);
                const on = valorSel === v;
                return (
                  <label
                    key={c}
                    className={`cursor-pointer rounded-md border-2 border-tinta px-3.5 py-2 font-bold transition-colors ${on ? "bg-tinta text-papel" : "hover:bg-tinta/5"}`}
                  >
                    <input type="radio" name="valor" value={v} checked={on} onChange={() => setValorSel(v)} className="sr-only" />
                    {formatarReais(c).replace(",00", "")}
                  </label>
                );
              })}
              <label
                className={`cursor-pointer rounded-md border-2 border-tinta px-3.5 py-2 font-bold transition-colors ${valorSel === "outro" ? "bg-tinta text-papel" : "hover:bg-tinta/5"}`}
              >
                <input type="radio" name="valor" value="outro" checked={valorSel === "outro"} onChange={() => setValorSel("outro")} className="sr-only" />
                outro valor
              </label>
            </div>
            {valorSel === "outro" && (
              <input
                name="valor_outro"
                inputMode="decimal"
                autoFocus
                value={valorOutro}
                onChange={(e) => setValorOutro(e.target.value)}
                placeholder="12,50"
                aria-invalid={Boolean(erros.valor)}
                className={`${classeInput} mt-2 max-w-[160px]`}
              />
            )}
            <p className={`mt-1.5 text-[13px] ${erros.valor ? "text-carimbo" : "text-cinza"}`} role={erros.valor ? "alert" : undefined}>
              {erros.valor ?? `mínimo ${formatarReais(d.minimoCentavos)} · máximo ${formatarReais(d.maximoCentavos)}`}
            </p>
          </fieldset>

          <Campo
            rotulo="Mensagenzinha"
            htmlFor="mensagem"
            opcional
            erro={erros.mensagem}
            dica={`${mensagem.length}/${MENSAGEM_MAX} · aparece na lista pública e para quem recebe · sem link, sem telefone`}
          >
            <textarea
              id="mensagem"
              name="mensagem"
              rows={2}
              maxLength={MENSAGEM_MAX + 20}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="toma, compra um pastel"
              aria-invalid={Boolean(erros.mensagem)}
              className={classeInput}
            />
          </Campo>

          <Campo
            rotulo="Seu apelido no ranking"
            htmlFor="apelido"
            opcional
            erro={erros.apelido}
            dica='em branco = "anônimo". Para somar seus Pix no mesmo apelido, confirmamos por e-mail depois do pagamento.'
          >
            <input
              id="apelido"
              name="apelido"
              defaultValue={valores?.apelido ?? ""}
              autoComplete="off"
              spellCheck={false}
              placeholder="pastel_de_vento"
              aria-invalid={Boolean(erros.apelido)}
              className={classeInput}
            />
          </Campo>

          <dl className="mb-5 text-[14px]">
            <div className="linha-pontilhada flex justify-between py-2">
              <dt>Pix sem motivo</dt>
              <dd>{formatarReais(centavos)}</dd>
            </div>
            <div className="linha-pontilhada flex justify-between py-2 text-cinza">
              <dt>fica com a plataforma ({formatarBp(d.taxaBp)})</dt>
              <dd>{formatarReais(taxa)}</dd>
            </div>
            <div className="flex justify-between py-2 font-bold">
              <dt>chega para {nome}</dt>
              <dd>{formatarReais(liquido)}</dd>
            </div>
          </dl>

          <Botao variante="primario" type="submit" disabled={navegando}>
            {navegando ? "Indo para o pagamento…" : `Pagar ${formatarReais(centavos)} no Mercado Pago`}
          </Botao>
          <p className="mt-2.5 text-[13px] text-cinza">
            Pix ou saldo Mercado Pago. Na sua fatura aparece “{DESCRITOR_FATURA}”. Nada de quem recebeu.
          </p>
        </Form>
      </div>

      <aside className="flex flex-col gap-6">
        <div className="border-2 border-tinta p-5 text-[14px]">
          <h2 className="mb-2 font-titulo text-lg font-bold">{nome}</h2>
          <div className="linha-pontilhada py-1.5">
            <span className="text-cinza">recebeu</span>
            <br />
            <b>
              {formatarReais(d.recebedor.totalRecebidoCentavos)} em {d.recebedor.quantidadePix === 1 ? "1 pix" : `${d.recebedor.quantidadePix} pix`}
            </b>
          </div>
          <div className="linha-pontilhada py-1.5">
            <span className="text-cinza">última mensagem</span>
            <br />
            {d.recebedor.ultimaMensagem ? <i>“{d.recebedor.ultimaMensagem.texto}”</i> : <span>nenhuma ainda</span>}
          </div>
          <div className="py-1.5">
            <span className="text-cinza">na roda</span>
            <br />
            {tempoRelativo(new Date(d.recebedor.criadoEm), new Date(d.agora))}
          </div>
          <div className="pt-1.5">
            <span className="text-cinza">repasse</span>
            <br />
            {d.gatilhoRepasse === "imediato" ? "assim que o pagamento confirmar" : "uma vez por dia, somando o que chegou"}
          </div>
        </div>
        <Carimbo texto="SEM MOTIVO" tom="vermelho" className="self-start" />
      </aside>
    </div>
  );
}
