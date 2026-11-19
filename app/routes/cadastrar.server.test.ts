import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, formulario, requisicao, type ContextoTeste } from "~/teste/contexto";
import { action, loader } from "./cadastrar";

let t: ContextoTeste;

beforeAll(async () => {
  t = await criarContextoTeste();
});

afterAll(async () => {
  await t.fechar();
});

function post(chave: string, ip = "1.1.1.1") {
  return action({
    request: requisicao("/cadastrar", { method: "POST", body: formulario({ chave }), headers: { "CF-Connecting-IP": ip } }),
    params: {},
    context: t.contexto(),
  } as never);
}

describe("cadastrar", () => {
  test("loader traz a taxa e sinaliza quando veio do sorteio vazio", async () => {
    const d = await loader({ request: requisicao("/cadastrar?motivo=vazio"), params: {}, context: t.contexto() } as never);
    expect(d.taxaTexto).toBe("10%");
    expect(d.rodaVazia).toBe(true);
  });

  test("CPF volta com a recusa explicada", async () => {
    const r = (await post("123.456.789-09")) as { data: { erro: string }; init: { status: number } };
    expect(r.init.status).toBe(400);
    expect(r.data.erro).toMatch(/só chave aleatória/);
  });

  test("UUID válido redireciona para o link secreto, marcado como novo", async () => {
    const r = (await post("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93")) as Response;
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toMatch(/^\/k\/[A-Za-z0-9_-]{32}\?nova=1$/);
  });

  test("a mesma chave de novo é recusada como duplicada", async () => {
    const r = (await post("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93")) as { data: { erro: string }; init: { status: number } };
    expect(r.init.status).toBe(400);
    expect(r.data.erro).toMatch(/já está na roda/);
  });

  test("limite por IP: o 11º cadastro no dia é recusado", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await post(`${(i + 1).toString(16).padStart(8, "b")}-04b1-4d8a-9f27-c21e5a6b0d93`, "3.3.3.3");
      expect((r as Response).status).toBe(302);
    }
    const r = (await post("cccccccc-04b1-4d8a-9f27-c21e5a6b0d93", "3.3.3.3")) as { data: { erro: string }; init: { status: number } };
    expect(r.init.status).toBe(429);
  });
});
