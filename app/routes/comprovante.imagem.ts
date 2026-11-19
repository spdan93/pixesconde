import type { Route } from "./+types/comprovante.imagem";
import { cloudflareContext, servicosContext } from "~/contexto.server";
import { formatarReais } from "@/domain/dinheiro";
import { gerarSvgComprovante, type FontesImagem } from "@/infra/imagem/comprovante";
import { dataHora, nomeAnonimo, numeroComprovante } from "~/util/formatos";

let fontesCache: Promise<FontesImagem> | null = null;
let resvgPronto: Promise<typeof import("@resvg/resvg-wasm") | null> | null = null;

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

/** Inicializa o resvg (WASM) uma vez por isolate. Se não der, a rota serve SVG. */
async function carregarResvg() {
  if (!resvgPronto) {
    resvgPronto = (async () => {
      try {
        const [{ default: wasm }, resvg] = await Promise.all([
          import("@resvg/resvg-wasm/index_bg.wasm"),
          import("@resvg/resvg-wasm"),
        ]);
        await resvg.initWasm(wasm as unknown as WebAssembly.Module);
        return resvg;
      } catch (erro) {
        console.error("[imagem] resvg indisponível, servindo SVG:", erro);
        return null;
      }
    })();
  }
  return resvgPronto;
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
  const fontes = await fontesCache;
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
  );

  const cache = "public, max-age=31536000, immutable";
  const resvg = await carregarResvg();
  if (resvg) {
    const png = new resvg.Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
    return new Response(png as unknown as BodyInit, {
      headers: { "Content-Type": "image/png", "Cache-Control": cache, "Content-Disposition": `inline; filename="pix-sem-motivo-${numeroComprovante(c.numeroComprovante)}.png"` },
    });
  }
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": cache } });
}
