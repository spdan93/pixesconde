import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { criarDbTeste } from "@/infra/db/teste";
import type { Db } from "@/infra/db/client";
import { lerConfig } from "@/infra/db/config";
import { apelidos, denuncias, doacoes } from "@/infra/db/schema";
import { criarProvedores } from "@/providers";
import type { FakeEntrada } from "@/providers/payment-in/fake";
import type { ConsoleEmail } from "@/providers/email/console";
import { criarServicoRecebedores, type ServicoRecebedores } from "@/domain/recebedores/servico";
import { criarServicoDoacoes, type ServicoDoacoes } from "@/domain/doacoes/servico";
import { criarServicoApelidos, type ServicoApelidos } from "./servico";

const SEGREDOS = {
  chaveCifra: "wJ1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0a=",
  segredoHmac: "Zz1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0b=",
  segredoCookie: "Cc1m3n9Qq2v5x8z1A4c7E0g3I6k9M2o5R8t1V4w7Y0c=",
};

let db: Db;
let fechar: () => Promise<void>;
let recebedores: ServicoRecebedores;
let doacoesSvc: ServicoDoacoes;
let servico: ServicoApelidos;
let entrada: FakeEntrada;
let email: ConsoleEmail;
let relogio = new Date("2026-11-18T20:00:00Z");

const provedores = criarProvedores({ PROVEDOR_PAGAMENTO: "fake", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://x" }, { silencioso: true });

const segredos = new Map<string, string>();
async function doar(apelido: string, valorTexto = "5", apelidoIdDoCookie: string | null = null) {
  const r = await doacoesSvc.criarIntencao({ numeroPublico: 1, valorTexto, mensagem: "oi", apelido, apelidoIdDoCookie });
  if (!r.ok) throw new Error(`setup doar: ${r.motivo}`);
  segredos.set(r.doacaoId, r.segredoDoador);
  entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
  await doacoesSvc.processarNotificacao({ provedor: "fake", idExterno: `evt_${r.doacaoId}`, refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
  return r.doacaoId;
}

function tokenDoUltimoEmail(): string {
  const texto = email.enviados.at(-1)!.texto;
  const m = /\/apelido\/confirmar\/([A-Za-z0-9_-]+)/.exec(texto);
  if (!m) throw new Error("e-mail sem link");
  return m[1]!;
}

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
  recebedores = criarServicoRecebedores(db, SEGREDOS);
  entrada = provedores.entrada as FakeEntrada;
  email = provedores.email as ConsoleEmail;
  doacoesSvc = criarServicoDoacoes({ db, provedores, recebedores, config: () => lerConfig(db), urlPublica: "http://x", agora: () => relogio });
  servico = criarServicoApelidos({ db, provedores, segredos: SEGREDOS, urlPublica: "http://x", agora: () => relogio });
  await recebedores.cadastrar("7f3a9c2e-04b1-4d8a-9f27-c21e5a6b0d93");
});

afterAll(async () => {
  await fechar();
});

describe("vínculo por link mágico", () => {
  let doacaoId: string;
  let apelidoId: string;
  let cookie: string;
  let tokenConcorrente: string;

  test("doação sem apelido não tem o que vincular", async () => {
    const semApelido = await doar("");
    expect(await servico.solicitarVinculo({ doacaoId: semApelido, email: "a@b.com", segredoDoador: segredos.get(semApelido)! })).toEqual({ ok: false, motivo: "sem_apelido" });
  });

  test("e-mail inválido é recusado", async () => {
    doacaoId = await doar("pastel_de_vento");
    expect(await servico.solicitarVinculo({ doacaoId, email: "nao é email", segredoDoador: segredos.get(doacaoId)! })).toEqual({ ok: false, motivo: "email_invalido" });
  });

  test("solicitar envia e-mail com link e NÃO cria apelido antes da confirmação", async () => {
    expect(await servico.solicitarVinculo({ doacaoId, email: "Pastel@Exemplo.com ", segredoDoador: segredos.get(doacaoId)! })).toEqual({ ok: true });
    expect(email.enviados.at(-1)!.para).toBe("pastel@exemplo.com");
    expect(email.enviados.at(-1)!.texto).toContain("http://x/apelido/confirmar/");
    expect(await db.select().from(apelidos).where(eq(apelidos.nome, "pastel_de_vento"))).toHaveLength(0);
  });

  test("outro doador pode pedir o mesmo apelido enquanto ninguém confirmou (sem reserva por pedido)", async () => {
    const outra = await doar("pastel_de_vento");
    expect(await servico.solicitarVinculo({ doacaoId: outra, email: "concorrente@exemplo.com", segredoDoador: segredos.get(outra)! })).toEqual({ ok: true });
    tokenConcorrente = tokenDoUltimoEmail();
    // volta a pedir para a doação original, para o token dela ser o último e-mail
    expect(await servico.solicitarVinculo({ doacaoId, email: "pastel@exemplo.com", segredoDoador: segredos.get(doacaoId)! })).toEqual({ ok: true });
  });

  test("token confirma uma vez: apelido confirmado, doação vinculada, cookie devolvido", async () => {
    const token = tokenDoUltimoEmail();
    const r = await servico.confirmarToken(token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    apelidoId = r.apelidoId;
    cookie = r.cookie;
    const [a] = await db.select().from(apelidos).where(eq(apelidos.id, apelidoId));
    expect(a!.confirmadoEm).not.toBeNull();
    expect(a!.emailCifrado.startsWith("enc:v1:")).toBe(true);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, doacaoId));
    expect(d!.apelidoId).toBe(apelidoId);
    expect(await servico.confirmarToken(token)).toEqual({ ok: false });
  });

  test("quem confirma depois, com outro e-mail, perde o apelido", async () => {
    expect(await servico.confirmarToken(tokenConcorrente)).toEqual({ ok: false });
    expect(await db.select().from(apelidos).where(eq(apelidos.nome, "pastel_de_vento"))).toHaveLength(1);
  });

  test("cookie resolve o id; adulterado resolve null", async () => {
    expect(await servico.apelidoIdDoCookie(cookie)).toBe(apelidoId);
    expect(await servico.apelidoIdDoCookie(cookie.replace(/.$/, "x"))).toBeNull();
    expect(await servico.apelidoIdDoCookie(null)).toBeNull();
  });

  test("doação feita com o cookie já nasce vinculada; com outro apelido, não", async () => {
    const comCookie = await doar("pastel_de_vento", "10", apelidoId);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, comCookie));
    expect(d!.apelidoId).toBe(apelidoId);
    const outro = await doar("tia_do_zap", "10", apelidoId);
    const [d2] = await db.select().from(doacoes).where(eq(doacoes.id, outro));
    expect(d2!.apelidoId).toBeNull();
  });

  test("mesmo apelido com outro e-mail é de outro", async () => {
    const d = await doar("pastel_de_vento");
    expect(await servico.solicitarVinculo({ doacaoId: d, email: "impostor@exemplo.com", segredoDoador: segredos.get(d)! })).toEqual({ ok: false, motivo: "em_uso" });
  });

  test("dono em outro aparelho pede novo link; só a doação do link é vinculada", async () => {
    const semCookie = await doar("pastel_de_vento", "20");
    const anterior = await doar("pastel_de_vento", "20");
    expect(await servico.solicitarVinculo({ doacaoId: semCookie, email: "pastel@exemplo.com", segredoDoador: segredos.get(semCookie)! })).toEqual({ ok: true });
    const r = await servico.confirmarToken(tokenDoUltimoEmail());
    expect(r.ok).toBe(true);
    const [d] = await db.select().from(doacoes).where(eq(doacoes.id, semCookie));
    expect(d!.apelidoId).toBe(apelidoId);
    const [d2] = await db.select().from(doacoes).where(eq(doacoes.id, anterior));
    expect(d2!.apelidoId).toBeNull();
  });

  test("token expirado não confirma", async () => {
    const d = await doar("pastel_de_vento");
    await servico.solicitarVinculo({ doacaoId: d, email: "pastel@exemplo.com", segredoDoador: segredos.get(d)! });
    const token = tokenDoUltimoEmail();
    relogio = new Date(relogio.getTime() + 31 * 60_000);
    expect(await servico.confirmarToken(token)).toEqual({ ok: false });
  });
});

