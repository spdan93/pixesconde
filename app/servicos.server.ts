import { criarDb, type Db } from "@/infra/db/client";
import { lerConfig, type Config } from "@/infra/db/config";
import { criarProvedores, type Provedores } from "@/providers";
import { criarServicoRecebedores, type ServicoRecebedores } from "@/domain/recebedores/servico";
import { criarServicoDoacoes, type ServicoDoacoes } from "@/domain/doacoes/servico";
import { criarServicoRepasses, type ServicoRepasses } from "@/domain/repasses/servico";
import { criarServicoApelidos, type ServicoApelidos } from "@/domain/apelidos/servico";
import { criarServicoRanking, type ServicoRanking } from "@/domain/ranking/servico";

export type Segredos = { chaveCifra: string; segredoHmac: string; segredoCookie: string };

export type Servicos = {
  db: Db;
  config: () => Promise<Config>;
  provedores: Provedores;
  recebedores: ServicoRecebedores;
  doacoes: ServicoDoacoes;
  repasses: ServicoRepasses;
  apelidos: ServicoApelidos;
  ranking: ServicoRanking;
  segredos: Segredos;
  urlPublica: string;
  emProducao: boolean;
  fechar(): Promise<void>;
};

export type EnvServicos = {
  HYPERDRIVE: { connectionString: string };
  PROVEDOR_PAGAMENTO: string;
  PROVEDOR_REPASSE: string;
  PROVEDOR_EMAIL?: string;
  PROVEDOR_CAPTCHA?: string;
  URL_PUBLICA: string;
  CHAVE_CIFRA: string;
  SEGREDO_HMAC: string;
  SEGREDO_COOKIE: string;
};

function exigir(env: EnvServicos, nome: keyof EnvServicos): string {
  const v = env[nome];
  if (typeof v !== "string" || v.length === 0) throw new Error(`variável de ambiente ausente: ${nome}`);
  return v;
}

/** Monta o grafo de serviços sobre uma conexão nova. Chamar `fechar()` ao fim da requisição. */
export type OpcoesServicos = {
  /** Banco já aberto (testes com PGlite). */
  db?: Db;
  fechar?: () => Promise<void>;
  agora?: () => Date;
  /** Provedores compartilhados entre requisições simuladas (os falsos guardam estado em memória). */
  provedores?: Provedores;
  silencioso?: boolean;
};

export function montarServicos(env: EnvServicos, opts: OpcoesServicos = {}): Servicos {
  const conexao = opts.db ? { db: opts.db, fechar: opts.fechar ?? (async () => {}) } : criarDb(env.HYPERDRIVE.connectionString);
  const db = conexao.db;
  const segredos: Segredos = {
    chaveCifra: exigir(env, "CHAVE_CIFRA"),
    segredoHmac: exigir(env, "SEGREDO_HMAC"),
    segredoCookie: exigir(env, "SEGREDO_COOKIE"),
  };
  const urlPublica = exigir(env, "URL_PUBLICA").replace(/\/$/, "");
  const emProducao = urlPublica.startsWith("https://");
  // Produção falha fechado: nenhum provedor de mentira pode confirmar pagamento, pular o
  // anti-robô ou mandar e-mail para o log quando a URL pública é https.
  if (emProducao) {
    const deMentira = [
      ["PROVEDOR_PAGAMENTO", env.PROVEDOR_PAGAMENTO, "fake"],
      ["PROVEDOR_REPASSE", env.PROVEDOR_REPASSE, "fake"],
      ["PROVEDOR_EMAIL", env.PROVEDOR_EMAIL ?? "console", "console"],
      ["PROVEDOR_CAPTCHA", env.PROVEDOR_CAPTCHA ?? "sempre-ok", "sempre-ok"],
    ].filter(([, valor, falso]) => valor === falso);
    if (deMentira.length > 0) {
      throw new Error(`produção (URL_PUBLICA https) com provedor de mentira: ${deMentira.map(([nome, valor]) => `${nome}=${valor}`).join(", ")}`);
    }
  }
  const provedores = opts.provedores ?? criarProvedores(env, { silencioso: opts.silencioso });

  // Config lida uma vez por requisição.
  let configCache: Promise<Config> | null = null;
  const config = () => (configCache ??= lerConfig(db));

  const recebedores = criarServicoRecebedores(db, segredos);
  const doacoes = criarServicoDoacoes({ db, provedores, recebedores, config, urlPublica, agora: opts.agora });
  const repasses = criarServicoRepasses({ db, provedores, recebedores, doacoes, config, agora: opts.agora });
  doacoes.setRepasses(repasses);
  const apelidos = criarServicoApelidos({ db, provedores, segredos, urlPublica, agora: opts.agora });
  const ranking = criarServicoRanking(db, opts.agora);

  return {
    db,
    config,
    provedores,
    recebedores,
    doacoes,
    repasses,
    apelidos,
    ranking,
    segredos,
    urlPublica,
    emProducao,
    fechar: conexao.fechar,
  };
}

/** Hora (UTC) em que o repasse diário agrupa os créditos: 13h UTC = 10h em Brasília. */
export const HORA_REPASSE_DIARIO_UTC = 13;

/** Rotina do Cron Trigger (a cada 15 min). */
export async function rodarCron(env: EnvServicos, agora = new Date(), opts: OpcoesServicos = {}): Promise<Record<string, number>> {
  const s = montarServicos(env, { ...opts, agora: opts.agora ?? (() => agora) });
  try {
    const cfg = await s.config();
    const expiradas = await s.doacoes.expirarIntencoes();
    // Diário: agrupa no horário. Imediato: agrupa toda rodada mesmo assim — é idempotente e é a
    // rede de segurança para o efeito pós-confirmação que falhou no webhook.
    const horaDoLote = agora.getUTCHours() === HORA_REPASSE_DIARIO_UTC && agora.getUTCMinutes() < 15;
    const agendados = cfg.gatilhoRepasse === "imediato" || horaDoLote ? await s.repasses.agendarTodos() : 0;
    const { concluidos, falhos } = await s.repasses.processarAgendados();
    const devolvidas = await s.repasses.devolverRetidos(30);
    const estornos = await s.doacoes.conciliarEstornos();
    const resumo = { expiradas, agendados, concluidos, falhos, devolvidas, ...estornos };
    console.log("[cron]", JSON.stringify(resumo));
    return resumo;
  } finally {
    await s.fechar();
  }
}
