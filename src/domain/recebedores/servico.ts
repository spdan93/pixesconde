import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import { chavesPix, doacoes, recebedores } from "@/infra/db/schema";
import { cifrar, decifrar, gerarToken, hmacHex, sha256Hex } from "@/infra/crypto";
import { mascararChave, validarChaveAleatoria, type MotivoChave, type ResultadoChave } from "@/domain/chaves/validar-chave";

export type StatusRecebedor = (typeof recebedores.$inferSelect)["status"];

export type RecebedorPublico = {
  id: string;
  numeroPublico: number;
  status: StatusRecebedor;
  totalRecebidoCentavos: number;
  quantidadePix: number;
  ultimaMensagem: { texto: string; apelido: string | null; em: Date } | null;
  criadoEm: Date;
};

export type RecebedorPrivado = RecebedorPublico & {
  chaveMascarada: string;
  invalidaDesde: Date | null;
};

export type OrdemLista = "recentes" | "menos_receberam" | "mais_receberam" | "aleatoria";

export type ResultadoCadastro =
  | { ok: true; numeroPublico: number; token: string }
  | { ok: false; motivo: MotivoChave | "duplicada" };

export type ResultadoTroca = ResultadoChave | { ok: false; motivo: "duplicada" };

export type Segredos = { chaveCifra: string; segredoHmac: string };

export interface ServicoRecebedores {
  cadastrar(entradaChave: string): Promise<ResultadoCadastro>;
  buscarPorToken(token: string): Promise<RecebedorPrivado | null>;
  buscarPublico(numeroPublico: number): Promise<RecebedorPublico | null>;
  listarPublico(opts: { ordem: OrdemLista; limite: number; pagina: number }): Promise<{ itens: RecebedorPublico[]; total: number }>;
  sortear(): Promise<number | null>;
  pausar(id: string): Promise<void>;
  reativar(id: string): Promise<void>;
  remover(id: string): Promise<void>;
  trocarChave(id: string, entradaChave: string): Promise<ResultadoTroca>;
  obterChaveDecifrada(recebedorId: string): Promise<{ chavePixId: string; chave: string } | null>;
  marcarInvalida(recebedorId: string): Promise<void>;
  marcarAtiva(recebedorId: string): Promise<void>;
}

/** Recebedores que aparecem na lista e entram no sorteio. */
const ELEGIVEIS: StatusRecebedor[] = ["ativa", "aguardando_validacao"];

