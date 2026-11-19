/**
 * Dinheiro sempre em centavos inteiros. Percentuais em basis points (10% = 1000).
 */

export function calcularTaxa(valorCentavos: number, taxaBp: number): { taxa: number; liquido: number } {
  const taxa = Math.round((valorCentavos * taxaBp) / 10_000);
  return { taxa, liquido: valorCentavos - taxa };
}

export function formatarReais(centavos: number): string {
  const negativo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const resto = String(abs % 100).padStart(2, "0");
  const milhar = reais.toLocaleString("pt-BR");
  return `${negativo}R$ ${milhar},${resto}`;
}

export function formatarBp(bp: number): string {
  const pct = bp / 100;
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

const PADRAO_REAIS = /^\s*(?:R\$)?\s*(\d{1,6})(?:[.,](\d{1,2}))?\s*$/;

/** Interpreta texto como gente digita ("5", "5,00", "R$ 10", "10.5"). Devolve centavos ou null. */
export function interpretarReais(texto: string): number | null {
  const m = PADRAO_REAIS.exec(texto);
  if (!m) return null;
  const reais = Number(m[1]);
  const centavos = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return reais * 100 + centavos;
}
