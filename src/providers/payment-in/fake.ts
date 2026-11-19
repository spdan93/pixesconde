import type { ProvedorEntrada, StatusCobranca } from "../tipos";

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

  async consultar(i: Parameters<ProvedorEntrada["consultar"]>[0]) {
    const c = this.cobrancas.get(i.refExterna);
    if (!c) return { status: "desconhecido" as const, valorCentavos: null, idProvedor: null };
    return { status: c.status, valorCentavos: c.valorCentavos, idProvedor: c.idProvedor };
  }

  async reembolsar(i: { idProvedor: string; valorCentavos: number }) {
    this.reembolsos.push(i);
    return { ok: true };
  }
}
