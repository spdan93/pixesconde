export const COOKIE_APELIDO = "pe_apelido";

export function lerCookie(request: Request, nome: string): string | null {
  const cabecalho = request.headers.get("Cookie");
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function serializar(nome: string, valor: string, opts: { maxAge: number; path: string; seguro: boolean }): string {
  const partes = [
    `${nome}=${encodeURIComponent(valor)}`,
    `Max-Age=${opts.maxAge}`,
    `Path=${opts.path}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.seguro) partes.push("Secure");
  return partes.join("; ");
}

/** Prova de autoria do doador: só vai para a página daquele comprovante, vale 7 dias. */
export function cookieDoador(doacaoId: string, segredo: string, seguro: boolean): string {
  return serializar(`pe_doador_${doacaoId}`, segredo, { maxAge: 7 * 24 * 3600, path: `/comprovante/${doacaoId}`, seguro });
}

export function nomeCookieDoador(doacaoId: string): string {
  return `pe_doador_${doacaoId}`;
}

/** Dono de apelido confirmado: vale um ano, no site todo. */
export function cookieApelido(valorAssinado: string, seguro: boolean): string {
  return serializar(COOKIE_APELIDO, valorAssinado, { maxAge: 365 * 24 * 3600, path: "/", seguro });
}
