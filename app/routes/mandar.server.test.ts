import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, formulario, requisicao, type ContextoTeste } from "~/teste/contexto";
import { CaptchaSempreNao, CaptchaSempreOk } from "@/providers/captcha/sempre-ok";
import { action, loader } from "./mandar";

let t: ContextoTeste;

beforeAll(async () => {
  t = await criarContextoTeste();
  await t.servicos.recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
});

afterAll(async () => {
  await t.fechar();
});

function post(campos: Record<string, string>, ip = "1.1.1.1") {
  return action({
    request: requisicao("/mandar/1", { method: "POST", body: formulario(campos), headers: { "CF-Connecting-IP": ip } }),
    params: { numero: "1" },
    context: t.contexto(),
  } as never);
}

const valido = { valor: "5", mensagem: "toma, compra um pastel", apelido: "pastel_de_vento" };

describe("mandar", () => {
  test("loader traz o recebedor, a taxa e os valores sugeridos", async () => {
    const d = await loader({ request: requisicao("/mandar/1"), params: { numero: "1" }, context: t.contexto() } as never);
    expect(d.recebedor.numeroPublico).toBe(1);
    expect(d.taxaBp).toBe(1000);
    expect(d.sugestoes).toEqual([500, 1000, 2000, 5000]);
  });

  test("loader de número inexistente dá 404", async () => {
    await expect(
      loader({ request: requisicao("/mandar/999"), params: { numero: "999" }, context: t.contexto() } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("valor abaixo do mínimo volta com erro no campo e status 400", async () => {
    const r = (await post({ ...valido, valor: "4,99" })) as { data: { erros: Record<string, string> }; init: { status: number } };
    expect(r.init.status).toBe(400);
    expect(r.data.erros.valor).toMatch(/Mínimo/);
  });

  test("captcha recusado vira erro de formulário", async () => {
    t.servicos.provedores.captcha = new CaptchaSempreNao();
    const r = (await post(valido)) as { data: { erros: Record<string, string> }; init: { status: number } };
    expect(r.init.status).toBe(400);
    expect(r.data.erros.formulario).toMatch(/robô/i);
    t.servicos.provedores.captcha = new CaptchaSempreOk();
  });

  test("dados válidos redirecionam para o pagamento e guardam o segredo do doador em cookie", async () => {
    const r = (await post(valido)) as Response;
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toMatch(/^http:\/\/localhost:5173\/dev\/pagar\/doa_/);
    const cookie = r.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^pe_doador_[0-9a-f-]+=[A-Za-z0-9_-]{32};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toMatch(/Path=\/comprovante\//);
  });

  test("limite por IP: a 31ª intenção na hora é recusada", async () => {
    for (let i = 0; i < 30; i++) {
      const r = await post({ ...valido, mensagem: "", apelido: "" }, "2.2.2.2");
      expect((r as Response).status).toBe(302);
    }
    const r = (await post(valido, "2.2.2.2")) as { data: { erros: Record<string, string> }; init: { status: number } };
    expect(r.init.status).toBe(429);
    expect(r.data.erros.formulario).toMatch(/calma/i);
  });
});
