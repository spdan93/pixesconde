import type { ProvedorSaida, StatusEnvio } from "../tipos";

type StatusConsulta = StatusEnvio | "desconhecido";

/**
 * Provedor de saída falso. Chave começando com 00000000 = inválida (definitivo);
 * começando com ffffffff = falha transitória; qualquer outra conclui na hora.
 * `lancarNoProximoEnvio` simula um erro ambíguo (timeout) e `definirConsulta`
 * controla o que a conciliação vê.
 */
export class FakeSaida implements ProvedorSaida {
  readonly envios: { refExterna: string; chavePix: string; valorCentavos: number; descricao: string }[] = [];
  private readonly porRef = new Map<string, StatusConsulta>();
  private erroPendente: Error | null = null;

  lancarNoProximoEnvio(erro: Error) {
    this.erroPendente = erro;
  }

  definirConsulta(refExterna: string, status: StatusConsulta) {
    this.porRef.set(refExterna, status);
  }

  async enviar(i: { refExterna: string; chavePix: string; valorCentavos: number; descricao: string }) {
    if (this.erroPendente) {
      const erro = this.erroPendente;
      this.erroPendente = null;
      throw erro;
    }
    this.envios.push(i);
    const idProvedor = `fake_${i.refExterna}`;
    if (i.chavePix.startsWith("00000000")) {
      this.porRef.set(i.refExterna, "falhou");
      return { idProvedor, status: "falhou" as const, chaveInvalida: true, erro: "chave não encontrada no Bacen" };
    }
    if (i.chavePix.startsWith("ffffffff")) {
      this.porRef.set(i.refExterna, "falhou");
      return { idProvedor, status: "falhou" as const, chaveInvalida: false, erro: "instabilidade no provedor" };
    }
    this.porRef.set(i.refExterna, "concluido");
    return { idProvedor, status: "concluido" as const, chaveInvalida: false };
  }

  async consultar(i: { idProvedor: string | null; refExterna: string }) {
    return { status: this.porRef.get(i.refExterna) ?? ("desconhecido" as const) };
  }
}
