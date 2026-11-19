/** Mesma resposta, marcada para nenhum buscador indexar. Usada enquanto o site é demonstração. */
export function semIndexacao(resposta: Response): Response {
  const headers = new Headers(resposta.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers });
}
