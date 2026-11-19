import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, requisicao, type ContextoTeste } from "~/teste/contexto";
import { loader } from "./sortear";

let t: ContextoTeste;

beforeAll(async () => {
  t = await criarContextoTeste();
});

afterAll(async () => {
  await t.fechar();
});

async function redirecionaPara(): Promise<string> {
  try {
    const r = await loader({ request: requisicao("/sortear"), params: {}, context: t.contexto() } as never);
    return (r as Response).headers.get("Location")!;
  } catch (e) {
    return (e as Response).headers.get("Location")!;
  }
}

describe("sortear", () => {
  test("sem nenhuma chave na roda, manda cadastrar", async () => {
    expect(await redirecionaPara()).toBe("/cadastrar?motivo=vazio");
  });

  test("com chaves, manda para a página de mandar Pix de uma delas", async () => {
    await t.servicos.recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
    expect(await redirecionaPara()).toBe("/mandar/1");
  });
});
