import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarDbTeste } from "./db/teste";
import type { Db } from "./db/client";
import { permitir } from "./limites";

let db: Db;
let fechar: () => Promise<void>;

beforeAll(async () => {
  ({ db, fechar } = await criarDbTeste());
});

afterAll(async () => {
  await fechar();
});

describe("permitir", () => {
  test("deixa passar até o máximo na janela e bloqueia depois", async () => {
    const agora = new Date("2026-11-18T20:00:00Z");
    for (let i = 0; i < 3; i++) expect(await permitir(db, "cadastro:1.2.3.4", 60, 3, agora)).toBe(true);
    expect(await permitir(db, "cadastro:1.2.3.4", 60, 3, agora)).toBe(false);
  });

  test("outra chave tem contador próprio", async () => {
    const agora = new Date("2026-11-18T20:00:00Z");
    expect(await permitir(db, "cadastro:9.9.9.9", 60, 3, agora)).toBe(true);
  });

  test("na janela seguinte, zera", async () => {
    const depois = new Date("2026-11-18T21:00:00Z");
    expect(await permitir(db, "cadastro:1.2.3.4", 60, 3, depois)).toBe(true);
  });
});
