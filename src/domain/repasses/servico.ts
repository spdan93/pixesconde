import { and, asc, desc, eq, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import type { Config } from "@/infra/db/config";
import { doacoes, recebedores, repasses } from "@/infra/db/schema";
import type { Provedores } from "@/providers";
import type { ServicoRecebedores } from "@/domain/recebedores/servico";
import type { AgendadorRepasses } from "@/domain/doacoes/servico";
import { lancar } from "@/domain/razao/servico";

export const DESCRICAO_PIX = "PIX ESCONDE";
export const MAX_TENTATIVAS = 5;
/** Repasses que falharam de vez, seguidos, até o recebedor ser tratado como chave inválida (vai para troca/devolução). */
export const MAX_REPASSES_FALHOS = 3;
/** Um repasse 'enviando' só entra na conciliação depois disso: cobre a chamada em curso de outro processo. */
export const CARENCIA_CONCILIACAO_MIN = 5;

export type Repasse = typeof repasses.$inferSelect;

export interface ServicoRepasses extends AgendadorRepasses {
  agendarParaRecebedor(recebedorId: string): Promise<string | null>;
  agendarTodos(): Promise<number>;
  processarAgendados(limite?: number): Promise<{ concluidos: number; falhos: number }>;
  devolverRetidos(diasLimite?: number): Promise<number>;
  listarDoRecebedor(recebedorId: string): Promise<Repasse[]>;
}

export type DepsRepasses = {
  db: Db;
  provedores: Provedores;
  recebedores: ServicoRecebedores;
  doacoes: { estornar(doacaoId: string, motivo: string): Promise<boolean> };
  config: () => Promise<Config>;
  agora?: () => Date;
};

export function criarServicoRepasses(deps: DepsRepasses): ServicoRepasses {
  const { db, provedores, recebedores: svcRecebedores, doacoes: svcDoacoes, config } = deps;
  const agora = deps.agora ?? (() => new Date());

  /** Doações confirmadas ainda não repassadas: sem repasse, ou cujo repasse falhou. */
  async function creditosPendentes(tx: Db, recebedorId: string) {
    return tx
      .select({ id: doacoes.id, liquido: doacoes.liquidoCentavos })
      .from(doacoes)
      .leftJoin(repasses, eq(repasses.id, doacoes.repasseId))
      .where(
        and(
          eq(doacoes.recebedorId, recebedorId),
          eq(doacoes.status, "confirmada"),
          or(isNull(doacoes.repasseId), eq(repasses.status, "falhou")),
        ),
      );
  }

  async function agendarParaRecebedor(recebedorId: string): Promise<string | null> {
    const cfg = await config();
    const chave = await svcRecebedores.obterChaveDecifrada(recebedorId);
    if (!chave) return null;
    return db.transaction(async (tx) => {
      // Trava o recebedor: dois agrupamentos concorrentes (webhook + cron) ficam em fila.
      const [rec] = await tx
        .select({ status: recebedores.status })
        .from(recebedores)
        .where(eq(recebedores.id, recebedorId))
        .for("update");
      if (!rec || rec.status === "invalida") return null;
      const creditos = await creditosPendentes(tx, recebedorId);
      const soma = creditos.reduce((s, c) => s + c.liquido, 0);
      if (creditos.length === 0 || soma <= 0 || soma < cfg.minimoRepasseCentavos) return null;

      const [aberto] = await tx
        .select()
        .from(repasses)
        .where(and(eq(repasses.recebedorId, recebedorId), eq(repasses.status, "agendado")))
        .limit(1);

      let repasseId: string;
      if (aberto) {
        repasseId = aberto.id;
        const atualizados = await tx
          .update(repasses)
          .set({ valorCentavos: aberto.valorCentavos + soma })
          .where(and(eq(repasses.id, repasseId), eq(repasses.status, "agendado")))
          .returning({ id: repasses.id });
        if (atualizados.length !== 1) throw new Error("repasse saiu de 'agendado' durante o agrupamento");
      } else {
        repasseId = crypto.randomUUID();
        await tx.insert(repasses).values({
          id: repasseId,
          recebedorId,
          chavePixId: chave.chavePixId,
          valorCentavos: soma,
          status: "agendado",
          refExterna: `rep_${repasseId}`,
          agendadoPara: agora(),
          criadoEm: agora(),
        });
      }
      const marcadas = await tx
        .update(doacoes)
        .set({ repasseId })
        .where(
          and(
            inArray(doacoes.id, creditos.map((c) => c.id)),
            eq(doacoes.status, "confirmada"),
            or(isNull(doacoes.repasseId), ne(doacoes.repasseId, repasseId)),
          ),
        )
        .returning({ id: doacoes.id });
      if (marcadas.length !== creditos.length) throw new Error("créditos mudaram durante o agrupamento");
      return repasseId;
    });
  }

  async function reclamar(repasseId: string): Promise<Repasse | null> {
    const [r] = await db
      .update(repasses)
      .set({ status: "enviando", reclamadoEm: agora() })
      .where(and(eq(repasses.id, repasseId), eq(repasses.status, "agendado")))
      .returning();
    return r ?? null;
  }

  // Toda transição a partir de 'enviando' é um compare-and-swap sobre a reivindicação
  // (status + reclamadoEm do instantâneo): se outro processo reclamou a linha de novo
  // enquanto esta chamada estava em curso, nada se aplica e nada vai para o razão.
  function mesmaReivindicacao(r: Repasse) {
    return and(
      eq(repasses.id, r.id),
      eq(repasses.status, "enviando"),
      r.reclamadoEm ? eq(repasses.reclamadoEm, r.reclamadoEm) : isNull(repasses.reclamadoEm),
    );
  }

  async function concluir(r: Repasse, provedorId: string): Promise<boolean> {
    const ok = await db.transaction(async (tx) => {
      const atualizados = await tx
        .update(repasses)
        .set({ status: "concluido", provedorId, concluidoEm: agora(), erro: null })
        .where(mesmaReivindicacao(r))
        .returning({ id: repasses.id });
      if (atualizados.length === 0) return false;
      await lancar(tx, { tipo: "saida", valorCentavos: -r.valorCentavos, repasseId: r.id });
      return true;
    });
    if (!ok) return false;
    const [rec] = await db.select({ status: recebedores.status }).from(recebedores).where(eq(recebedores.id, r.recebedorId));
    if (rec?.status === "aguardando_validacao") await svcRecebedores.marcarAtiva(r.recebedorId);
    return true;
  }

  async function falharDeVez(r: Repasse, provedorId: string | null, erro: string): Promise<boolean> {
    const linhas = await db
      .update(repasses)
      .set({ status: "falhou", provedorId, erro, tentativas: r.tentativas + 1 })
      .where(mesmaReivindicacao(r))
      .returning({ id: repasses.id });
    return linhas.length === 1;
  }

  /**
   * Falha definitiva por motivo que não é "chave inválida" não pode virar loop diário eterno:
   * depois de MAX_REPASSES_FALHOS repasses falhos para o mesmo recebedor, ele é tratado como
   * chave inválida — a página secreta pede troca e, sem troca, a devolução de 30 dias se aplica.
   */
  async function conferirFalhasRepetidas(recebedorId: string) {
    const [linha] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(repasses)
      .where(and(eq(repasses.recebedorId, recebedorId), eq(repasses.status, "falhou")));
    if (Number(linha?.n ?? 0) >= MAX_REPASSES_FALHOS) await svcRecebedores.marcarInvalida(recebedorId);
  }

  async function reagendar(r: Repasse, provedorId: string | null, erro: string): Promise<"reagendado" | "falhou" | "ignorado"> {
    const tentativas = r.tentativas + 1;
    if (tentativas > MAX_TENTATIVAS) {
      if (!(await falharDeVez(r, provedorId, `desistiu após ${MAX_TENTATIVAS} tentativas: ${erro}`))) return "ignorado";
      await conferirFalhasRepetidas(r.recebedorId);
      return "falhou";
    }
    const linhas = await db
      .update(repasses)
      .set({
        status: "agendado",
        tentativas,
        erro,
        provedorId,
        reclamadoEm: null,
        agendadoPara: new Date(agora().getTime() + 2 ** tentativas * 60_000),
      })
      .where(mesmaReivindicacao(r))
      .returning({ id: repasses.id });
    return linhas.length === 1 ? "reagendado" : "ignorado";
  }

  return {
    agendarParaRecebedor,

    async agendarTodos() {
      const linhas = await db
        .selectDistinct({ recebedorId: doacoes.recebedorId })
        .from(doacoes)
        .innerJoin(recebedores, eq(recebedores.id, doacoes.recebedorId))
        .leftJoin(repasses, eq(repasses.id, doacoes.repasseId))
        .where(
          and(
            eq(doacoes.status, "confirmada"),
            ne(recebedores.status, "invalida"),
            or(isNull(doacoes.repasseId), eq(repasses.status, "falhou")),
          ),
        );
      let agendados = 0;
      for (const l of linhas) {
        if (await agendarParaRecebedor(l.recebedorId)) agendados++;
      }
      return agendados;
    },

    async processarAgendados(limite = 50) {
      const prontos = await db
        .select()
        .from(repasses)
        .where(and(eq(repasses.status, "agendado"), lte(repasses.agendadoPara, agora())))
        .orderBy(asc(repasses.agendadoPara))
        .limit(limite);

      let concluidos = 0;
      let falhos = 0;
      const tratadosNestaRodada: string[] = [];
      for (const candidato of prontos) {
        const r = await reclamar(candidato.id);
        if (!r) continue; // outro processo pegou
        tratadosNestaRodada.push(r.id);
        const chave = await svcRecebedores.obterChaveDecifrada(r.recebedorId);
        if (!chave) {
          await falharDeVez(r, null, "recebedor sem chave ativa");
          falhos++;
          continue;
        }
        if (chave.chavePixId !== r.chavePixId) {
          await db.update(repasses).set({ chavePixId: chave.chavePixId }).where(eq(repasses.id, r.id));
        }
        let envio: Awaited<ReturnType<Provedores["saida"]["enviar"]>>;
        try {
          envio = await provedores.saida.enviar({
            refExterna: r.refExterna,
            chavePix: chave.chave,
            valorCentavos: r.valorCentavos,
            descricao: DESCRICAO_PIX,
          });
        } catch (erro) {
          // Erro ambíguo (timeout, rede): o Pix pode ter saído. Fica em 'enviando' até a
          // conciliação perguntar ao provedor; nunca reenvia no escuro.
          const msg = erro instanceof Error ? erro.message : String(erro);
          await db.update(repasses).set({ erro: `indeterminado: ${msg}` }).where(mesmaReivindicacao(r));
          continue;
        }
        if (envio.status === "concluido") {
          if (await concluir(r, envio.idProvedor)) concluidos++;
        } else if (envio.status === "processando") {
          await db.update(repasses).set({ provedorId: envio.idProvedor }).where(mesmaReivindicacao(r));
        } else if (envio.chaveInvalida) {
          if (await falharDeVez(r, envio.idProvedor, envio.erro ?? "chave inválida")) {
            await svcRecebedores.marcarInvalida(r.recebedorId);
            falhos++;
          }
        } else if ((await reagendar(r, envio.idProvedor, envio.erro ?? "falha no envio")) === "falhou") {
          falhos++;
        }
      }

      // Conciliação: o que está 'enviando' há mais que a carência (processando, erro ambíguo,
      // ou processo que morreu no meio). Dentro da carência pode ser outro processo em plena chamada.
      const limiteCarencia = new Date(agora().getTime() - CARENCIA_CONCILIACAO_MIN * 60_000);
      const emAndamento = await db
        .select()
        .from(repasses)
        .where(
          and(
            eq(repasses.status, "enviando"),
            or(isNull(repasses.reclamadoEm), lte(repasses.reclamadoEm, limiteCarencia)),
            tratadosNestaRodada.length ? notInArray(repasses.id, tratadosNestaRodada) : undefined,
          ),
        )
        .limit(limite);
      for (const r of emAndamento) {
        const { status } = await provedores.saida.consultar({ idProvedor: r.provedorId, refExterna: r.refExterna });
        if (status === "concluido") {
          if (await concluir(r, r.provedorId ?? `conciliado_${r.refExterna}`)) concluidos++;
        } else if (status === "falhou" || status === "desconhecido") {
          const motivo = status === "falhou" ? "provedor reportou falha" : "provedor não registrou o envio";
          if ((await reagendar(r, r.provedorId, motivo)) === "falhou") falhos++;
        }
        // "processando": continua esperando.
      }
      return { concluidos, falhos };
    },

    async devolverRetidos(diasLimite = 30) {
      const limite = new Date(agora().getTime() - diasLimite * 24 * 60 * 60_000);
      const invalidos = await db
        .select({ id: recebedores.id })
        .from(recebedores)
        .where(and(eq(recebedores.status, "invalida"), lte(recebedores.invalidaDesde, limite)));
      let estornadas = 0;
      for (const rec of invalidos) {
        const presas = await db
          .select({ id: doacoes.id })
          .from(doacoes)
          .leftJoin(repasses, eq(repasses.id, doacoes.repasseId))
          .where(
            and(
              eq(doacoes.recebedorId, rec.id),
              eq(doacoes.status, "confirmada"),
              // só o que comprovadamente não saiu; agendado/enviando espera o desfecho
              or(isNull(doacoes.repasseId), eq(repasses.status, "falhou")),
            ),
          );
        for (const d of presas) {
          if (await svcDoacoes.estornar(d.id, `chave inválida há mais de ${diasLimite} dias`)) estornadas++;
        }
      }
      return estornadas;
    },

    async listarDoRecebedor(recebedorId) {
      return db.select().from(repasses).where(eq(repasses.recebedorId, recebedorId)).orderBy(desc(repasses.criadoEm));
    },
  };
}
