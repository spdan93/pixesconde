import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, formulario, requisicao, type ContextoTeste } from "~/teste/contexto";
import type { FakeEntrada } from "@/providers/payment-in/fake";
import { action, loader } from "./k";

let t: ContextoTeste;
let token: string;
let numero: number;

async function doar(valorTexto: string, mensagem: string, apelido: string) {
  const r = await t.servicos.doacoes.criarIntencao({ numeroPublico: numero, valorTexto, mensagem, apelido, apelidoIdDoCookie: null });
  if (!r.ok) throw new Error("setup");
  (t.servicos.provedores.entrada as FakeEntrada).marcarResultado(`doa_${r.doacaoId}`, "aprovado");
  await t.servicos.doacoes.processarNotificacao({ provedor: "fake", idExterno: `evt_${r.doacaoId}`, refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
  return r.doacaoId;
}

beforeAll(async () => {
  t = await criarContextoTeste();
  const r = await t.servicos.recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
  if (!r.ok) throw new Error("setup");
  token = r.token;
  numero = r.numeroPublico;
});

afterAll(async () => {
  await t.fechar();
});

function carregar(tk = token, query = "") {
  return loader({ request: requisicao(`/k/${tk}${query}`), params: { token: tk }, context: t.contexto() } as never);
}

function agir(campos: Record<string, string>, tk = token) {
  return action({
    request: requisicao(`/k/${tk}`, { method: "POST", body: formulario(campos) }),
    params: { token: tk },
    context: t.contexto(),
  } as never);
}

describe("página secreta", () => {
  test("token inexistente dá 404 genérico", async () => {
    await expect(carregar("nao-existe")).rejects.toMatchObject({ status: 404 });
  });

  test("token válido traz o recebedor, os totais e as listas", async () => {
    const d1 = await doar("5", "toma, compra um pastel", "pastel_de_vento");
    await doar("20", "", "");
    await t.servicos.repasses.agendarParaRecebedor((await carregar()).recebedor.id);
    await t.servicos.repasses.processarAgendados();
    await doar("10", "boa sorte aí", "tia_do_zap");
    const d = await carregar(token, "?nova=1");
    expect(d.recebedor.numeroPublico).toBe(numero);
    expect(d.recebedor.chaveMascarada).toBe("7f3a9c2e-••••-••••-••••-c21e5a6b0d93");
    expect(d.nova).toBe(true);
    expect(d.totais).toEqual({ recebidoCentavos: 3500, repassadoCentavos: 2250, pendenteCentavos: 900, taxaCentavos: 350 });
    expect(d.doacoes).toHaveLength(3);
    expect(d.doacoes[0]).toMatchObject({ valorCentavos: 1000, mensagem: "boa sorte aí", apelido: "tia_do_zap", repasse: "pendente" });
    expect(d.doacoes.find((x) => x.id === d1)).toMatchObject({ repasse: "concluido" });
    expect(d.repasses).toHaveLength(1);
    expect(d.repasses[0]).toMatchObject({ valorCentavos: 2250, status: "concluido" });
  });

  test("pausar, reativar e remover mudam o estado e voltam para a página", async () => {
    const p = (await agir({ intent: "pausar" })) as Response;
    expect(p.status).toBe(302);
    expect(p.headers.get("Location")).toBe(`/k/${token}`);
    expect((await carregar()).recebedor.status).toBe("pausada");
    await agir({ intent: "reativar" });
    expect((await carregar()).recebedor.status).toBe("ativa");
  });

  test("denunciar oculta a mensagem", async () => {
    const d = await carregar();
    const alvo = d.doacoes.find((x) => x.mensagem === "boa sorte aí")!;
    await agir({ intent: "denunciar", doacaoId: alvo.id });
    const depois = await carregar();
    expect(depois.doacoes.find((x) => x.id === alvo.id)!.mensagemOculta).toBe(true);
  });

  test("trocar para chave de outro recebedor é recusado; troca válida volta a aguardar validação", async () => {
    const outro = await t.servicos.recebedores.cadastrar("11111111-2222-4333-8444-555555555555");
    if (!outro.ok) throw new Error("setup");
    const dup = (await agir({ intent: "trocar", chave: "11111111-2222-4333-8444-555555555555" })) as { data: { erroTroca: string }; init: { status: number } };
    expect(dup.init.status).toBe(400);
    expect(dup.data.erroTroca).toMatch(/já está na roda/);
    const ok = (await agir({ intent: "trocar", chave: "99999999-8888-4777-8666-555555555555" })) as Response;
    expect(ok.status).toBe(302);
    const d = await carregar();
    expect(d.recebedor.status).toBe("aguardando_validacao");
    expect(d.recebedor.chaveMascarada).toBe("99999999-••••-••••-••••-555555555555");
  });

  test("remover tira da roda e a página continua acessível", async () => {
    await agir({ intent: "remover" });
    const d = await carregar();
    expect(d.recebedor.status).toBe("removida");
  });

  test("intent desconhecido é 400", async () => {
    const r = (await agir({ intent: "hackear" })) as { init: { status: number } };
    expect(r.init.status).toBe(400);
  });
});
