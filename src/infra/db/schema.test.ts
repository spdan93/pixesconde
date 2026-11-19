import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { criarDbTeste } from "./teste";
import { executarLinhas } from "./sql";
import { gravarConfig, lerConfig } from "./config";
import { chavesPix, recebedores } from "./schema";
import type { Db } from "./client";

let db: Db;
let fechar: () => Promise<void>;

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
});

afterAll(async () => {
  await fechar();
});

describe("esquema", () => {
  test("migrações sobem e as tabelas existem vazias", async () => {
    const linhas = await db.select().from(recebedores);
    expect(linhas).toEqual([]);
    const tabelas = await executarLinhas<{ table_name: string }>(
      db,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const nomes = tabelas.map((r) => r.table_name);
    for (const t of [
      "recebedores",
      "chaves_pix",
      "doacoes",
      "repasses",
      "lancamentos",
      "apelidos",
      "tokens_magicos",
      "configuracao",
      "eventos_webhook",
      "denuncias",
      "limites",
    ]) {
      expect(nomes).toContain(t);
    }
  });

  test("numero_publico é sequencial", async () => {
    const [a] = await db.insert(recebedores).values({ tokenHash: "a" }).returning();
    const [b] = await db.insert(recebedores).values({ tokenHash: "b" }).returning();
    expect(a!.numeroPublico).toBe(1);
    expect(b!.numeroPublico).toBe(2);
    expect(a!.status).toBe("aguardando_validacao");
  });

  test("a mesma chave_hmac não pode estar ativa duas vezes", async () => {
    const [r] = await db.insert(recebedores).values({ tokenHash: "c" }).returning();
    await db.insert(chavesPix).values({ recebedorId: r!.id, chaveCifrada: "x", chaveHmac: "h1", ativa: true });
    await expect(
      db.insert(chavesPix).values({ recebedorId: r!.id, chaveCifrada: "y", chaveHmac: "h1", ativa: true }),
    ).rejects.toThrow();
    // desativada pode repetir
    await db.insert(chavesPix).values({ recebedorId: r!.id, chaveCifrada: "y", chaveHmac: "h1", ativa: false });
  });
});

describe("configuração", () => {
  test("padrões quando a tabela está vazia", async () => {
    expect(await lerConfig(db)).toEqual({
      taxaBp: 1000,
      minimoCentavos: 500,
      maximoCentavos: 50000,
      gatilhoRepasse: "diario",
      minimoRepasseCentavos: 0,
      palavrasBloqueadas: [],
      apelidosForaDoRanking: [],
      expiracaoIntencaoMin: 30,
    });
  });

  test("gravar persiste e sobrescreve só o informado", async () => {
    await gravarConfig(db, { taxaBp: 1500, palavrasBloqueadas: ["bobo"] });
    const cfg = await lerConfig(db);
    expect(cfg.taxaBp).toBe(1500);
    expect(cfg.palavrasBloqueadas).toEqual(["bobo"]);
    expect(cfg.minimoCentavos).toBe(500);
  });
});
