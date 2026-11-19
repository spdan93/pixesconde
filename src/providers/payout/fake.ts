import type { ProvedorSaida, StatusEnvio } from "../tipos";

/**
 * Provedor de saída falso. Chave começando com 00000000 = inválida (definitivo);
 * começando com ffffffff = falha transitória; qualquer outra conclui na hora.
 */
export class FakeSaida implements ProvedorSaida {
  readonly envios: { refExterna: string; chavePix: string; valorCentavos: number; descricao: string }[] = [];
  private readonly estados = new Map<string, StatusEnvio>();

  async enviar(i: { refExterna: string; chavePix: string; valorCentavos: number; descricao: string }) {
    this.envios.push(i);
    const idProvedor = `fake_${i.refExterna}`;
    if (i.chavePix.startsWith("00000000")) {
      this.estados.set(idProvedor, "falhou");
      return { idProvedor, status: "falhou" as const, chaveInvalida: true, erro: "chave não encontrada no Bacen" };
    }
    if (i.chavePix.startsWith("ffffffff")) {
      this.estados.set(idProvedor, "falhou");
      return { idProvedor, status: "falhou" as const, chaveInvalida: false, erro: "instabilidade no provedor" };
    }
    this.estados.set(idProvedor, "concluido");
    return { idProvedor, status: "concluido" as const, chaveInvalida: false };
  }

  async consultar(idProvedor: string) {
    return { status: this.estados.get(idProvedor) ?? ("falhou" as const) };
  }
}
