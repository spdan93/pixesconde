import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import { apelidos, denuncias, doacoes, tokensMagicos } from "@/infra/db/schema";
import type { Provedores } from "@/providers";
import { assinarCookie, cifrar, gerarToken, hmacHex, sha256Hex, verificarCookie } from "@/infra/crypto";

export const VALIDADE_TOKEN_MIN = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PREFIXO_COOKIE = "apelido:";

export type ResultadoVinculo =
  | { ok: true }
  | {
      ok: false;
      motivo: "nao_e_o_doador" | "sem_apelido" | "apelido_de_outro" | "email_invalido" | "email_ja_tem_apelido" | "doacao_nao_confirmada";
    };

export type ResultadoConfirmacao = { ok: true; apelidoId: string; nome: string; cookie: string } | { ok: false };

export interface ServicoApelidos {
  /** O segredo do doador é entregue só ao navegador que criou a doação (cookie). Sem ele, ninguém vincula. */
  solicitarVinculo(i: { doacaoId: string; email: string; segredoDoador: string | null }): Promise<ResultadoVinculo>;
  ehODoador(doacaoId: string, segredoDoador: string | null): Promise<boolean>;
  confirmarToken(token: string): Promise<ResultadoConfirmacao>;
  apelidoIdDoCookie(valorCookie: string | null): Promise<string | null>;
  denunciar(doacaoId: string, motivo: string | null): Promise<void>;
}

export type DepsApelidos = {
  db: Db;
  provedores: Pick<Provedores, "email">;
  segredos: { chaveCifra: string; segredoHmac: string; segredoCookie: string };
  urlPublica: string;
  agora?: () => Date;
};

export function mensagemRecusaVinculo(motivo: Exclude<ResultadoVinculo, { ok: true }>["motivo"]): string {
  switch (motivo) {
    case "nao_e_o_doador":
      return "Só quem mandou esse Pix, no mesmo navegador, pode vincular o apelido.";
    case "sem_apelido":
      return "Esse Pix foi anônimo. Não tem apelido para vincular.";
    case "doacao_nao_confirmada":
      return "Esse Pix ainda não foi confirmado. Espera um pouco.";
    case "apelido_de_outro":
      return "Esse apelido já tem dono, e o e-mail não bate.";
    case "email_invalido":
      return "Isso não parece um e-mail.";
    case "email_ja_tem_apelido":
      return "Esse e-mail já é dono de outro apelido. Um e-mail, um apelido.";
  }
}

