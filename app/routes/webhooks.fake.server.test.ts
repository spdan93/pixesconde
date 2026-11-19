import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, formulario, requisicao, type ContextoTeste } from "~/teste/contexto";
import { action } from "./webhooks.fake";
import { loader as pagarLoader } from "./dev.pagar";
import { loader as comprovanteLoader } from "./comprovante";

let t: ContextoTeste;
let doacaoId: string;

beforeAll(async () => {
  t = await criarContextoTeste();
  await t.servicos.recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
  const r = await t.servicos.doacoes.criarIntencao({ numeroPublico: 1, valorTexto: "10", mensagem: "oi", apelido: "", apelidoIdDoCookie: null });
  if (!r.ok) throw new Error("setup");
  doacaoId = r.doacaoId;
});

afterAll(async () => {
  await t.fechar();
});

async function postar(ref: string, resultado: string) {
  const r = (await action({
    request: requisicao("/webhooks/fake", { method: "POST", body: formulario({ ref, resultado }) }),
    params: {},
    context: t.contexto(),
  } as never)) as Response;
  return { status: r.status, corpo: (await r.json()) as { resultado: string } };
}

describe("webhook falso", () => {
  test("aprovado confirma a doação", async () => {
    const r = await postar(`doa_${doacaoId}`, "aprovado");
    expect(r.status).toBe(200);
    expect(r.corpo.resultado).toBe("confirmada");
    const c = await comprovanteLoader({ request: requisicao(`/comprovante/${doacaoId}`), params: { id: doacaoId }, context: t.contexto() } as never);
    expect(c.comprovante.status).toBe("confirmada");
    expect(c.comprovante.valorCentavos).toBe(1000);
  });

  test("o mesmo POST de novo é ignorado", async () => {
    const r = await postar(`doa_${doacaoId}`, "aprovado");
    expect(r.status).toBe(200);
    expect(r.corpo.resultado).toBe("ja_processada");
  });

  test("ref desconhecida responde 200 com desconhecida (webhook nunca devolve erro por isso)", async () => {
    const r = await postar("doa_nada", "aprovado");
    expect(r.status).toBe(200);
    expect(r.corpo.resultado).toBe("desconhecida");
  });

  test("resultado inválido é 400", async () => {
    const r = (await action({
      request: requisicao("/webhooks/fake", { method: "POST", body: formulario({ ref: "x", resultado: "talvez" }) }),
      params: {},
      context: t.contexto(),
    } as never)) as Response;
    expect(r.status).toBe(400);
  });
});

describe("página de pagamento de dev", () => {
  test("mostra a cobrança quando o provedor é fake", async () => {
    const d = await pagarLoader({ request: requisicao(`/dev/pagar/doa_${doacaoId}`), params: { ref: `doa_${doacaoId}` }, context: t.contexto() } as never);
    expect(d.ref).toBe(`doa_${doacaoId}`);
    expect(d.valorCentavos).toBe(1000);
    expect(d.doacaoId).toBe(doacaoId);
  });

  test("some quando o provedor não é fake", async () => {
    const c = t.contexto();
    const { cloudflareContext } = await import("~/contexto.server");
    const atual = c.get(cloudflareContext);
    c.set(cloudflareContext, { ...atual, env: { ...atual.env, PROVEDOR_PAGAMENTO: "mercadopago" } as unknown as Env });
    await expect(pagarLoader({ request: requisicao("/dev/pagar/x"), params: { ref: "x" }, context: c } as never)).rejects.toMatchObject({ status: 404 });
  });
});

describe("comprovante", () => {
  test("id inexistente dá 404", async () => {
    await expect(
      comprovanteLoader({ request: requisicao("/comprovante/00000000-0000-4000-8000-000000000000"), params: { id: "00000000-0000-4000-8000-000000000000" }, context: t.contexto() } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("só o doador (cookie) vê a caixa de vincular apelido", async () => {
    const r = await t.servicos.doacoes.criarIntencao({ numeroPublico: 1, valorTexto: "5", mensagem: "", apelido: "fulano", apelidoIdDoCookie: null });
    if (!r.ok) throw new Error("setup");
    await postar(`doa_${r.doacaoId}`, "aprovado");
    const sem = await comprovanteLoader({ request: requisicao(`/comprovante/${r.doacaoId}`), params: { id: r.doacaoId }, context: t.contexto() } as never);
    expect(sem.ehODoador).toBe(false);
    const com = await comprovanteLoader({
      request: requisicao(`/comprovante/${r.doacaoId}`, { headers: { Cookie: `pe_doador_${r.doacaoId}=${r.segredoDoador}` } }),
      params: { id: r.doacaoId },
      context: t.contexto(),
    } as never);
    expect(com.ehODoador).toBe(true);
  });
});
