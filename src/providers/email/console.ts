import type { ProvedorEmail } from "../tipos";

/** Em dev e teste, o e-mail vai para o console e fica guardado para inspeção. */
export class ConsoleEmail implements ProvedorEmail {
  readonly enviados: { para: string; assunto: string; texto: string; html: string }[] = [];

  constructor(private readonly silencioso = false) {}

  async enviar(i: { para: string; assunto: string; texto: string; html: string }) {
    this.enviados.push(i);
    if (!this.silencioso) console.log(`[email] para ${i.para}: ${i.assunto}\n${i.texto}`);
  }
}
