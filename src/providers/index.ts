import type { Provedores } from "./tipos";
import { FakeEntrada } from "./payment-in/fake";
import { FakeSaida } from "./payout/fake";
import { ConsoleEmail } from "./email/console";
import { CaptchaSempreOk } from "./captcha/sempre-ok";

export type { Provedores, ProvedorEntrada, ProvedorSaida, ProvedorEmail, ProvedorCaptcha } from "./tipos";

export type EnvProvedores = {
  PROVEDOR_PAGAMENTO: string;
  PROVEDOR_REPASSE: string;
  PROVEDOR_EMAIL?: string;
  PROVEDOR_CAPTCHA?: string;
  URL_PUBLICA: string;
};

/** Escolhe as implementações pelas variáveis de ambiente. Só os de desenvolvimento existem nesta fase. */
export function criarProvedores(env: EnvProvedores, opts: { silencioso?: boolean } = {}): Provedores {
  return {
    entrada: escolherEntrada(env),
    saida: escolherSaida(env),
    email: escolherEmail(env, opts.silencioso),
    captcha: escolherCaptcha(env),
  };
}

function escolherEmail(env: EnvProvedores, silencioso?: boolean) {
  switch (env.PROVEDOR_EMAIL ?? "console") {
    case "console":
      return new ConsoleEmail(silencioso);
    case "resend":
      throw new Error("PROVEDOR_EMAIL=resend: não implementado nesta fase (ver spec, seção 9)");
    default:
      throw new Error(`PROVEDOR_EMAIL desconhecido: ${env.PROVEDOR_EMAIL}`);
  }
}

function escolherCaptcha(env: EnvProvedores) {
  switch (env.PROVEDOR_CAPTCHA ?? "sempre-ok") {
    case "sempre-ok":
      return new CaptchaSempreOk();
    case "turnstile":
      throw new Error("PROVEDOR_CAPTCHA=turnstile: não implementado nesta fase (ver spec, seção 9)");
    default:
      throw new Error(`PROVEDOR_CAPTCHA desconhecido: ${env.PROVEDOR_CAPTCHA}`);
  }
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
