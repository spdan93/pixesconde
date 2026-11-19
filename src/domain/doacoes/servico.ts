import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "@/infra/db/client";
import type { Config } from "@/infra/db/config";
import { apelidos, doacoes, eventosWebhook, repasses, recebedores as recebedoresNumero } from "@/infra/db/schema";
import type { Provedores } from "@/providers";
import type { ServicoRecebedores } from "@/domain/recebedores/servico";
import { calcularTaxa, formatarReais, interpretarReais } from "@/domain/dinheiro";
import { mensagemRecusaMensagem, validarMensagem } from "@/domain/texto/validar-mensagem";
import { mensagemRecusaApelido, validarApelido } from "@/domain/texto/validar-apelido";
import { lancar } from "@/domain/razao/servico";
import { gerarToken, sha256Hex } from "@/infra/crypto";

export const DESCRITOR_FATURA = "PIXESCONDE";
/** Doação em 'estornando' só entra na conciliação depois disso. */
export const CARENCIA_ESTORNO_MIN = 5;

export type StatusDoacao = (typeof doacoes.$inferSelect)["status"];

export type ResultadoIntencao =
  | { ok: true; doacaoId: string; urlPagamento: string; segredoDoador: string }
  | { ok: false; campo: "valor" | "mensagem" | "apelido" | "recebedor"; motivo: string };

export type ResultadoNotificacao = {
  resultado: "confirmada" | "ja_processada" | "nao_aprovada" | "desconhecida";
  efeitosPendentes: boolean;
};

export type Comprovante = {
  id: string;
  numeroComprovante: number;
  status: StatusDoacao;
  valorCentavos: number;
  taxaBp: number;
  taxaCentavos: number;
  liquidoCentavos: number;
  numeroPublico: number;
  recebedorId: string;
  apelidoTexto: string | null;
  /** O apelido desta doação já está vinculado a um dono confirmado. */
  apelidoConfirmado: boolean;
  mensagem: string | null;
  mensagemOculta: boolean;
  criadaEm: Date;
  confirmadaEm: Date | null;
  previsaoRepasse: "no próximo repasse" | "repassado" | null;
};

export type AgendadorRepasses = { agendarParaRecebedor(recebedorId: string): Promise<string | null> };

export type DoacaoDoRecebedor = {
  id: string;
  status: StatusDoacao;
  valorCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
  mensagem: string | null;
  mensagemOculta: boolean;
  apelido: string | null;
  confirmadaEm: Date | null;
  /** "concluido" quando o Pix já saiu; "pendente" para tudo que ainda não saiu. */
  repasse: "concluido" | "pendente";
};

export interface ServicoDoacoes {
  criarIntencao(i: {
    numeroPublico: number;
    valorTexto: string;
    mensagem: string;
    apelido: string;
    apelidoIdDoCookie: string | null;
  }): Promise<ResultadoIntencao>;
  processarNotificacao(i: {
    provedor: string;
    idExterno: string;
    refExterna: string;
    idProvedor: string | null;
    payload: unknown;
  }): Promise<ResultadoNotificacao>;
  expirarIntencoes(): Promise<number>;
  buscarComprovante(id: string): Promise<Comprovante | null>;
  estornar(doacaoId: string, motivo: string): Promise<boolean>;
  /** Para a página secreta: o que chegou para o recebedor, do mais novo para o mais velho. */
  listarDoRecebedor(recebedorId: string): Promise<DoacaoDoRecebedor[]>;
  /** Resolve estornos que ficaram ambíguos (exceção no reembolso): pergunta ao provedor e fecha ou reverte. */
  conciliarEstornos(): Promise<{ estornadas: number; revertidas: number }>;
  /** Injeção tardia para evitar ciclo doacoes ↔ repasses. */
  setRepasses(r: AgendadorRepasses): void;
}

export type DepsDoacoes = {
  db: Db;
  provedores: Provedores;
  recebedores: ServicoRecebedores;
  config: () => Promise<Config>;
  urlPublica: string;
  agora?: () => Date;
};

