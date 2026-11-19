import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/cadastrar";
import { servicosContext } from "~/contexto.server";
import { mensagemRecusa } from "@/domain/chaves/validar-chave";
import { ipDaRequisicao, permitir } from "@/infra/limites";
import { formatarBp } from "~/util/formatos";
import { Botao } from "~/componentes/Botao";
import { Campo, classeInput } from "~/componentes/Campo";

export const MENSAGEM_DUPLICADA = "Essa chave já está na roda. Se é sua e você perdeu o link, não temos como recuperar: cadastre outra chave aleatória.";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "colocar minha chave na roda — pix esconde" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const cfg = await context.get(servicosContext).config();
  const rodaVazia = new URL(request.url).searchParams.get("motivo") === "vazio";
  return { taxaTexto: formatarBp(cfg.taxaBp), gatilhoRepasse: cfg.gatilhoRepasse, rodaVazia };
}

export async function action({ request, context }: Route.ActionArgs) {
  const s = context.get(servicosContext);
  const form = await request.formData();
  const chave = String(form.get("chave") ?? "");
  const ip = ipDaRequisicao(request);

  if (!(await permitir(s.db, `cadastro:${ip}`, 24 * 60, 10))) {
    return data({ erro: "Muitas chaves desse endereço hoje. Volta amanhã.", chave }, { status: 429 });
  }
  if (!(await s.provedores.captcha.verificar(form.get("cf-turnstile-response") as string | null, ip))) {
    return data({ erro: "Não conseguimos confirmar que você não é um robô. Recarrega e tenta de novo.", chave }, { status: 400 });
  }

  const r = await s.recebedores.cadastrar(chave);
  if (!r.ok) {
    return data({ erro: r.motivo === "duplicada" ? MENSAGEM_DUPLICADA : mensagemRecusa(r.motivo), chave }, { status: 400 });
  }
  return redirect(`/k/${r.token}?nova=1`);
}

export default function Cadastrar({ loaderData: d, actionData }: Route.ComponentProps) {
  const navegando = useNavigation().state !== "idle";
  return (
    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
      <div>
        {d.rodaVazia && (
          <p className="mb-5 border-2 border-tinta p-3 text-[14px]">
            Ninguém na roda ainda. O sorteio não tem o que sortear. Alguém tem que ser o primeiro.
          </p>
        )}
        <h1 className="font-titulo text-[34px] font-bold leading-none tracking-tight">Coloque sua chave na roda</h1>
        <p className="mt-2 mb-7 text-cinza">
          Só chave aleatória. Nada de CPF, e-mail ou telefone: esses dizem quem você é, e aqui ninguém é ninguém.
        </p>

        <Form method="post" noValidate>
          <Campo
            rotulo="Sua chave Pix aleatória"
            htmlFor="chave"
            erro={actionData?.erro ?? null}
            dica="32 caracteres com traços, do jeito que o banco mostra. Se tentar outro tipo, recusamos na hora."
          >
            <input
              id="chave"
              name="chave"
              defaultValue={actionData?.chave ?? ""}
              autoComplete="off"
              spellCheck={false}
              placeholder="7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93"
              aria-invalid={Boolean(actionData?.erro)}
              className={`${classeInput} font-mono`}
            />
          </Campo>

          <div className="mb-5">
            <p className="mb-1.5 font-bold">Como funciona o repasse</p>
            <div className="border-2 border-tinta p-4 text-[14px]">
              <p className="linha-pontilhada py-1.5">
                {d.gatilhoRepasse === "imediato"
                  ? "Cada Pix que chega sai na hora para a sua chave, de “PIX ESCONDE”."
                  : "Uma vez por dia somamos o que chegou pra você e mandamos um Pix só, de “PIX ESCONDE”."}
              </p>
              <p className="linha-pontilhada py-1.5">Ficamos com {d.taxaTexto} de cada Pix. Está escrito pra quem manda também.</p>
              <p className="py-1.5">As mensagens você lê no seu link secreto. No Pix não vai nada.</p>
            </div>
          </div>

          <Botao variante="primario" type="submit" disabled={navegando}>
            {navegando ? "Cadastrando…" : "Cadastrar chave"}
          </Botao>
          <p className="mt-2.5 text-[13px] text-cinza">Sem e-mail, sem senha. O que você ganha é um link. Não perca.</p>
        </Form>
      </div>

      <aside className="border-2 border-carimbo bg-aviso-fundo p-4 text-[14px]">
        <p className="font-bold">Antes que você pergunte</p>
        <p className="linha-pontilhada py-2">— A chave não aparece pra ninguém. Na lista você é “anônimo #0000”, com o seu número.</p>
        <p className="linha-pontilhada py-2">
          — A gente valida a chave no primeiro repasse. Se o banco recusar, o dinheiro fica guardado e seu link avisa.
        </p>
        <p className="py-2">— Pode pausar ou tirar a chave da roda quando quiser, pelo mesmo link.</p>
      </aside>
    </div>
  );
}
