/**
 * Dados fictícios para a demonstração: 70 dias de uso simulados com o relógio andando dia a dia.
 * Tudo passa pelo domínio (cadastro, intenção, webhook falso, repasse, estorno, denúncia), então o
 * razão fecha. Idempotente: se já há recebedores, não faz nada. Determinístico (semente fixa).
 *
 * O que sai: ~50 chaves (ativas, pausadas, removidas, com chave trocada e com chave que não existe),
 * ~300 Pix confirmados com mensagens e apelidos, apelidos confirmados no ranking, repasses diários
 * concluídos, repasses que falharam até a chave virar inválida, Pix devolvidos, intenções expiradas,
 * intenções pendentes agora e mensagens denunciadas.
 */
import { abrirServicos } from "./_ambiente";
import type { FakeEntrada } from "../src/providers/payment-in/fake";

const DIAS = 70;
const DIA_MS = 24 * 60 * 60_000;

// mulberry32: aleatório com semente, para o seed sair igual toda vez
let semente = 0x5eed;
function aleatorio() {
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
function ponderado<T>(pares: readonly (readonly [T, number])[]): T {
  const total = pares.reduce((s, [, p]) => s + p, 0);
  let r = aleatorio() * total;
  for (const [v, p] of pares) if ((r -= p) <= 0) return v;
  return pares[0]![0];
}

const MENSAGENS = [
  "toma, compra um pastel",
  "isso é um teste social",
  "vi seu número e achei bonito",
  "boa sorte aí",
  "não tem motivo, é isso",
  "paga um café e pensa em mim",
  "achei que hoje era seu dia",
  "o universo mandou",
  "aleatoriedade também é carinho",
  "não gasta tudo em figurinha",
  "pra você comprar um pão de queijo",
  "sei lá, deu vontade",
  "recebe e não pergunta",
  "um pix sem cobrança, que milagre",
  "use com moderação",
  "tô testando minha generosidade",
  "você foi sorteado e nem sabia",
  "presente de ninguém pra ninguém",
  "compra uma coxinha e manda foto pra ninguém",
  "hoje eu acordei rico de espírito",
  "dinheiro de esquina",
  "isso não é golpe, é carinho",
  "meu signo mandou eu fazer isso",
  "vai que volta em dobro",
  "pra inteirar o aluguel do gato",
  "achei na rua e passei pra frente",
  "a vida é curta, o pix é rápido",
  "segue o baile",
  "só pra ver sua cara de confuso",
  "bom dia, boa tarde ou boa noite",
];
const DENUNCIAVEIS = ["me chama no privado, gatinho", "segue meu perfil lá", "esse dinheiro é sujo kkk"];
const APELIDOS_CONFIRMADOS = [
  "pastel_de_vento",
  "tia_do_zap",
  "anonimo_famoso",
  "sorte_grande",
  "rei_do_pix",
  "mao_aberta",
  "capivara_rica",
  "cafe_com_leite",
  "dona_moeda",
  "pixzeiro",
  "mecenas_do_nada",
  "chuva_de_real",
  "o_generoso",
  "baleia_azul",
  "trocado_feliz",
  "bolso_furado",
];
// usados no formulário, mas o dono nunca confirmou o e-mail: aparecem no comprovante, não no ranking
const APELIDOS_SEM_CONFIRMAR = ["joao_sem_mail", "talvez_eu", "fantasma_123", "quem_sabe"];
// alguns doadores mandam muito mais: o ranking precisa de topo
const BALEIAS = new Set(["baleia_azul", "rei_do_pix", "mecenas_do_nada"]);

const VALORES: readonly (readonly [string, number])[] = [
  ["5", 40],
  ["7,77", 4],
  ["10", 20],
  ["13", 3],
  ["15", 6],
  ["20", 12],
  ["25", 4],
  ["50", 6],
  ["69", 2],
  ["100", 2],
  ["250", 0.6],
  ["500", 0.3],
];
const VALORES_BALEIA: readonly (readonly [string, number])[] = [
  ["50", 4],
  ["100", 4],
  ["200", 2],
  ["500", 1],
];

function uuidFalso(i: number, prefixo?: string): string {
  const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");
  return `${prefixo ?? hex(0x5eed0000 + i, 8)}-${hex(1000 + i, 4)}-4${hex(i, 3)}-8${hex((i * 7) % 4096, 3)}-${hex(0x100000000000 + i * 99991, 12)}`;
}

async function main() {
  const fim = new Date();
  const relogio = { agora: new Date(fim.getTime() - DIAS * DIA_MS) };
  const s = abrirServicos({ agora: () => relogio.agora });
  const { recebedores: tRecebedores, apelidos, doacoes } = await import("../src/infra/db/schema");
  const { eq, and, isNull, inArray } = await import("drizzle-orm");
  const { hmacHex, cifrar } = await import("../src/infra/crypto");

  try {
    const existentes = await s.recebedores.listarPublico({ ordem: "recentes", limite: 1, pagina: 1 });
    if (existentes.total > 0) {
      console.log(`já há ${existentes.total} recebedores; seed não faz nada.`);
      return;
    }
    const entrada = s.provedores.entrada as FakeEntrada;

    type R = { id: string; numero: number; token: string; peso: number; papel: string };
    const ativos: R[] = [];
    const todos: R[] = [];
    const conta = { cadastros: 0, confirmadas: 0, expiradas: 0, denuncias: 0 };

    async function cadastrar(i: number, papel = "normal", prefixo?: string) {
      const r = await s.recebedores.cadastrar(uuidFalso(i, prefixo));
      if (!r.ok) throw new Error(`cadastro ${i}: ${r.motivo}`);
      const pub = await s.recebedores.buscarPublico(r.numeroPublico);
      const rec = { id: pub!.id, numero: r.numeroPublico, token: r.token, peso: 0.3 + aleatorio() * (aleatorio() < 0.15 ? 4 : 1), papel };
      ativos.push(rec);
      todos.push(rec);
      conta.cadastros++;
      return rec;
    }

    async function doar(rec: R) {
      const apelido = aleatorio() < 0.5 ? "" : aleatorio() < 0.88 ? escolher(APELIDOS_CONFIRMADOS) : escolher(APELIDOS_SEM_CONFIRMAR);
      const valor = BALEIAS.has(apelido) ? ponderado(VALORES_BALEIA) : ponderado(VALORES);
      const denunciavel = aleatorio() < 0.012;
      const mensagem = denunciavel ? escolher(DENUNCIAVEIS) : aleatorio() < 0.62 ? escolher(MENSAGENS) : "";
      let r = await s.doacoes.criarIntencao({ numeroPublico: rec.numero, valorTexto: valor, mensagem, apelido, apelidoIdDoCookie: null });
      if (!r.ok) r = await s.doacoes.criarIntencao({ numeroPublico: rec.numero, valorTexto: valor, mensagem: "", apelido: "", apelidoIdDoCookie: null });
      if (!r.ok) throw new Error(`intenção para #${rec.numero}: ${r.motivo}`);
      if (aleatorio() < 0.05) return; // nunca pagou: vira "expirada" no cron
      entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
      const res = await s.doacoes.processarNotificacao({
        provedor: "fake",
        idExterno: `seed_${r.doacaoId}`,
        refExterna: `doa_${r.doacaoId}`,
        idProvedor: `fake_pg_doa_${r.doacaoId}`,
        payload: { seed: true },
      });
      if (res.resultado === "confirmada") conta.confirmadas++;
      if (denunciavel && res.resultado === "confirmada") {
        await s.apelidos.denunciar(r.doacaoId, "mensagem estranha");
        conta.denuncias++;
      }
    }

    function sortearRecebedor(): R {
      const total = ativos.reduce((t, r) => t + r.peso, 0);
      let x = aleatorio() * total;
      for (const r of ativos) if ((x -= r.peso) <= 0) return r;
      return ativos[0]!;
    }

    // Dia zero: os primeiros da roda, mais as duas chaves "problemáticas" do provedor falso de repasse.
    let indice = 1;
    for (; indice <= 8; indice++) await cadastrar(indice);
    const instavel = await cadastrar(indice++, "instável", "ffffffff"); // repasse falha sempre até virar inválida
    const inexistente = await cadastrar(indice++, "inexistente", "00000000"); // banco diz que a chave não existe

    for (let dia = 0; dia < DIAS; dia++) {
      const inicioDia = fim.getTime() - (DIAS - dia) * DIA_MS;
      // a roda cresce: novas chaves quase todo dia, mais no fim
      const novas = aleatorio() < 0.35 + dia / 140 ? 1 + Math.floor(aleatorio() * (1 + dia / 35)) : 0;
      for (let k = 0; k < novas; k++) {
        relogio.agora = new Date(inicioDia + aleatorio() * DIA_MS * 0.5);
        await cadastrar(indice++);
      }

      // Pix do dia, crescendo com o boca a boca
      const quantos = Math.round(1 + dia * 0.07 + aleatorio() * 3);
      const horarios = Array.from({ length: quantos }, () => inicioDia + (8 + aleatorio() * 15) * 60 * 60_000).sort((a, b) => a - b);
      for (const h of horarios) {
        relogio.agora = new Date(Math.min(h, fim.getTime() - 60 * 60_000));
        await doar(sortearRecebedor());
      }

      // Acontecimentos na vida das chaves
      if (dia === 20) {
        for (const r of ativos.slice(2, 4)) await s.recebedores.pausar(r.id);
        ativos.splice(2, 2);
      }
      if (dia === 31) {
        const r = todos[2]!;
        await s.recebedores.reativar(r.id);
        ativos.push(r);
      }
      if (dia === 38) {
        const r = ativos.splice(5, 1)[0]!;
        await s.recebedores.remover(r.id);
      }
      if (dia === 45) {
        const r = ativos[6]!;
        const t = await s.recebedores.trocarChave(r.id, uuidFalso(9000));
        if (t.ok) await s.recebedores.marcarAtiva(r.id);
      }

      // Cron das 13h UTC: expira, agrupa e envia, com as retentativas da tarde
      relogio.agora = new Date(Math.floor(inicioDia / DIA_MS) * DIA_MS + DIA_MS + 13 * 60 * 60_000);
      if (relogio.agora.getTime() > fim.getTime()) continue;
      conta.expiradas += await s.doacoes.expirarIntencoes();
      await s.repasses.agendarTodos();
      for (let rodada = 0; rodada < 7; rodada++) {
        await s.repasses.processarAgendados();
        relogio.agora = new Date(relogio.agora.getTime() + 35 * 60_000);
      }
      for (const r of [instavel, inexistente]) {
        const i = ativos.indexOf(r);
        const priv = await s.recebedores.buscarPorToken(r.token);
        if (i >= 0 && priv?.status === "invalida") ativos.splice(i, 1);
      }
    }

    // Fim da simulação: devolve o que ficou preso em chave inválida há mais de 30 dias
    relogio.agora = new Date(fim.getTime() - 5 * 60_000);
    conta.expiradas += await s.doacoes.expirarIntencoes();
    const devolvidas = await s.repasses.devolverRetidos(30);
    relogio.agora = new Date(fim.getTime());
    const estornos = await s.doacoes.conciliarEstornos();

    // Dois Pix sendo pagos agora: o comprovante mostra "aguardando"
    for (const r of ativos.slice(0, 2)) {
      await s.doacoes.criarIntencao({ numeroPublico: r.numero, valorTexto: "10", mensagem: "pagando agorinha", apelido: "", apelidoIdDoCookie: null });
    }

    // Apelidos confirmados: simula o link mágico de cada um e liga os Pix que usaram o nome
    for (const nome of APELIDOS_CONFIRMADOS) {
      const email = `${nome}@exemplo.test`;
      const [a] = await s.db
        .insert(apelidos)
        .values({
          nome,
          emailHash: await hmacHex(email, s.segredos.segredoHmac),
          emailCifrado: await cifrar(email, s.segredos.chaveCifra),
          confirmadoEm: new Date(fim.getTime() - DIAS * DIA_MS),
          criadoEm: new Date(fim.getTime() - DIAS * DIA_MS),
        })
        .returning();
      await s.db.update(doacoes).set({ apelidoId: a!.id }).where(and(eq(doacoes.apelidoTexto, nome), isNull(doacoes.apelidoId)));
    }

    const porStatus = await s.db.select({ status: doacoes.status, id: doacoes.id }).from(doacoes);
    const contagem = porStatus.reduce<Record<string, number>>((c, d) => ((c[d.status] = (c[d.status] ?? 0) + 1), c), {});
    const estados = await s.db
      .select({ status: tRecebedores.status })
      .from(tRecebedores)
      .where(inArray(tRecebedores.id, todos.map((t) => t.id)));
    const porEstado = estados.reduce<Record<string, number>>((c, d) => ((c[d.status] = (c[d.status] ?? 0) + 1), c), {});

    console.log(`chaves: ${conta.cadastros} ${JSON.stringify(porEstado)}`);
    console.log(`pix: ${JSON.stringify(contagem)}`);
    console.log(`denúncias: ${conta.denuncias}; devolvidas por chave inválida: ${devolvidas}; estornos conciliados: ${JSON.stringify(estornos)}`);
    const popular = [...todos].sort((a, b) => b.peso - a.peso)[0]!;
    const fmt = (n: number) => String(n).padStart(4, "0");
    console.log(`link secreto de um popular (anônimo #${fmt(popular.numero)}): ${s.urlPublica}/k/${popular.token}`);
    console.log(`link secreto da chave que não existe (anônimo #${fmt(inexistente.numero)}): ${s.urlPublica}/k/${inexistente.token}`);
  } finally {
    await s.fecharTudo();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
