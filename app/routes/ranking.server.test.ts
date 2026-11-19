import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarContextoTeste, formulario, requisicao, type ContextoTeste } from "~/teste/contexto";
import type { FakeEntrada } from "@/providers/payment-in/fake";
import type { ConsoleEmail } from "@/providers/email/console";
import { loader as rankingLoader } from "./ranking";
import { action as confirmarAction, loader as confirmarLoader } from "./apelido.confirmar";
import { action as comprovanteAction, loader as comprovanteLoader } from "./comprovante";
import { action as mandarAction } from "./mandar";

let t: ContextoTeste;
let doacaoId: string;
let cookieDoador: string;

beforeAll(async () => {
  t = await criarContextoTeste();
  await t.servicos.recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
  // doa pela rota, para ter o cookie do doador como o navegador teria
  const r = (await mandarAction({
    request: requisicao("/mandar/1", { method: "POST", body: formulario({ valor: "20", mensagem: "oi", apelido: "pastel_de_vento" }) }),
    params: { numero: "1" },
    context: t.contexto(),
  } as never)) as Response;
  const setCookie = r.headers.get("Set-Cookie")!;
  cookieDoador = setCookie.split(";")[0]!;
  doacaoId = cookieDoador.split("=")[0]!.replace("pe_doador_", "");
  (t.servicos.provedores.entrada as FakeEntrada).marcarResultado(`doa_${doacaoId}`, "aprovado");
  await t.servicos.doacoes.processarNotificacao({ provedor: "fake", idExterno: "evt_1", refExterna: `doa_${doacaoId}`, idProvedor: null, payload: {} });
});

afterAll(async () => {
  await t.fechar();
});

function vincular(email: string, cookie: string | null) {
  return comprovanteAction({
    request: requisicao(`/comprovante/${doacaoId}`, {
      method: "POST",
      body: formulario({ intent: "vincular", email }),
      headers: cookie ? { Cookie: cookie } : {},
    }),
    params: { id: doacaoId },
    context: t.contexto(),
  } as never) as Promise<{ data: { vinculo: { ok: boolean; mensagem: string } }; init: { status: number } | null }>;
}

function tokenDoUltimoEmail() {
  const texto = (t.servicos.provedores.email as ConsoleEmail).enviados.at(-1)!.texto;
  return /\/apelido\/confirmar\/([A-Za-z0-9_-]+)/.exec(texto)![1]!;
}

describe("vincular apelido pelo comprovante", () => {
  test("sem o cookie do doador não vincula", async () => {
    const r = await vincular("pastel@exemplo.com", null);
    expect(r.init?.status).toBe(403);
    expect(r.data.vinculo.ok).toBe(false);
  });

  test("e-mail inválido devolve a mensagem no campo", async () => {
    const r = await vincular("não é", cookieDoador);
    expect(r.init?.status).toBe(400);
    expect(r.data.vinculo.mensagem).toMatch(/e-mail/);
  });

  test("válido manda o link mágico", async () => {
    const r = await vincular("pastel@exemplo.com", cookieDoador);
    expect(r.data.vinculo.ok).toBe(true);
    expect(tokenDoUltimoEmail()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("confirmar apelido", () => {
  test("I5: o GET só mostra a página; quem confirma é o POST (scanner de e-mail não queima o token)", async () => {
    const token = tokenDoUltimoEmail();
    const d = await confirmarLoader({ request: requisicao(`/apelido/confirmar/${token}`), params: { token }, context: t.contexto() } as never);
    expect(d).toEqual({ nome: "pastel_de_vento", valido: true });
    const d2 = await confirmarLoader({ request: requisicao(`/apelido/confirmar/${token}`), params: { token }, context: t.contexto() } as never);
    expect(d2).toEqual({ nome: "pastel_de_vento", valido: true }); // ainda não consumido
  });

  test("token válido confirma pelo POST, grava o cookie de dono e manda para o ranking", async () => {
    const token = tokenDoUltimoEmail();
    const r = (await confirmarAction({ request: requisicao(`/apelido/confirmar/${token}`, { method: "POST", body: formulario({}) }), params: { token }, context: t.contexto() } as never)) as Response;
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/ranking?apelido=pastel_de_vento");
    const cookie = r.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^pe_apelido=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=31536000");
  });

  test("token reutilizado cai na página de link usado, no GET e no POST", async () => {
    const token = tokenDoUltimoEmail();
    const d = await confirmarLoader({ request: requisicao(`/apelido/confirmar/${token}`), params: { token }, context: t.contexto() } as never);
    expect(d).toEqual({ nome: null, valido: false });
    const p = await confirmarAction({ request: requisicao(`/apelido/confirmar/${token}`, { method: "POST", body: formulario({}) }), params: { token }, context: t.contexto() } as never);
    expect(p).toEqual({ ok: false });
  });

  test("o comprovante do doador passa a mostrar o vínculo feito", async () => {
    const d = await comprovanteLoader({
      request: requisicao(`/comprovante/${doacaoId}`, { headers: { Cookie: cookieDoador } }),
      params: { id: doacaoId },
      context: t.contexto(),
    } as never);
    expect(d.comprovante.apelidoConfirmado).toBe(true);
  });
});

describe("ranking", () => {
  test("loader respeita por e periodo, e ignora valores inválidos", async () => {
    const d = await rankingLoader({ request: requisicao("/ranking?por=quantidade&periodo=semana&apelido=pastel_de_vento"), params: {}, context: t.contexto() } as never);
    expect(d.por).toBe("quantidade");
    expect(d.periodo).toBe("semana");
    expect(d.destaque).toBe("pastel_de_vento");
    expect(d.ranking.posicoes[0]).toMatchObject({ apelido: "pastel_de_vento", totalCentavos: 2000, quantidade: 1 });
    const ruim = await rankingLoader({ request: requisicao("/ranking?por=x&periodo=y"), params: {}, context: t.contexto() } as never);
    expect(ruim.por).toBe("valor");
    expect(ruim.periodo).toBe("tudo");
  });
});
