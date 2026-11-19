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
export function montarServicos(env: EnvServicos, opts: { db?: Db; fechar?: () => Promise<void>; agora?: () => Date } = {}): Servicos {
  const conexao = opts.db ? { db: opts.db, fechar: opts.fechar ?? (async () => {}) } : criarDb(env.HYPERDRIVE.connectionString);
  const db = conexao.db;
  const segredos: Segredos = {
    chaveCifra: exigir(env, "CHAVE_CIFRA"),
    segredoHmac: exigir(env, "SEGREDO_HMAC"),
    segredoCookie: exigir(env, "SEGREDO_COOKIE"),
  };
  const urlPublica = exigir(env, "URL_PUBLICA").replace(/\/$/, "");
  const provedores = criarProvedores(env);

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
    emProducao: urlPublica.startsWith("https://"),
    fechar: conexao.fechar,
  };
}

/** Hora (UTC) em que o repasse diário agrupa os créditos: 13h UTC = 10h em Brasília. */
export const HORA_REPASSE_DIARIO_UTC = 13;

/** Rotina do Cron Trigger (a cada 15 min). */
export async function rodarCron(env: EnvServicos, agora = new Date()): Promise<Record<string, number>> {
  const s = montarServicos(env);
  try {
    const cfg = await s.config();
    const expiradas = await s.doacoes.expirarIntencoes();
    let agendados = 0;
    if (cfg.gatilhoRepasse === "diario" && agora.getUTCHours() === HORA_REPASSE_DIARIO_UTC && agora.getUTCMinutes() < 15) {
      agendados = await s.repasses.agendarTodos();
    }
    const { concluidos, falhos } = await s.repasses.processarAgendados();
    const devolvidas = await s.repasses.devolverRetidos(30);
    const resumo = { expiradas, agendados, concluidos, falhos, devolvidas };
    console.log("[cron]", JSON.stringify(resumo));
    return resumo;
  } finally {
    await s.fechar();
  }
}
