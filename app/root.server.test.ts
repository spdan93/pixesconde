import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, requisicao, type ContextoTeste } from "~/teste/contexto";
import { loader } from "./root";
import { semIndexacao } from "~/util/robots";

let t: ContextoTeste;

beforeAll(async () => {
  t = await criarContextoTeste();
});

afterAll(async () => {
  await t.fechar();
});

describe("root", () => {
  test("loader avisa se o site está em modo demonstração", async () => {
    const dados = await loader({ request: requisicao("/"), params: {}, context: t.contexto() } as never);
    expect(dados.modoDemo).toBe(false);
  });

  test("em demo, toda resposta sai com X-Robots-Tag noindex, preservando status e corpo", async () => {
    const original = new Response("oi", { status: 404, headers: { "content-type": "text/plain" } });
    const r = semIndexacao(original);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("content-type")).toBe("text/plain");
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("oi");
  });

  test("redirecionamento continua redirecionando", () => {
    const r = semIndexacao(new Response(null, { status: 302, headers: { location: "/x" } }));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/x");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