describe("denúncia", () => {
  test("oculta a mensagem e registra", async () => {
    const d = await doar("alguem");
    await servico.denunciar(d, "ofensiva");
    const [doacao] = await db.select().from(doacoes).where(eq(doacoes.id, d));
    expect(doacao!.mensagemOculta).toBe(true);
    expect(await db.select().from(denuncias).where(eq(denuncias.doacaoId, d))).toHaveLength(1);
  });
});

describe("prova de que é o doador", () => {
  test("sem o segredo do doador (ou com segredo errado) não vincula", async () => {
    const r = await doacoesSvc.criarIntencao({ numeroPublico: 1, valorTexto: "5", mensagem: "", apelido: "dona_certa", apelidoIdDoCookie: null });
    if (!r.ok) throw new Error("setup");
    expect(r.segredoDoador).toMatch(/^[A-Za-z0-9_-]{32}$/);
    entrada.marcarResultado(`doa_${r.doacaoId}`, "aprovado");
    await doacoesSvc.processarNotificacao({ provedor: "fake", idExterno: `evt_${r.doacaoId}`, refExterna: `doa_${r.doacaoId}`, idProvedor: null, payload: {} });
    expect(await servico.solicitarVinculo({ doacaoId: r.doacaoId, email: "x@y.com", segredoDoador: "errado" })).toEqual({ ok: false, motivo: "nao_e_o_doador" });
    expect(await servico.solicitarVinculo({ doacaoId: r.doacaoId, email: "x@y.com", segredoDoador: null })).toEqual({ ok: false, motivo: "nao_e_o_doador" });
    expect(await servico.solicitarVinculo({ doacaoId: r.doacaoId, email: "x@y.com", segredoDoador: r.segredoDoador })).toEqual({ ok: true });
    expect(await servico.ehODoador(r.doacaoId, r.segredoDoador)).toBe(true);
    expect(await servico.ehODoador(r.doacaoId, "errado")).toBe(false);
  });
});

describe("limite de pedidos de vínculo", () => {
  test("o limite vem antes da checagem de conflito: não dá para testar e-mails sem gastar cota", async () => {
    const d = await doar("pastel_de_vento");
    for (let i = 0; i < 3; i++) {
      expect(await servico.solicitarVinculo({ doacaoId: d, email: `x${i}@exemplo.com`, segredoDoador: segredos.get(d)! })).toEqual({ ok: false, motivo: "em_uso" });
    }
    expect(await servico.solicitarVinculo({ doacaoId: d, email: "x9@exemplo.com", segredoDoador: segredos.get(d)! })).toEqual({ ok: false, motivo: "muitas_tentativas" });
  });

  test("a 4ª solicitação na hora para a mesma doação é recusada", async () => {
    const d = await doar("limitado");
    for (let i = 0; i < 3; i++) {
      expect(await servico.solicitarVinculo({ doacaoId: d, email: `l${i}@exemplo.com`, segredoDoador: segredos.get(d)! })).toEqual({ ok: true });
    }
    expect(await servico.solicitarVinculo({ doacaoId: d, email: "l9@exemplo.com", segredoDoador: segredos.get(d)! })).toEqual({ ok: false, motivo: "muitas_tentativas" });
  });
});