export function criarServicoDoacoes(deps: DepsDoacoes): ServicoDoacoes {
  const { db, provedores, recebedores, config, urlPublica } = deps;
  const agora = deps.agora ?? (() => new Date());
  let agendador: AgendadorRepasses | null = null;

  async function apelidoIdParaVincular(apelidoTexto: string | null, apelidoIdDoCookie: string | null): Promise<string | null> {
    if (!apelidoTexto || !apelidoIdDoCookie) return null;
    const [a] = await db.select().from(apelidos).where(eq(apelidos.id, apelidoIdDoCookie)).limit(1);
    if (!a || !a.confirmadoEm || a.nome !== apelidoTexto) return null;
    return a.id;
  }

  async function registrarEvento(i: { provedor: string; idExterno: string; payload: unknown }): Promise<string | null> {
    const linhas = await db
      .insert(eventosWebhook)
      .values({ provedor: i.provedor, idExterno: i.idExterno, payload: (i.payload ?? {}) as object })
      .onConflictDoNothing()
      .returning({ id: eventosWebhook.id });
    return linhas[0]?.id ?? null;
  }

  async function concluirEvento(eventoId: string | null, resultado: string) {
    if (!eventoId) return;
    await db.update(eventosWebhook).set({ processadoEm: agora(), resultado }).where(eq(eventosWebhook.id, eventoId));
  }

  async function reverterEstorno(doacaoId: string): Promise<boolean> {
    const linhas = await db
      .update(doacoes)
      .set({ status: "confirmada", estornoIniciadoEm: null })
      .where(and(eq(doacoes.id, doacaoId), eq(doacoes.status, "estornando")))
      .returning({ id: doacoes.id });
    return linhas.length === 1;
  }

  async function fecharEstorno(d: Pick<typeof doacoes.$inferSelect, "id" | "valorCentavos" | "taxaCentavos">): Promise<boolean> {
    return db.transaction(async (tx) => {
      const atualizadas = await tx
        .update(doacoes)
        .set({ status: "estornada", estornadaEm: agora(), repasseId: null })
        .where(and(eq(doacoes.id, d.id), eq(doacoes.status, "estornando")))
        .returning({ id: doacoes.id });
      if (atualizadas.length === 0) return false;
      await lancar(tx, { tipo: "reversao_entrada", valorCentavos: -d.valorCentavos, doacaoId: d.id });
      await lancar(tx, { tipo: "reversao_taxa", valorCentavos: d.taxaCentavos, doacaoId: d.id });
      return true;
    });
  }

  return {
    setRepasses(r) {
      agendador = r;
    },

    async criarIntencao(i) {
      const cfg = await config();
      const valorCentavos = interpretarReais(i.valorTexto);
      if (valorCentavos === null) return { ok: false, campo: "valor", motivo: "Digite um valor em reais, tipo 5 ou 12,50." };
      if (valorCentavos < cfg.minimoCentavos) {
        return { ok: false, campo: "valor", motivo: `Mínimo ${formatarReais(cfg.minimoCentavos)}. Menos que isso nem o banco leva a sério.` };
      }
      if (valorCentavos > cfg.maximoCentavos) {
        return { ok: false, campo: "valor", motivo: `Máximo ${formatarReais(cfg.maximoCentavos)} por Pix. Quer mandar mais? Manda outro.` };
      }
      const mensagem = validarMensagem(i.mensagem, cfg.palavrasBloqueadas);
      if (!mensagem.ok) return { ok: false, campo: "mensagem", motivo: mensagemRecusaMensagem(mensagem.motivo) };
      const apelido = validarApelido(i.apelido);
      if (!apelido.ok) return { ok: false, campo: "apelido", motivo: mensagemRecusaApelido(apelido.motivo) };

      const recebedor = await recebedores.buscarPublico(i.numeroPublico);
      if (!recebedor || !["ativa", "aguardando_validacao"].includes(recebedor.status)) {
        return { ok: false, campo: "recebedor", motivo: "Essa chave não está na roda agora. Sorteia outra." };
      }

      const { taxa, liquido } = calcularTaxa(valorCentavos, cfg.taxaBp);
      const id = crypto.randomUUID();
      const refExterna = `doa_${id}`;
      const expiraEm = new Date(agora().getTime() + cfg.expiracaoIntencaoMin * 60_000);
      const apelidoId = await apelidoIdParaVincular(apelido.apelido, i.apelidoIdDoCookie);
      const segredoDoador = gerarToken();

      await db.insert(doacoes).values({
        id,
        segredoDoadorHash: await sha256Hex(segredoDoador),
        recebedorId: recebedor.id,
        valorCentavos,
        taxaBp: cfg.taxaBp,
        taxaCentavos: taxa,
        liquidoCentavos: liquido,
        mensagem: mensagem.mensagem,
        apelidoTexto: apelido.apelido,
        apelidoId,
        status: "pendente",
        refExterna,
        criadaEm: agora(),
        expiraEm,
      });

      const cobranca = await provedores.entrada.criarCobranca({
        refExterna,
        valorCentavos,
        descricao: `Pix sem motivo para anônimo #${String(recebedor.numeroPublico).padStart(4, "0")}`,
        urlRetorno: `${urlPublica}/comprovante/${id}`,
        expiraEm,
      });
      if (cobranca.idProvedor) {
        await db.update(doacoes).set({ provedorPagamentoId: cobranca.idProvedor }).where(eq(doacoes.id, id));
      }
      return { ok: true, doacaoId: id, urlPagamento: cobranca.urlPagamento, segredoDoador };
    },

    async processarNotificacao(i) {
      const eventoId = await registrarEvento(i);
      if (!eventoId) return { resultado: "ja_processada", efeitosPendentes: false };

      const [doacao] = await db.select().from(doacoes).where(eq(doacoes.refExterna, i.refExterna)).limit(1);
      if (!doacao) {
        await concluirEvento(eventoId, "desconhecida");
        return { resultado: "desconhecida", efeitosPendentes: false };
      }
      if (doacao.status !== "pendente") {
        await concluirEvento(eventoId, "ja_processada");
        return { resultado: "ja_processada", efeitosPendentes: false };
      }

      const consulta = await provedores.entrada.consultar({
        refExterna: i.refExterna,
        idProvedor: i.idProvedor ?? doacao.provedorPagamentoId,
      });
      if (consulta.status !== "aprovado") {
        await concluirEvento(eventoId, `nao_aprovada:${consulta.status}`);
        return { resultado: "nao_aprovada", efeitosPendentes: false };
      }
      if (consulta.valorCentavos !== null && consulta.valorCentavos !== doacao.valorCentavos) {
        // Nunca bloqueia: o dinheiro já está na conta. Fica para conciliação.
        console.warn(
          `[doacoes] valor divergente em ${i.refExterna}: registrado ${doacao.valorCentavos}, provedor ${consulta.valorCentavos}`,
        );
      }

      const confirmou = await db.transaction(async (tx) => {
        const atualizadas = await tx
          .update(doacoes)
          .set({
            status: "confirmada",
            confirmadaEm: agora(),
            provedorPagamentoId: consulta.idProvedor ?? i.idProvedor ?? doacao.provedorPagamentoId,
          })
          .where(and(eq(doacoes.id, doacao.id), eq(doacoes.status, "pendente")))
          .returning({ id: doacoes.id });
        if (atualizadas.length === 0) return false;
        await lancar(tx, { tipo: "entrada", valorCentavos: doacao.valorCentavos, doacaoId: doacao.id });
        await lancar(tx, { tipo: "taxa", valorCentavos: -doacao.taxaCentavos, doacaoId: doacao.id });
        return true;
      });
      if (!confirmou) {
        await concluirEvento(eventoId, "ja_processada");
        return { resultado: "ja_processada", efeitosPendentes: false };
      }

      // Efeitos pós-confirmação: nunca derrubam a resposta do webhook.
      let efeitosPendentes = false;
      try {
        const cfg = await config();
        if (cfg.gatilhoRepasse === "imediato" && agendador) {
          await agendador.agendarParaRecebedor(doacao.recebedorId);
        }
      } catch (erro) {
        efeitosPendentes = true;
        console.error(`[doacoes] efeito pós-confirmação falhou em ${doacao.id}:`, erro);
      }
      await concluirEvento(eventoId, efeitosPendentes ? "confirmada:efeitos_pendentes" : "confirmada");
      return { resultado: "confirmada", efeitosPendentes };
    },

    async expirarIntencoes() {
      const linhas = await db
        .update(doacoes)
        .set({ status: "expirada" })
        .where(and(eq(doacoes.status, "pendente"), lt(doacoes.expiraEm, agora())))
        .returning({ id: doacoes.id });
      return linhas.length;
    },

    async buscarComprovante(id) {
      const [linha] = await db
        .select({
          doacao: doacoes,
          numeroPublico: recebedoresNumero.numeroPublico,
          repasseStatus: repasses.status,
          apelidoConfirmadoEm: apelidos.confirmadoEm,
        })
        .from(doacoes)
        .innerJoin(recebedoresNumero, eq(recebedoresNumero.id, doacoes.recebedorId))
        .leftJoin(repasses, eq(repasses.id, doacoes.repasseId))
        .leftJoin(apelidos, eq(apelidos.id, doacoes.apelidoId))
        .where(eq(doacoes.id, id))
        .limit(1);
      if (!linha) return null;
      const d = linha.doacao;
      let previsaoRepasse: Comprovante["previsaoRepasse"] = null;
      if (d.status === "confirmada") {
        previsaoRepasse = linha.repasseStatus === "concluido" ? "repassado" : "no próximo repasse";
      }
      return {
        id: d.id,
        numeroComprovante: d.numeroComprovante,
        status: d.status,
        valorCentavos: d.valorCentavos,
        taxaBp: d.taxaBp,
        taxaCentavos: d.taxaCentavos,
        liquidoCentavos: d.liquidoCentavos,
        numeroPublico: linha.numeroPublico,
        recebedorId: d.recebedorId,
        apelidoTexto: d.apelidoTexto,
        apelidoConfirmado: Boolean(d.apelidoId && linha.apelidoConfirmadoEm),
        mensagem: d.mensagem,
        mensagemOculta: d.mensagemOculta,
        criadaEm: d.criadaEm,
        confirmadaEm: d.confirmadaEm,
        previsaoRepasse,
      };
    },

    async estornar(doacaoId, motivo) {
      const [linha] = await db
        .select({ doacao: doacoes, repasseStatus: repasses.status })
        .from(doacoes)
        .leftJoin(repasses, eq(repasses.id, doacoes.repasseId))
        .where(eq(doacoes.id, doacaoId))
        .limit(1);
      // Só estorna o que comprovadamente não saiu: sem repasse, ou com repasse que falhou.
      // Agendado ou enviando pode virar Pix a qualquer momento: estornar seria pagar duas vezes.
      if (!linha || linha.doacao.status !== "confirmada") return false;
      if (linha.repasseStatus !== null && linha.repasseStatus !== "falhou") return false;
      const d = linha.doacao;

      // 1) Reserva: 'estornando' tira a doação do alcance do agrupamento de repasses.
      //    Condicional ao estado lido, para fechar a janela entre a leitura e a reserva.
      const reservadas = await db
        .update(doacoes)
        .set({ status: "estornando", estornoIniciadoEm: agora() })
        .where(
          and(
            eq(doacoes.id, doacaoId),
            eq(doacoes.status, "confirmada"),
            d.repasseId ? eq(doacoes.repasseId, d.repasseId) : isNull(doacoes.repasseId),
          ),
        )
        .returning({ id: doacoes.id });
      if (reservadas.length === 0) return false;

      // 2) Reembolso no provedor. Falha definitiva (ok: false): volta a 'confirmada'.
      //    Exceção (timeout, rede) é ambígua: fica 'estornando', fora do alcance do repasse,
      //    e conciliarEstornos decide depois perguntando ao provedor.
      if (d.provedorPagamentoId) {
        let reembolso: { ok: boolean; erro?: string };
        try {
          reembolso = await provedores.entrada.reembolsar({ idProvedor: d.provedorPagamentoId, valorCentavos: d.valorCentavos });
        } catch (erro) {
          console.error(`[doacoes] reembolso indeterminado em ${doacaoId}:`, erro);
          return false;
        }
        if (!reembolso.ok) {
          console.error(`[doacoes] reembolso falhou em ${doacaoId}: ${reembolso.erro ?? "sem detalhe"}`);
          await reverterEstorno(doacaoId);
          return false;
        }
      }

      // 3) Fecha: estornada + reversões no razão.
      const estornou = await fecharEstorno(d);
      if (estornou) console.info(`[doacoes] estornada ${doacaoId}: ${motivo}`);
      return estornou;
    },

    async listarDoRecebedor(recebedorId) {
      const linhas = await db
        .select({ d: doacoes, repasseStatus: repasses.status })
        .from(doacoes)
        .leftJoin(repasses, eq(repasses.id, doacoes.repasseId))
        .where(and(eq(doacoes.recebedorId, recebedorId), inArray(doacoes.status, ["confirmada", "estornando", "estornada"])))
        .orderBy(desc(doacoes.confirmadaEm), desc(doacoes.numeroComprovante));
      return linhas.map(({ d, repasseStatus }) => ({
        id: d.id,
        status: d.status,
        valorCentavos: d.valorCentavos,
        taxaCentavos: d.taxaCentavos,
        liquidoCentavos: d.liquidoCentavos,
        mensagem: d.mensagem,
        mensagemOculta: d.mensagemOculta,
        apelido: d.apelidoTexto,
        confirmadaEm: d.confirmadaEm,
        repasse: repasseStatus === "concluido" ? ("concluido" as const) : ("pendente" as const),
      }));
    },

    async conciliarEstornos() {
      const limite = new Date(agora().getTime() - CARENCIA_ESTORNO_MIN * 60_000);
      const presas = await db
        .select()
        .from(doacoes)
        .where(and(eq(doacoes.status, "estornando"), lt(doacoes.estornoIniciadoEm, limite)))
        .limit(50);
      let estornadas = 0;
      let revertidas = 0;
      for (const d of presas) {
        if (!d.provedorPagamentoId) {
          if (await fecharEstorno(d)) estornadas++;
          continue;
        }
        const { status } = await provedores.entrada.consultarReembolso({ idProvedor: d.provedorPagamentoId });
        if (status === "concluido") {
          if (await fecharEstorno(d)) estornadas++;
        } else if (status === "falhou" || status === "desconhecido") {
          if (await reverterEstorno(d.id)) revertidas++;
        }
        // "processando": espera a próxima rodada.
      }
      return { estornadas, revertidas };
    },
  };
}
