export type MotivoChave = "formato" | "cpf" | "cnpj" | "email" | "telefone";

export type ResultadoChave = { ok: true; chave: string } | { ok: false; motivo: MotivoChave };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const CPF = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const CNPJ = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONE = /^\+?\d{10,13}$/;
const CELULAR = /^(?:\+?55)?[1-9]\d9\d{8}$/;

/**
 * Só chave Pix aleatória (EVP, formato UUID). Normaliza espaços, caixa e
 * aceita os 32 hex sem hífens. Qualquer coisa que identifique a pessoa
 * (CPF, CNPJ, e-mail, telefone) é recusada com o motivo.
 */
export function validarChaveAleatoria(entrada: string): ResultadoChave {
  const texto = entrada.trim().toLowerCase();
  if (UUID.test(texto)) return { ok: true, chave: texto };
  if (HEX32.test(texto)) {
    return {
      ok: true,
      chave: `${texto.slice(0, 8)}-${texto.slice(8, 12)}-${texto.slice(12, 16)}-${texto.slice(16, 20)}-${texto.slice(20)}`,
    };
  }
  const soDigitos = texto.replace(/[\s()\-.]/g, "");
  // 11 dígitos com o nono dígito 9 (celular com DDD) é telefone; os outros 11 dígitos, CPF.
  if (CELULAR.test(soDigitos)) return { ok: false, motivo: "telefone" };
  if (CPF.test(texto)) return { ok: false, motivo: "cpf" };
  if (CNPJ.test(texto)) return { ok: false, motivo: "cnpj" };
  if (EMAIL.test(texto)) return { ok: false, motivo: "email" };
  if (TELEFONE.test(soDigitos)) return { ok: false, motivo: "telefone" };
  return { ok: false, motivo: "formato" };
}

export function mascararChave(chave: string): string {
  const partes = chave.split("-");
  if (partes.length !== 5) return "••••";
  return `${partes[0]}-••••-••••-••••-${partes[4]}`;
}

const MENSAGENS: Record<MotivoChave, string> = {
  formato:
    "Isso não parece uma chave aleatória. Ela tem 32 caracteres com traços, do jeito que o banco mostra.",
  cpf: "Aqui entra só chave aleatória; CPF, e-mail e telefone dizem quem você é.",
  cnpj: "Aqui entra só chave aleatória; CNPJ, e-mail e telefone dizem quem você é.",
  email: "Aqui entra só chave aleatória; CPF, e-mail e telefone dizem quem você é.",
  telefone: "Aqui entra só chave aleatória; CPF, e-mail e telefone dizem quem você é.",
};

export function mensagemRecusa(motivo: MotivoChave): string {
  return MENSAGENS[motivo];
}
