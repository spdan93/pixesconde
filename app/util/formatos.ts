export { formatarBp, formatarReais } from "@/domain/dinheiro";

/** "anônimo #0427" */
export function nomeAnonimo(numeroPublico: number): string {
  return `anônimo #${String(numeroPublico).padStart(4, "0")}`;
}

/** "PE-000913" */
export function numeroComprovante(n: number): string {
  return `PE-${String(n).padStart(6, "0")}`;
}

const UNIDADES: [number, string, string][] = [
  [60, "minuto", "minutos"],
  [24, "hora", "horas"],
  [30, "dia", "dias"],
  [12, "mês", "meses"],
];

/** "agora", "há 5 minutos", "ontem", "há 12 dias". */
export function tempoRelativo(data: Date, agora: Date = new Date()): string {
  let valor = Math.max(0, Math.round((agora.getTime() - data.getTime()) / 60_000));
  if (valor < 1) return "agora";
  let i = 0;
  while (i < UNIDADES.length - 1 && valor >= UNIDADES[i]![0]) {
    valor = Math.floor(valor / UNIDADES[i]![0]);
    i++;
  }
  if (i === 2 && valor === 1) return "ontem";
  const [, singular, plural] = UNIDADES[i]!;
  if (i === UNIDADES.length - 1 && valor >= 12) {
    const anos = Math.floor(valor / 12);
    return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
  }
  return `há ${valor} ${valor === 1 ? singular : plural}`;
}

export function dataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
    .format(data)
    .replace(/\./g, "")
    .replace(",", "");
}
