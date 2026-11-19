import type { ProvedorEmail } from "../tipos";

/**
 * Em dev e teste, o e-mail vai para o console e fica guardado para inspeção.
 * Com `redigir` (URL pública https, ou seja, a demonstração no ar), o log leva só o
 * assunto: destinatário e corpo, que tem o link mágico, não podem parar nos logs.
 */
export class ConsoleEmail implements ProvedorEmail {
  readonly enviados: { para: string; assunto: string; texto: string; html: string }[] = [];

  constructor(
    private readonly silencioso = false,
    private readonly redigir = false,
  ) {}

  async enviar(i: { para: string; assunto: string; texto: string; html: string }) {
    this.enviados.push(i);
    if (this.silencioso) return;
    if (this.redigir) console.log(`[email] não enviado (demonstração): ${i.assunto}`);
    else console.log(`[email] para ${i.para}: ${i.assunto}\n${i.texto}`);
  }
}
