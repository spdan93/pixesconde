export type ResultadoMensagem =
  | { ok: true; mensagem: string | null }
  | { ok: false; motivo: "tamanho" | "link" | "contato" | "bloqueada" };

export const MENSAGEM_MAX = 140;

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|me|io|app|link)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
const MUITOS_DIGITOS = /(?:\d[\s.\-()]*){10,}/;

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Mensagenzinha pública: texto puro, até 140 caracteres, sem link, sem
 * contato (e-mail, telefone, CPF) e sem palavras da lista bloqueada.
 */
export function validarMensagem(entrada: string, bloqueadas: string[]): ResultadoMensagem {
  const mensagem = entrada.trim().replace(/\s+/g, " ");
  if (mensagem === "") return { ok: true, mensagem: null };
  if (mensagem.length > MENSAGEM_MAX) return { ok: false, motivo: "tamanho" };
  if (EMAIL.test(mensagem) || CPF.test(mensagem) || MUITOS_DIGITOS.test(mensagem)) {
    return { ok: false, motivo: "contato" };
  }
  if (LINK.test(mensagem)) return { ok: false, motivo: "link" };
  const palavras = semAcento(mensagem.toLowerCase()).split(/[^a-z0-9_]+/);
  const lista = new Set(bloqueadas.map((p) => semAcento(p.toLowerCase())));
  if (palavras.some((p) => lista.has(p))) return { ok: false, motivo: "bloqueada" };
  return { ok: true, mensagem };
}

export function mensagemRecusaMensagem(motivo: Exclude<ResultadoMensagem, { ok: true }>["motivo"]): string {
  switch (motivo) {
    case "tamanho":
      return `Até ${MENSAGEM_MAX} caracteres. É uma mensagenzinha, não uma carta.`;
    case "link":
      return "Sem link. Aqui ninguém vende nada.";
    case "contato":
      return "Sem telefone, e-mail ou CPF. Isso identificaria alguém, e aqui ninguém é ninguém.";
    case "bloqueada":
      return "Essa palavra não passa. Tenta de outro jeito.";
  }
}
