/**
 * Interfaces dos provedores externos. O domínio só conhece estas assinaturas;
 * as implementações reais (Mercado Pago) entram depois do estrutural.
 */

export type StatusCobranca = "aprovado" | "pendente" | "rejeitado" | "desconhecido";
export type StatusEnvio = "concluido" | "processando" | "falhou";

export interface ProvedorEntrada {
  /** Cria a cobrança no provedor e devolve a URL para onde mandar o doador. */
  criarCobranca(i: {
    refExterna: string;
    valorCentavos: number;
    descricao: string;
    urlRetorno: string;
    expiraEm: Date;
  }): Promise<{ urlPagamento: string; idProvedor: string | null }>;
  /** Consulta a verdade no provedor (nunca confiar só na notificação). */
  consultar(i: { refExterna: string; idProvedor: string | null }): Promise<{
    status: StatusCobranca;
    valorCentavos: number | null;
    idProvedor: string | null;
  }>;
  /** `ok: false` é falha definitiva (nada foi devolvido). Exceção = ambíguo, vai para conciliação. */
  reembolsar(i: { idProvedor: string; valorCentavos: number }): Promise<{ ok: boolean; erro?: string }>;
  /** Conciliação de estorno: "desconhecido" = o provedor não tem reembolso para esse pagamento. */
  consultarReembolso(i: { idProvedor: string }): Promise<{ status: StatusEnvio | "desconhecido" }>;
}

export interface ProvedorSaida {
  enviar(i: { refExterna: string; chavePix: string; valorCentavos: number; descricao: string }): Promise<{
    idProvedor: string;
    status: StatusEnvio;
    chaveInvalida: boolean;
    erro?: string;
  }>;
  /**
   * Conciliação: o que o provedor sabe dessa transferência. "desconhecido" = nunca
   * chegou lá, é seguro reenviar. Consulta por id quando houver, senão pela referência.
   */
  consultar(i: { idProvedor: string | null; refExterna: string }): Promise<{ status: StatusEnvio | "desconhecido" }>;
}

export interface ProvedorEmail {
  enviar(i: { para: string; assunto: string; texto: string; html: string }): Promise<void>;
}

export interface ProvedorCaptcha {
  verificar(token: string | null, ip: string | null): Promise<boolean>;
}

export type Provedores = {
  entrada: ProvedorEntrada;
  saida: ProvedorSaida;
  email: ProvedorEmail;
  captcha: ProvedorCaptcha;
};
