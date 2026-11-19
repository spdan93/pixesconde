import { Link } from "react-router";
import type { Route } from "./+types/como-funciona";
import { servicosContext } from "~/contexto.server";
import { calcularTaxa } from "@/domain/dinheiro";
import { formatarBp, formatarReais } from "~/util/formatos";
import { Botao } from "~/componentes/Botao";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "como funciona — pix esconde" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const cfg = await context.get(servicosContext).config();
  const exemplo = calcularTaxa(cfg.minimoCentavos, cfg.taxaBp);
  return {
    taxaTexto: formatarBp(cfg.taxaBp),
    minimo: formatarReais(cfg.minimoCentavos),
    maximo: formatarReais(cfg.maximoCentavos),
    exemploTaxa: formatarReais(exemplo.taxa),
    exemploLiquido: formatarReais(exemplo.liquido),
    repasse: cfg.gatilhoRepasse,
  };
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="linha-pontilhada py-6">
      <h2 className="font-titulo text-2xl font-bold">{titulo}</h2>
      <div className="mt-2 max-w-2xl space-y-2 text-[15px]">{children}</div>
    </section>
  );
}

export default function ComoFunciona({ loaderData: d }: Route.ComponentProps) {
  return (
    <>
      <h1 className="font-titulo text-4xl font-bold leading-none tracking-tight">Como funciona</h1>
      <p className="mt-3 max-w-2xl text-cinza">
        Em uma frase: você manda um Pix para uma pessoa que não conhece, sem motivo, e ela recebe sem saber de quem veio.
        O resto é detalhe. Aqui estão os detalhes.
      </p>

      <Bloco titulo="O que é">
        <p>
          Uma lista de chaves Pix anônimas. Você escolhe uma, ou deixa a gente sortear, e manda de {d.minimo} a {d.maximo}
          . Pode escrever uma mensagenzinha. Não tem causa, não tem meta, não tem história triste. É só acaso.
        </p>
      </Bloco>

      <Bloco titulo="A taxa">
        <p>
          A plataforma fica com <b>{d.taxaTexto}</b> de cada Pix. Isso aparece na tela antes de você pagar, sempre. Num Pix de{" "}
          {d.minimo}, {d.exemploTaxa} ficam aqui e {d.exemploLiquido} chegam lá. As tarifas do Mercado Pago saem da nossa
          parte, nunca da parte de quem recebe.
        </p>
      </Bloco>

      <Bloco titulo="O caminho do dinheiro">
        <p>
          Você paga pelo Mercado Pago (Pix ou saldo). O dinheiro entra na conta da plataforma e sai de lá para a chave de
          quem recebe
          {d.repasse === "imediato" ? " assim que o pagamento confirma" : ", uma vez por dia, somando tudo que chegou para aquela chave"}
          . Quem recebe vê um Pix de “PIX ESCONDE”. Na sua fatura aparece “PIXESCONDE”. Nenhum dos dois vê o outro.
        </p>
      </Bloco>

      <Bloco titulo="Anonimato">
        <p>
          Só aceitamos chave Pix aleatória, porque CPF, e-mail e telefone dizem quem você é. A chave nunca aparece em
          lugar nenhum: na lista você é “anônimo #0427”. Quem manda aparece por um apelido que escolheu, ou como
          “anônimo”. A mensagem vai pela plataforma, não pelo Pix.
        </p>
      </Bloco>

      <Bloco titulo="O ranking">
        <p>
          Conta só Pix confirmado. Para o seu apelido somar entre doações, a gente pede um e-mail depois do pagamento,
          uma vez, só para provar que o apelido é seu. O e-mail não aparece para ninguém.
        </p>
      </Bloco>

      <Bloco titulo="O que a gente não faz">
        <p>Não guardamos cartão, não pedimos CPF, não vendemos nada, não mandamos e-mail que você não pediu.</p>
        <p>
          Se a chave de alguém não existir mais quando formos pagar, o dinheiro fica guardado. A pessoa pode trocar a
          chave pelo link secreto dela. Se não trocar em 30 dias, devolvemos para quem mandou.
        </p>
      </Bloco>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Botao variante="primario" href="/sortear">
          Sortear uma chave
        </Botao>
        <Botao variante="contorno" href="/cadastrar">
          Colocar minha chave na roda
        </Botao>
      </div>
      <p className="mt-4 text-[12px] text-cinza">
        Dúvida que não está aqui?{" "}
        <Link to="/" className="link">
          Volta pra home
        </Link>{" "}
        e manda um Pix mesmo assim.
      </p>
    </>
  );
}
