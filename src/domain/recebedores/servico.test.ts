import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarDbTeste } from "@/infra/db/teste";
import type { Db } from "@/infra/db/client";
import { criarServicoRecebedores, type ServicoRecebedores } from "./servico";
import { doacoes, recebedores } from "@/infra/db/schema";
import { eq } from "drizzle-orm";

const SEGREDOS = {
  chaveCifra: "wJ1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0a=",
  segredoHmac: "Zz1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0b=",
};

const UUID_A = "7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93";
const UUID_B = "11111111-2222-4333-8444-555555555555";
const UUID_C = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UUID_D = "01234567-89ab-4cde-8f01-23456789abcd";

let db: Db;
let fechar: () => Promise<void>;
let servico: ServicoRecebedores;

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
  servico = criarServicoRecebedores(db, SEGREDOS);
});

afterAll(async () => {
  await fechar();
});

async function doacaoConfirmada(recebedorId: string, valor: number, mensagem: string | null, apelido: string | null) {
  await db.insert(doacoes).values({
    recebedorId,
    valorCentavos: valor,
    taxaBp: 1000,
    taxaCentavos: Math.round(valor / 10),
    liquidoCentavos: valor - Math.round(valor / 10),
    mensagem,
    apelidoTexto: apelido,
    status: "confirmada",
    refExterna: `doa_${crypto.randomUUID()}`,
    expiraEm: new Date(),
    confirmadaEm: new Date(),
  });
}

describe("cadastrar", () => {
  test("devolve número público e token, e o token encontra o recebedor", async () => {
    const r = await servico.cadastrar(UUID_A);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.numeroPublico).toBe(1);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const privado = await servico.buscarPorToken(r.token);
    expect(privado?.numeroPublico).toBe(1);
    expect(privado?.status).toBe("aguardando_validacao");
    expect(privado?.chaveMascarada).toBe("7f3a9c2e-••••-••••-••••-c21e5a6b0d93");
  });

  test("a mesma chave não entra duas vezes", async () => {
    expect(await servico.cadastrar(UUID_A.toUpperCase())).toEqual({ ok: false, motivo: "duplicada" });
  });

  test("CPF é recusado com o motivo", async () => {
    expect(await servico.cadastrar("123.456.789-09")).toEqual({ ok: false, motivo: "cpf" });
  });

  test("token errado não encontra nada", async () => {
    expect(await servico.buscarPorToken("nao-existe")).toBeNull();
  });
});

describe("lista pública e sorteio", () => {
  test("sem elegíveis além das aguardando, sortear devolve uma delas", async () => {
    expect(await servico.sortear()).toBe(1);
  });

  test("lista não mostra pausada nem removida", async () => {
    const b = await servico.cadastrar(UUID_B);
    const c = await servico.cadastrar(UUID_C);
    if (!b.ok || !c.ok) throw new Error("setup");
    const privB = await servico.buscarPorToken(b.token);
    const privC = await servico.buscarPorToken(c.token);
    await servico.pausar(privB!.id);
    await servico.remover(privC!.id);
    const lista = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    expect(lista.total).toBe(1);
    expect(lista.itens.map((i) => i.numeroPublico)).toEqual([1]);
    await servico.reativar(privB!.id);
    const depois = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    expect(depois.itens.map((i) => i.numeroPublico)).toEqual([2, 1]);
  });

  test("estatísticas públicas consideram só doações confirmadas", async () => {
    const um = await servico.buscarPublico(1);
    expect(um).toMatchObject({ numeroPublico: 1, totalRecebidoCentavos: 0, quantidadePix: 0, ultimaMensagem: null });
    expect((await servico.cadastrar(UUID_D)).ok).toBe(true);
    const todos = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    const id1 = todos.itens.find((i) => i.numeroPublico === 1)!.id;
    await doacaoConfirmada(id1, 500, "toma, compra um pastel", "pastel_de_vento");
    await doacaoConfirmada(id1, 2000, null, null);
    const depois = await servico.buscarPublico(1);
    expect(depois?.totalRecebidoCentavos).toBe(2500);
    expect(depois?.quantidadePix).toBe(2);
    expect(depois?.ultimaMensagem?.texto).toBe("toma, compra um pastel");
    expect(depois?.ultimaMensagem?.apelido).toBe("pastel_de_vento");
  });

  test("ordenações", async () => {
    const mais = await servico.listarPublico({ ordem: "mais_receberam", limite: 10, pagina: 1 });
    expect(mais.itens[0]!.numeroPublico).toBe(1);
    const menos = await servico.listarPublico({ ordem: "menos_receberam", limite: 10, pagina: 1 });
    expect(menos.itens.at(-1)!.numeroPublico).toBe(1);
  });

  test("sorteio cobre todos os elegíveis", async () => {
    const vistos = new Set<number>();
    for (let i = 0; i < 200; i++) vistos.add((await servico.sortear())!);
    const elegiveis = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    expect([...vistos].sort()).toEqual(elegiveis.itens.map((i) => i.numeroPublico).sort());
  });

  test("sortear sem elegíveis devolve null", async () => {
    const todos = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    for (const r of todos.itens) await servico.pausar(r.id);
    expect(await servico.sortear()).toBeNull();
    for (const r of todos.itens) await servico.reativar(r.id);
  });
});

