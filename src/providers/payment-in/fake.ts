import type { ProvedorEntrada, StatusCobranca, StatusEnvio } from "../tipos";

type Cobranca = { valorCentavos: number; status: StatusCobranca; idProvedor: string };

/**
 * Provedor de entrada para desenvolvimento e testes. A "página de pagamento" é
 * a rota /dev/pagar/:ref, que marca o resultado e dispara o webhook falso.
 */
export class FakeEntrada implements ProvedorEntrada {
  readonly cobrancas = new Map<string, Cobranca>();
  readonly reembolsos: { idProvedor: string; valorCentavos: number }[] = [];

  constructor(private readonly urlPublica: string) {}

  async criarCobranca(i: Parameters<ProvedorEntrada["criarCobranca"]>[0]) {
    const idProvedor = `fake_pg_${i.refExterna}`;
    this.cobrancas.set(i.refExterna, { valorCentavos: i.valorCentavos, status: "pendente", idProvedor });
    return { urlPagamento: `${this.urlPublica}/dev/pagar/${i.refExterna}`, idProvedor };
  }

  /** Usado pela rota de dev: define o que `consultar` vai responder. */
  marcarResultado(refExterna: string, status: StatusCobranca, valorCentavos?: number) {
    const atual = this.cobrancas.get(refExterna);
    this.cobrancas.set(refExterna, {
      valorCentavos: valorCentavos ?? atual?.valorCentavos ?? 0,
      status,
      idProvedor: atual?.idProvedor ?? `fake_pg_${refExterna}`,
    });
  }

  private excecaoConsulta: Error | null = null;

  /** Simula o provedor fora do ar no meio do processamento de um webhook. */
  lancarNaProximaConsulta(erro: Error) {
    this.excecaoConsulta = erro;
  }

  async consultar(i: Parameters<ProvedorEntrada["consultar"]>[0]) {
    if (this.excecaoConsulta) {
      const e = this.excecaoConsulta;
      this.excecaoConsulta = null;
      throw e;
    }
    const c = this.cobrancas.get(i.refExterna);
    if (!c) return { status: "desconhecido" as const, valorCentavos: null, idProvedor: null };
    return { status: c.status, valorCentavos: c.valorCentavos, idProvedor: c.idProvedor };
  }

  private erroReembolso: string | null = null;
  private excecaoReembolso: Error | null = null;
  private readonly consultasReembolso = new Map<string, StatusEnvio | "desconhecido">();

  /** Falha definitiva: o provedor responde que não reembolsou. */
  falharProximoReembolso(erro: string) {
    this.erroReembolso = erro;
  }

  /** Falha ambígua: a chamada estoura (timeout, rede). */
  lancarNoProximoReembolso(erro: Error) {
    this.excecaoReembolso = erro;
  }

  definirConsultaReembolso(idProvedor: string, status: StatusEnvio | "desconhecido") {
    this.consultasReembolso.set(idProvedor, status);
  }

  async reembolsar(i: { idProvedor: string; valorCentavos: number }) {
    if (this.excecaoReembolso) {
      const e = this.excecaoReembolso;
      this.excecaoReembolso = null;
      throw e;
    }
    if (this.erroReembolso) {
      const erro = this.erroReembolso;
      this.erroReembolso = null;
      return { ok: false, erro };
    }
    this.reembolsos.push(i);
    this.consultasReembolso.set(i.idProvedor, "concluido");
    return { ok: true };
  }

  async consultarReembolso(i: { idProvedor: string }) {
    return { status: this.consultasReembolso.get(i.idProvedor) ?? ("desconhecido" as const) };
  }
}