export function criarServicoApelidos(deps: DepsApelidos): ServicoApelidos {
  const { db, provedores, segredos, urlPublica } = deps;
  const agora = deps.agora ?? (() => new Date());

  async function ehODoador(doacaoId: string, segredoDoador: string | null): Promise<boolean> {
    if (!segredoDoador) return false;
    const [d] = await db.select({ hash: doacoes.segredoDoadorHash }).from(doacoes).where(eq(doacoes.id, doacaoId)).limit(1);
    if (!d?.hash) return false;
    return (await sha256Hex(segredoDoador)) === d.hash;
  }

  return {
    ehODoador,

    async solicitarVinculo({ doacaoId, email: emailBruto, segredoDoador }) {
      if (!(await ehODoador(doacaoId, segredoDoador))) return { ok: false, motivo: "nao_e_o_doador" };
      const [doacao] = await db.select().from(doacoes).where(eq(doacoes.id, doacaoId)).limit(1);
      if (!doacao || !doacao.apelidoTexto) return { ok: false, motivo: "sem_apelido" };
      if (doacao.status !== "confirmada") return { ok: false, motivo: "doacao_nao_confirmada" };
      const email = emailBruto.trim().toLowerCase();
      if (!EMAIL.test(email)) return { ok: false, motivo: "email_invalido" };

      const emailHash = await hmacHex(email, segredos.segredoHmac);
      const nome = doacao.apelidoTexto;
      let [apelido] = await db.select().from(apelidos).where(eq(apelidos.nome, nome)).limit(1);
      if (apelido && apelido.emailHash !== emailHash) return { ok: false, motivo: "apelido_de_outro" };
      if (!apelido) {
        const [mesmoEmail] = await db.select({ id: apelidos.id }).from(apelidos).where(eq(apelidos.emailHash, emailHash)).limit(1);
        if (mesmoEmail) return { ok: false, motivo: "email_ja_tem_apelido" };
        [apelido] = await db
          .insert(apelidos)
          .values({ nome, emailHash, emailCifrado: await cifrar(email, segredos.chaveCifra), criadoEm: agora() })
          .returning();
      }

      const token = gerarToken();
      await db.insert(tokensMagicos).values({
        apelidoId: apelido!.id,
        doacaoId,
        tokenHash: await sha256Hex(token),
        expiraEm: new Date(agora().getTime() + VALIDADE_TOKEN_MIN * 60_000),
        criadoEm: agora(),
      });
      const url = `${urlPublica}/apelido/confirmar/${token}`;
      await provedores.email.enviar({
        para: email,
        assunto: `pix esconde: confirme o apelido ${nome}`,
        texto: `Alguém (você, esperamos) quer que um Pix sem motivo conte no ranking como "${nome}".\n\nConfirme aqui, vale por ${VALIDADE_TOKEN_MIN} minutos:\n${url}\n\nSe não foi você, ignore. Nada acontece.`,
        html: `<p>Alguém (você, esperamos) quer que um Pix sem motivo conte no ranking como <strong>${nome}</strong>.</p><p><a href="${url}">Confirmar apelido</a> (vale por ${VALIDADE_TOKEN_MIN} minutos)</p><p>Se não foi você, ignore. Nada acontece.</p>`,
      });
      return { ok: true };
    },

    async confirmarToken(token) {
      const tokenHash = await sha256Hex(token);
      const [t] = await db
        .select()
        .from(tokensMagicos)
        .where(and(eq(tokensMagicos.tokenHash, tokenHash), isNull(tokensMagicos.usadoEm), gt(tokensMagicos.expiraEm, agora())))
        .limit(1);
      if (!t) return { ok: false };
      const usado = await db
        .update(tokensMagicos)
        .set({ usadoEm: agora() })
        .where(and(eq(tokensMagicos.id, t.id), isNull(tokensMagicos.usadoEm)))
        .returning({ id: tokensMagicos.id });
      if (usado.length === 0) return { ok: false };

      const [apelido] = await db.select().from(apelidos).where(eq(apelidos.id, t.apelidoId)).limit(1);
      if (!apelido) return { ok: false };
      if (!apelido.confirmadoEm) {
        await db.update(apelidos).set({ confirmadoEm: agora() }).where(eq(apelidos.id, apelido.id));
      }
      if (t.doacaoId) {
        await db
          .update(doacoes)
          .set({ apelidoId: apelido.id })
          .where(and(eq(doacoes.id, t.doacaoId), eq(doacoes.apelidoTexto, apelido.nome)));
      }
      const cookie = await assinarCookie(`${PREFIXO_COOKIE}${apelido.id}`, segredos.segredoCookie);
      return { ok: true, apelidoId: apelido.id, nome: apelido.nome, cookie };
    },

    async apelidoIdDoCookie(valorCookie) {
      if (!valorCookie) return null;
      const valor = await verificarCookie(valorCookie, segredos.segredoCookie);
      if (!valor || !valor.startsWith(PREFIXO_COOKIE)) return null;
      const id = valor.slice(PREFIXO_COOKIE.length);
      const [a] = await db.select({ id: apelidos.id, confirmadoEm: apelidos.confirmadoEm }).from(apelidos).where(eq(apelidos.id, id)).limit(1);
      return a?.confirmadoEm ? a.id : null;
    },

    async denunciar(doacaoId, motivo) {
      await db.transaction(async (tx) => {
        await tx.insert(denuncias).values({ doacaoId, motivo, criadaEm: agora() });
        await tx.update(doacoes).set({ mensagemOculta: true }).where(eq(doacoes.id, doacaoId));
      });
    },
  };
}
