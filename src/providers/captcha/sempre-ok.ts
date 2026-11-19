import type { ProvedorCaptcha } from "../tipos";

/** Dev e teste: aceita tudo. Em produção entra o Turnstile. */
export class CaptchaSempreOk implements ProvedorCaptcha {
  async verificar() {
    return true;
  }
}

/** Para testar o caminho de recusa. */
export class CaptchaSempreNao implements ProvedorCaptcha {
  async verificar() {
    return false;
  }
}
