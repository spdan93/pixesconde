/**
 * Dados fictícios para as telas não nascerem vazias. Idempotente: se já há recebedores, não faz nada.
 * Passa pelo domínio (cadastro, intenção, webhook falso, repasse), então o razão fecha.
 */
import { abrirServicos } from "./_ambiente";
import type { FakeEntrada } from "../src/providers/payment-in/fake";

const MENSAGENS = [
  "toma, compra um pastel",
  "isso é um teste social",
  "vi seu número e achei bonito",
  "boa sorte aí",
  "não tem motivo, é isso",
  "paga um café e pensa em mim",
  "achei que hoje era seu dia",
  null,
  null,
  "o universo mandou",
  "aleatoriedade também é carinho",
  null,
];
const APELIDOS = ["pastel_de_vento", "tia_do_zap", "anonimo_famoso", "", "", "", "sorte_grande", ""];
const VALORES = ["5", "5", "10", "5", "20", "5", "50", "5", "15", "5", "10", "5"];

function uuidFalso(i: number): string {
  const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");
  return `${hex(0x5eed0000 + i, 8)}-${hex(1000 + i, 4)}-4${hex(i, 3)}-8${hex(i * 7, 3)}-${hex(0x100000000000 + i * 99991, 12)}`;
}

async function main() {
  const s = abrirServicos();
  try {
    const existentes = await s.recebedores.listarPublico({ ordem: "recentes", limite: 1, pagina: 1 });
    if (existentes.total > 0) {
      console.log(`já há ${existentes.total} recebedores; seed não faz nada.`);
      return;
    }
    const numeros: number[] = [];
    for (let i = 1; i <= 12; i++) {
      const r = await s.recebedores.cadastrar(uuidFalso(i));
      if (!r.ok) throw new Error(`cadastro ${i}: ${r.motivo}`);
      numeros.push(r.numeroPublico);
      if (i === 1) console.log(`link secreto do anônimo #${String(r.numeroPublico).padStart(4, "0")}: ${s.urlPublica}/k/${r.token}`);
    }

    const entrada = s.provedores.entrada as FakeEntrada;
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const numero = numeros[i % 7]!; // os 5 últimos ficam sem nada, para a lista ter "ninguém mandou"
      const r = await s.doacoes.criarIntencao({
        numeroPublico: numero,
        valorTexto: VALORES[i % VALORES.length]!,
        mensagem: MENSAGENS[i % MENSAGENS.length] ?? "",
        apelido: APELIDOS[i % APELIDOS.length]!,
        apelidoIdDoCookie: null,
      });
      if (!r.ok) throw new Error(`intenção ${i}: ${r.motivo}`);
      entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
      const res = await s.doacoes.processarNotificacao({
        provedor: "fake",
        idExterno: `seed_${r.doacaoId}`,
        refExterna: `doa_${r.doacaoId}`,
        idProvedor: `fake_pg_doa_${r.doacaoId}`,
        payload: { seed: true },
      });
      if (res.resultado === "confirmada") n++;
    }
    console.log(`${n} doações confirmadas`);

    // Confirma três apelidos direto no banco do domínio (sem e-mail de verdade): simula o link mágico.
    const { apelidos, doacoes } = await import("../src/infra/db/schema");
    const { eq, and, isNull } = await import("drizzle-orm");
    const { hmacHex, cifrar } = await import("../src/infra/crypto");
    for (const nome of ["pastel_de_vento", "tia_do_zap", "sorte_grande"]) {
      const email = `${nome}@exemplo.test`;
      const [a] = await s.db
        .insert(apelidos)
        .values({ nome, emailHash: await hmacHex(email, s.segredos.segredoHmac), emailCifrado: await cifrar(email, s.segredos.chaveCifra), confirmadoEm: new Date() })
        .returning();
      await s.db.update(doacoes).set({ apelidoId: a!.id }).where(and(eq(doacoes.apelidoTexto, nome), isNull(doacoes.apelidoId)));
    }

    // Dois repasses concluídos, para a página secreta ter histórico.
    for (const numero of numeros.slice(0, 2)) {
      const pub = await s.recebedores.buscarPublico(numero);
      await s.repasses.agendarParaRecebedor(pub!.id);
    }
    const r = await s.repasses.processarAgendados();
    console.log(`repasses: ${JSON.stringify(r)}`);
  } finally {
    await s.fecharTudo();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
