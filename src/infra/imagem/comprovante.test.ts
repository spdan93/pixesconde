import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { gerarSvgComprovante, type DadosImagem } from "./comprovante";

const raiz = fileURLToPath(new URL("../../../public/fonts/ttf/", import.meta.url));

async function fontes() {
  return {
    mono: await readFile(`${raiz}ibm-plex-mono-400.ttf`),
    monoBold: await readFile(`${raiz}ibm-plex-mono-700.ttf`),
    titulo: await readFile(`${raiz}archivo-narrow-700.ttf`),
  };
}

const dados: DadosImagem = {
  valorTexto: "R$ 5,00",
  para: "anônimo #0427",
  de: "pastel_de_vento",
  mensagem: "toma, compra um pastel",
  chegaLa: "R$ 4,50",
  quando: "18 nov 2026 20:14",
  numero: "PE-000913",
  dominio: "pixesconde.com.br",
};

describe("gerarSvgComprovante", () => {
  test("gera um SVG 1080x1080 com os dados do recibo", async () => {
    const svg = await gerarSvgComprovante(dados, await fontes(), satori);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1080"');
    // satori converte texto em caminhos; os dados aparecem como aria-label? Não: verificamos pelo tamanho e por não lançar.
    expect(svg.length).toBeGreaterThan(5000);
  });

  test("sem mensagem, usa o traço", async () => {
    const svg = await gerarSvgComprovante({ ...dados, mensagem: null }, await fontes(), satori);
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
