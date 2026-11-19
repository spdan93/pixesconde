import type { Provedores } from "./tipos";
import { FakeEntrada } from "./payment-in/fake";
import { FakeSaida } from "./payout/fake";
import { ConsoleEmail } from "./email/console";
import { CaptchaSempreOk } from "./captcha/sempre-ok";

export type { Provedores, ProvedorEntrada, ProvedorSaida, ProvedorEmail, ProvedorCaptcha } from "./tipos";

export type EnvProvedores = {
  PROVEDOR_PAGAMENTO: string;
  PROVEDOR_REPASSE: string;
  URL_PUBLICA: string;
};

/** Escolhe as implementações pelas variáveis de ambiente. Só "fake" existe nesta fase. */
export function criarProvedores(env: EnvProvedores, opts: { silencioso?: boolean } = {}): Provedores {
  return {
    entrada: escolherEntrada(env),
    saida: escolherSaida(env),
    email: new ConsoleEmail(opts.silencioso),
    captcha: new CaptchaSempreOk(),
  };
}

function escolherEntrada(env: EnvProvedores) {
  switch (env.PROVEDOR_PAGAMENTO) {
    case "fake":
      return new FakeEntrada(env.URL_PUBLICA);
    case "mercadopago":
      throw new Error("PROVEDOR_PAGAMENTO=mercadopago: não implementado nesta fase (ver spec, seção 9)");
    default:
      throw new Error(`PROVEDOR_PAGAMENTO desconhecido: ${env.PROVEDOR_PAGAMENTO}`);
  }
}

function escolherSaida(env: EnvProvedores) {
  switch (env.PROVEDOR_REPASSE) {
    case "fake":
      return new FakeSaida();
    case "mercadopago":
      throw new Error("PROVEDOR_REPASSE=mercadopago: não implementado nesta fase (ver spec, seção 9)");
    default:
      throw new Error(`PROVEDOR_REPASSE desconhecido: ${env.PROVEDOR_REPASSE}`);
  }
}