describe("troca de chave", () => {
  test("trocar para chave ativa de outro recebedor é recusado", async () => {
    const lista = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    const id2 = lista.itens.find((i) => i.numeroPublico === 2)!.id;
    expect(await servico.trocarChave(id2, UUID_A)).toEqual({ ok: false, motivo: "duplicada" });
  });

  test("troca válida desativa a anterior e volta a aguardar validação", async () => {
    const lista = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    const id2 = lista.itens.find((i) => i.numeroPublico === 2)!.id;
    await servico.marcarInvalida(id2);
    const nova = "99999999-8888-4777-8666-555555555555";
    expect(await servico.trocarChave(id2, nova)).toEqual({ ok: true, chave: nova });
    const decifrada = await servico.obterChaveDecifrada(id2);
    expect(decifrada?.chave).toBe(nova);
    const publico = await servico.buscarPublico(2);
    expect(publico?.status).toBe("aguardando_validacao");
    // a chave antiga ficou livre
    const lista2 = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    const id1 = lista2.itens.find((i) => i.numeroPublico === 1)!.id;
    await servico.remover(id1);
    expect((await servico.cadastrar(UUID_B)).ok).toBe(true);
  });

  test("obterChaveDecifrada devolve a chave original do recebedor 1", async () => {
    const lista = await servico.listarPublico({ ordem: "recentes", limite: 10, pagina: 1 });
    const id = lista.itens.find((i) => i.numeroPublico === 4)!.id;
    expect((await servico.obterChaveDecifrada(id))?.chave).toBe(UUID_D);
  });
});

describe("revisão final", () => {
  test("I4: trocar a chave de um recebedor pausado não o recoloca na roda", async () => {
    const r = await servico.cadastrar("12121212-04b1-4d8a-9f27-c21e5a6b0d93");
    if (!r.ok) throw new Error("setup");
    const priv = await servico.buscarPorToken(r.token);
    await servico.pausar(priv!.id);
    expect((await servico.trocarChave(priv!.id, "13131313-04b1-4d8a-9f27-c21e5a6b0d93")).ok).toBe(true);
    expect((await servico.buscarPorToken(r.token))!.status).toBe("pausada");
    // inválido volta a aguardar validação
    await servico.marcarInvalida(priv!.id);
    await servico.trocarChave(priv!.id, "14141414-04b1-4d8a-9f27-c21e5a6b0d93");
    expect((await servico.buscarPorToken(r.token))!.status).toBe("aguardando_validacao");
  });
});

describe("relógio injetado", () => {
  test("cadastro e mudança de status usam o relógio do serviço, não o do sistema", async () => {
    const quando = new Date("2026-01-02T03:04:05Z");
    const comRelogio = criarServicoRecebedores(db, SEGREDOS, () => quando);
    const r = await comRelogio.cadastrar("cafecafe-04b1-4d8a-9f27-c21e5a6b0d93");
    if (!r.ok) throw new Error("setup");
    const pub = await comRelogio.buscarPublico(r.numeroPublico);
    await comRelogio.marcarInvalida(pub!.id);
    const [linha] = await db.select().from(recebedores).where(eq(recebedores.id, pub!.id));
    expect(linha!.criadoEm).toEqual(quando);
    expect(linha!.atualizadoEm).toEqual(quando);
    expect(linha!.invalidaDesde).toEqual(quando);
  });
});
