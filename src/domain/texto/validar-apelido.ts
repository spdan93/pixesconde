export type ResultadoApelido =
  | { ok: true; apelido: string | null }
  | { ok: false; motivo: "formato" | "reservado" };

export const APELIDO_PADRAO = /^[a-z0-9_]{3,24}$/;
const RESERVADOS = new Set(["anonimo", "anonima", "pixesconde", "pix_esconde", "admin"]);

/** Apelido público do doador. Vazio = anônimo. */
export function validarApelido(entrada: string): ResultadoApelido {
  const apelido = entrada.trim().toLowerCase();
  if (apelido === "") return { ok: true, apelido: null };
  if (!APELIDO_PADRAO.test(apelido)) return { ok: false, motivo: "formato" };
  if (RESERVADOS.has(apelido)) return { ok: false, motivo: "reservado" };
  return { ok: true, apelido };
}

export function mensagemRecusaApelido(motivo: "formato" | "reservado"): string {
  return motivo === "formato"
    ? "De 3 a 24 caracteres: letras minúsculas, números e _. Sem acento, sem espaço."
    : "Esse apelido é da casa. Escolhe outro.";
}
