import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import type { Config } from "@/infra/db/config";
import { doacoes, recebedores, repasses } from "@/infra/db/schema";
import type { Provedores } from "@/providers";
import type { ServicoRecebedores } from "@/domain/recebedores/servico";
import type { AgendadorRepasses } from "@/domain/doacoes/servico";
import { lancar } from "@/domain/razao/servico";

export const DESCRICAO_PIX = "PIX ESCONDE";
export const MAX_TENTATIVAS = 5;

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
        await tx
          .update(repasses)
          .set({ valorCentavos: aberto.valorCentavos + soma })
          .where(eq(repasses.id, repasseId));
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
      await tx
        .update(doacoes)
        .set({ repasseId })
        .where(inArray(doacoes.id, creditos.map((c) => c.id)));
      return repasseId;
    });
  }

  async function reclamar(repasseId: string): Promise<Repasse | null> {
    const [r] = await db
      .update(repasses)
      .set({ status: "enviando" })
      .where(and(eq(repasses.id, repasseId), eq(repasses.status, "agendado")))
      .returning();
    return r ?? null;
  }

  async function concluir(r: Repasse, provedorId: string) {
    await db.transaction(async (tx) => {
      await tx
        .update(repasses)
        .set({ status: "concluido", provedorId, concluidoEm: agora(), erro: null })
        .where(eq(repasses.id, r.id));
      await lancar(tx, { tipo: "saida", valorCentavos: -r.valorCentavos, repasseId: r.id });
    });
    const [rec] = await db.select({ status: recebedores.status }).from(recebedores).where(eq(recebedores.id, r.recebedorId));
    if (rec?.status === "aguardando_validacao") await svcRecebedores.marcarAtiva(r.recebedorId);
  }

  async function falharDeVez(r: Repasse, provedorId: string | null, erro: string) {
    await db
      .update(repasses)
      .set({ status: "falhou", provedorId, erro, tentativas: r.tentativas + 1 })
      .where(eq(repasses.id, r.id));
  }

  async function reagendar(r: Repasse, provedorId: string | null, erro: string): Promise<"reagendado" | "falhou"> {
    const tentativas = r.tentativas + 1;
    if (tentativas > MAX_TENTATIVAS) {
      await falharDeVez(r, provedorId, `desistiu após ${MAX_TENTATIVAS} tentativas: ${erro}`);
      return "falhou";
    }
    await db
      .update(repasses)
      .set({
        status: "agendado",
        tentativas,
        erro,
        provedorId,
        agendadoPara: new Date(agora().getTime() + 2 ** tentativas * 60_000),
      })
      .where(eq(repasses.id, r.id));
    return "reagendado";
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
      for (const candidato of prontos) {
        const r = await reclamar(candidato.id);
        if (!r) continue; // outro processo pegou
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
          const msg = erro instanceof Error ? erro.message : String(erro);
          if ((await reagendar(r, null, msg)) === "falhou") falhos++;
          continue;
        }
        if (envio.status === "concluido") {
          await concluir(r, envio.idProvedor);
          concluidos++;
        } else if (envio.status === "processando") {
          await db.update(repasses).set({ provedorId: envio.idProvedor }).where(eq(repasses.id, r.id));
        } else if (envio.chaveInvalida) {
          await falharDeVez(r, envio.idProvedor, envio.erro ?? "chave inválida");
          await svcRecebedores.marcarInvalida(r.recebedorId);
          falhos++;
        } else if ((await reagendar(r, envio.idProvedor, envio.erro ?? "falha no envio")) === "falhou") {
          falhos++;
        }
      }

      // Envios que ficaram "processando" numa rodada anterior.
      const emAndamento = await db
        .select()
        .from(repasses)
        .where(and(eq(repasses.status, "enviando"), sql`${repasses.provedorId} is not null`))
        .limit(limite);
      for (const r of emAndamento) {
        const { status } = await provedores.saida.consultar(r.provedorId!);
        if (status === "concluido") {
          await concluir(r, r.provedorId!);
          concluidos++;
        } else if (status === "falhou") {
          if ((await reagendar(r, r.provedorId, "provedor reportou falha")) === "falhou") falhos++;
        }
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
              or(isNull(doacoes.repasseId), ne(repasses.status, "concluido")),
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
