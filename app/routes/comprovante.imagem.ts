import type { Route } from "./+types/comprovante.imagem";
import { cloudflareContext, servicosContext } from "~/contexto.server";
import { formatarReais } from "@/domain/dinheiro";
import { gerarSvgComprovante, type FontesImagem, type MotorSatori } from "@/infra/imagem/comprovante";
import { dataHora, nomeAnonimo, numeroComprovante } from "~/util/formatos";

// Tudo que é WASM (Yoga para o satori, resvg para o PNG) é carregado uma vez por isolate.
let fontesCache: Promise<FontesImagem> | null = null;
let motorCache: Promise<MotorSatori> | null = null;
let resvgCache: Promise<typeof import("@resvg/resvg-wasm") | null> | null = null;

async function carregarFontes(assets: Fetcher, base: string): Promise<FontesImagem> {
  const ler = async (caminho: string) => {
    const r = await assets.fetch(new URL(caminho, base));
    if (!r.ok) throw new Error(`fonte não encontrada: ${caminho}`);
    return r.arrayBuffer();
  };
  const [mono, monoBold, titulo] = await Promise.all([
    ler("/fonts/ttf/ibm-plex-mono-400.ttf"),
    ler("/fonts/ttf/ibm-plex-mono-700.ttf"),
    ler("/fonts/ttf/archivo-narrow-700.ttf"),
  ]);
  return { mono, monoBold, titulo };
}

/**
 * satori no Worker. Versão pinada em 0.15.x de propósito: é a última linha com a entrada
 * `satori/wasm`, que recebe o Yoga já inicializado a partir de um módulo WebAssembly importado
 * pelo bundler. As versões novas embutem WASM em base64 e compilam no load, o que workerd proíbe
 * ("Wasm code generation disallowed by embedder"). Mesma receita do pacote workers-og.
 */
async function carregarMotor(): Promise<MotorSatori> {
  const [{ default: satori, init }, { default: initYoga }, { default: yogaWasm }] = await Promise.all([
    import("satori/wasm"),
    import("yoga-wasm-web"),
    import("yoga-wasm-web/dist/yoga.wasm"),
  ]);
  init(await initYoga(yogaWasm as unknown as WebAssembly.Module));
  return satori as unknown as MotorSatori;
}

/** resvg (WASM) para virar PNG. Se não der, a rota serve SVG. */
async function carregarResvg() {
  try {
    const [{ default: wasm }, resvg] = await Promise.all([import("@resvg/resvg-wasm/index_bg.wasm"), import("@resvg/resvg-wasm")]);
    try {
      await resvg.initWasm(wasm as unknown as WebAssembly.Module);
    } catch (erro) {
      // Em dev, o HMR recria este módulo mas o resvg continua inicializado no isolate: segue o jogo.
      if (!(erro instanceof Error && /already initialized/i.test(erro.message))) throw erro;
    }
    return resvg;
  } catch (erro) {
    console.error("[imagem] resvg indisponível, servindo SVG:", erro);
    return null;
  }
}

/** GET /comprovante/:id/imagem.png — a imagem para compartilhar. Só existe para doação confirmada. */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const s = context.get(servicosContext);
  const { env } = context.get(cloudflareContext);
  const c = await s.doacoes.buscarComprovante(params.id);
  if (!c || c.status !== "confirmada") throw new Response("sem imagem para isso", { status: 404 });

  fontesCache ??= carregarFontes(env.ASSETS, request.url).catch((e) => {
    fontesCache = null;
    throw e;
  });
  motorCache ??= carregarMotor().catch((e) => {
    motorCache = null;
    throw e;
  });
  resvgCache ??= carregarResvg();
  const [fontes, motor, resvg] = await Promise.all([fontesCache, motorCache, resvgCache]);

  const svg = await gerarSvgComprovante(
    {
      valorTexto: formatarReais(c.valorCentavos),
      para: nomeAnonimo(c.numeroPublico),
      de: c.apelidoTexto ?? "anônimo",
      mensagem: c.mensagemOculta ? null : c.mensagem,
      chegaLa: formatarReais(c.liquidoCentavos),
      quando: dataHora(new Date(c.confirmadaEm ?? c.criadaEm)),
      numero: numeroComprovante(c.numeroComprovante),
      dominio: new URL(s.urlPublica).host,
    },
    fontes,
    motor,
  );

  // Conteúdo mutável (denúncia oculta a mensagem; estorno muda o estado): cache curto, nunca "immutable".
  const cache = "public, max-age=300";
  if (resvg) {
    const png = new resvg.Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
    return new Response(png as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": cache,
        "Content-Disposition": `inline; filename="pix-sem-motivo-${numeroComprovante(c.numeroComprovante)}.png"`,
      },
    });
  }
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": cache } });
}