export function criarServicoRecebedores(db: Db, segredos: Segredos): ServicoRecebedores {
  const estatisticas = db
    .select({
      recebedorId: doacoes.recebedorId,
      total: sql<number>`coalesce(sum(${doacoes.valorCentavos}), 0)::int`.as("total"),
      quantidade: sql<number>`count(*)::int`.as("quantidade"),
    })
    .from(doacoes)
    .where(eq(doacoes.status, "confirmada"))
    .groupBy(doacoes.recebedorId)
    .as("estatisticas");

  const totalExpr = sql<number>`coalesce(${estatisticas.total}, 0)`;
  const quantidadeExpr = sql<number>`coalesce(${estatisticas.quantidade}, 0)`;

  async function ultimasMensagens(ids: string[]): Promise<Map<string, RecebedorPublico["ultimaMensagem"]>> {
    const mapa = new Map<string, RecebedorPublico["ultimaMensagem"]>();
    if (ids.length === 0) return mapa;
    const linhas = await db
      .select({
        recebedorId: doacoes.recebedorId,
        texto: doacoes.mensagem,
        apelido: doacoes.apelidoTexto,
        em: doacoes.confirmadaEm,
      })
      .from(doacoes)
      .where(
        and(
          inArray(doacoes.recebedorId, ids),
          eq(doacoes.status, "confirmada"),
          eq(doacoes.mensagemOculta, false),
          isNotNull(doacoes.mensagem),
        ),
      )
      .orderBy(desc(doacoes.confirmadaEm));
    for (const l of linhas) {
      if (!mapa.has(l.recebedorId) && l.texto && l.em) {
        mapa.set(l.recebedorId, { texto: l.texto, apelido: l.apelido, em: l.em });
      }
    }
    return mapa;
  }

  async function montar(
    linhas: {
      id: string;
      numeroPublico: number;
      status: StatusRecebedor;
      total: number;
      quantidade: number;
      criadoEm: Date;
    }[],
  ): Promise<RecebedorPublico[]> {
    const mensagens = await ultimasMensagens(linhas.map((l) => l.id));
    return linhas.map((l) => ({
      id: l.id,
      numeroPublico: l.numeroPublico,
      status: l.status,
      totalRecebidoCentavos: Number(l.total),
      quantidadePix: Number(l.quantidade),
      ultimaMensagem: mensagens.get(l.id) ?? null,
      criadoEm: l.criadoEm,
    }));
  }

  function consultaBase() {
    return db
      .select({
        id: recebedores.id,
        numeroPublico: recebedores.numeroPublico,
        status: recebedores.status,
        total: totalExpr,
        quantidade: quantidadeExpr,
        criadoEm: recebedores.criadoEm,
      })
      .from(recebedores)
      .leftJoin(estatisticas, eq(estatisticas.recebedorId, recebedores.id));
  }

  async function chaveAtiva(recebedorId: string) {
    const [linha] = await db
      .select()
      .from(chavesPix)
      .where(and(eq(chavesPix.recebedorId, recebedorId), eq(chavesPix.ativa, true)))
      .limit(1);
    return linha ?? null;
  }

  async function hmacJaAtivo(hmac: string): Promise<boolean> {
    const [linha] = await db
      .select({ id: chavesPix.id })
      .from(chavesPix)
      .where(and(eq(chavesPix.chaveHmac, hmac), eq(chavesPix.ativa, true)))
      .limit(1);
    return Boolean(linha);
  }

  async function mudarStatus(id: string, status: StatusRecebedor, extra: Partial<typeof recebedores.$inferInsert> = {}) {
    await db
      .update(recebedores)
      .set({ status, atualizadoEm: new Date(), ...extra })
      .where(eq(recebedores.id, id));
  }

  return {
    async cadastrar(entradaChave) {
      const validacao = validarChaveAleatoria(entradaChave);
      if (!validacao.ok) return validacao;
      const hmac = await hmacHex(validacao.chave, segredos.segredoHmac);
      if (await hmacJaAtivo(hmac)) return { ok: false, motivo: "duplicada" };
      const token = gerarToken();
      const tokenHash = await sha256Hex(token);
      const chaveCifrada = await cifrar(validacao.chave, segredos.chaveCifra);
      try {
        const numeroPublico = await db.transaction(async (tx) => {
          const [r] = await tx.insert(recebedores).values({ tokenHash }).returning();
          await tx.insert(chavesPix).values({ recebedorId: r!.id, chaveCifrada, chaveHmac: hmac, ativa: true });
          return r!.numeroPublico;
        });
        return { ok: true, numeroPublico, token };
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) return { ok: false, motivo: "duplicada" };
        throw erro;
      }
    },

    async buscarPorToken(token) {
      const tokenHash = await sha256Hex(token);
      const linhas = await consultaBase().where(eq(recebedores.tokenHash, tokenHash)).limit(1);
      const [publico] = await montar(linhas);
      if (!publico) return null;
      const chave = await chaveAtiva(publico.id);
      const [bruto] = await db
        .select({ invalidaDesde: recebedores.invalidaDesde })
        .from(recebedores)
        .where(eq(recebedores.id, publico.id));
      const chaveTexto = chave ? await decifrar(chave.chaveCifrada, segredos.chaveCifra) : null;
      return {
        ...publico,
        chaveMascarada: chaveTexto ? mascararChave(chaveTexto) : "••••",
        invalidaDesde: bruto?.invalidaDesde ?? null,
      };
    },

    async buscarPublico(numeroPublico) {
      const linhas = await consultaBase().where(eq(recebedores.numeroPublico, numeroPublico)).limit(1);
      const [publico] = await montar(linhas);
      return publico ?? null;
    },

    async listarPublico({ ordem, limite, pagina }) {
      const filtro = inArray(recebedores.status, ELEGIVEIS);
      const ordenacao = {
        recentes: [desc(recebedores.criadoEm), desc(recebedores.numeroPublico)],
        menos_receberam: [asc(totalExpr), asc(recebedores.numeroPublico)],
        mais_receberam: [desc(totalExpr), asc(recebedores.numeroPublico)],
        aleatoria: [sql`random()`],
      }[ordem];
      const deslocamento = Math.max(0, pagina - 1) * limite;
      const linhas = await consultaBase().where(filtro).orderBy(...ordenacao).limit(limite).offset(deslocamento);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recebedores)
        .where(filtro);
      return { itens: await montar(linhas), total: Number(total) };
    },

    async sortear() {
      const [linha] = await db
        .select({ numeroPublico: recebedores.numeroPublico })
        .from(recebedores)
        .where(inArray(recebedores.status, ELEGIVEIS))
        .orderBy(sql`random()`)
        .limit(1);
      return linha?.numeroPublico ?? null;
    },

    pausar: (id) => mudarStatus(id, "pausada"),
    reativar: (id) => mudarStatus(id, "ativa"),
    remover: (id) => mudarStatus(id, "removida"),
    marcarInvalida: (id) => mudarStatus(id, "invalida", { invalidaDesde: new Date() }),
    marcarAtiva: (id) => mudarStatus(id, "ativa", { invalidaDesde: null }),

    async trocarChave(id, entradaChave) {
      const validacao = validarChaveAleatoria(entradaChave);
      if (!validacao.ok) return validacao;
      const hmac = await hmacHex(validacao.chave, segredos.segredoHmac);
      const atual = await chaveAtiva(id);
      if (atual?.chaveHmac === hmac) return validacao;
      if (await hmacJaAtivo(hmac)) return { ok: false, motivo: "duplicada" };
      const chaveCifrada = await cifrar(validacao.chave, segredos.chaveCifra);
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(chavesPix)
            .set({ ativa: false, desativadaEm: new Date() })
            .where(and(eq(chavesPix.recebedorId, id), eq(chavesPix.ativa, true)));
          await tx.insert(chavesPix).values({ recebedorId: id, chaveCifrada, chaveHmac: hmac, ativa: true });
          // Chave nova precisa ser validada no primeiro repasse. Pausado continua pausado e
          // removido continua fora: trocar a chave nunca recoloca ninguém na roda por tabela.
          await tx
            .update(recebedores)
            .set({ status: "aguardando_validacao", invalidaDesde: null, atualizadoEm: new Date() })
            .where(and(eq(recebedores.id, id), inArray(recebedores.status, ["ativa", "aguardando_validacao", "invalida"])));
        });
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) return { ok: false, motivo: "duplicada" };
        throw erro;
      }
      return validacao;
    },

    async obterChaveDecifrada(recebedorId) {
      const chave = await chaveAtiva(recebedorId);
      if (!chave) return null;
      return { chavePixId: chave.id, chave: await decifrar(chave.chaveCifrada, segredos.chaveCifra) };
    },
  };
}

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const codigo = (erro as { code?: string; cause?: { code?: string } })?.code ?? (erro as { cause?: { code?: string } })?.cause?.code;
  const mensagem = erro instanceof Error ? erro.message : "";
  return codigo === "23505" || /unique|duplicate key/i.test(mensagem);
}
