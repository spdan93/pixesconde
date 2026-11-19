# pix esconde — plano de implementação do estrutural

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a plataforma inteira funcionando de ponta a ponta com provedores de pagamento falsos: cadastrar chave, listar, sortear, doar, confirmar por webhook, comprovante com imagem, página secreta, repasse agendado, ranking com apelido confirmado por e-mail.

**Architecture:** monolito modular em React Router 8 (framework mode, SSR) rodando em Cloudflare Workers. Domínio puro em `src/domain` (sem React, sem Cloudflare), persistência Drizzle + Postgres (`src/infra/db`), provedores externos atrás de interfaces em `src/providers` com implementações falsas. Loaders e actions recebem os serviços por `RouterContextProvider`, o que permite testar rotas sem HTTP. Testes de domínio rodam em PGlite (Postgres em WASM) com as mesmas migrações da produção.

**Tech Stack:** TypeScript estrito, React Router 8.5, Vite 8, `@cloudflare/vite-plugin`, wrangler 4, Tailwind 4, Drizzle ORM 0.45 + drizzle-kit, `postgres` (postgres.js) via Hyperdrive, `@electric-sql/pglite` (testes), Vitest 5, Testing Library, Playwright, zod 4, satori + `@resvg/resvg-wasm`.

**Spec:** `docs/superpowers/specs/2026-11-18-pix-esconde-design.md`

## Global Constraints

- Idioma de código: identificadores de domínio em português (`recebedor`, `doacao`, `repasse`, `lancamento`, `apelido`); identificadores técnicos genéricos podem ser em inglês. Textos de interface em português do Brasil, tom seco da direção "Comprovante".
- Dinheiro sempre em **centavos inteiros** (`number`), nunca float. Percentuais em **basis points** (10% = 1000).
- Mínimo por doação: **500 centavos**. Máximo padrão: **50000**. Taxa padrão: **1000 bp**. Mensagem: **140 caracteres**. Apelido: `^[a-z0-9_]{3,24}$`. Descritor de fatura: `PIXESCONDE`.
- Só chave Pix aleatória (UUID). Chave cifrada em repouso (`enc:v1:`), HMAC para unicidade, token do link secreto guardado só como hash SHA-256.
- Nomes de variáveis de ambiente aparecem **literalmente** no código: `CHAVE_CIFRA`, `SEGREDO_HMAC`, `SEGREDO_COOKIE`, `PROVEDOR_PAGAMENTO`, `PROVEDOR_REPASSE`, `URL_PUBLICA`, `HYPERDRIVE` (binding), `ASSETS` (binding), `IMAGENS` (R2, opcional no MVP).
- Sem cartão e sem boleto. Sem admin. Sem analytics de terceiros.
- Toda transição de estado de doação e repasse gera lançamento no razão. Nada no código faz `UPDATE`/`DELETE` em `lancamentos`.
- Pronto = `.claude/verify.sh` passa (typecheck, testes unitários, build).
- Commits pequenos por tarefa, em português, sem push (não há remoto).

## Review Focus

1. **Webhook repetido ou fora de ordem** para a mesma doação (o MP reenvia): a confirmação acontece uma vez, o razão tem um lançamento de entrada e um de taxa, nunca dois. Teste em Task 8.
2. **Chave Pix digitada "errado mas certo"**: maiúsculas, espaços nas pontas, 32 hex sem hífens; e as "certas mas proibidas": CPF, CNPJ, e-mail, telefone. As primeiras normalizam; as segundas recusam com o motivo. Teste em Task 2.
3. **Valor digitado como gente digita**: `5`, `5,00`, `R$ 10`, `4,99`, `10.5`, `1e3`. Aceita os válidos ≥ 500 centavos, recusa o resto sem lançar exceção. Teste em Task 1 e Task 13.
4. **Token secreto inválido, removido ou link mágico reutilizado**: 404 genérico para `/k/:token` ruim; link mágico só confirma uma vez e expira. Testes em Task 14 e Task 15.
5. **Concorrência no sorteio e na troca de chave**: sortear sem nenhuma chave ativa redireciona para `/cadastrar`; trocar para uma chave que já está ativa em outro recebedor é recusado. Testes em Task 6 e Task 12.

---

### Task 0: Esqueleto do projeto, git, verify.sh

**Files:**
- Create: tudo do template Cloudflare React Router (`app/`, `workers/app.ts`, `wrangler.jsonc`, `vite.config.ts`, `react-router.config.ts`, `tsconfig*.json`, `package.json`)
- Create: `.claude/verify.sh`, `.dev.vars.example`, `vitest.config.ts`, `drizzle.config.ts`, `README.md`
- Modify: `.gitignore` (adicionar `.dev.vars`, `.wrangler/`, `build/`, `.react-router/`, `node_modules/`, `test-results/`, `playwright-report/`)

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:watch`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm e2e`; binding `HYPERDRIVE` com `localConnectionString` lido de `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`; `compatibility_flags: ["nodejs_compat"]`; `triggers.crons: ["*/15 * * * *"]`.

- [ ] **Step 1:** `git init` na raiz; commit inicial com `.claude/`, `.gitignore`, `docs/`.
- [ ] **Step 2:** Rodar `pnpm create cloudflare@latest pix-esconde-tmp --framework=react-router --deploy=false --git=false -y` no scratchpad e copiar o conteúdo (sem `node_modules`, sem `.git`) para a raiz do projeto, sem sobrescrever `.gitignore` (mesclar) nem `.claude/`.
- [ ] **Step 3:** `pnpm add drizzle-orm postgres zod isbot` e `pnpm add -D drizzle-kit @electric-sql/pglite vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test @types/node`.
- [ ] **Step 4:** Editar `wrangler.jsonc`: `name: "pix-esconde"`, `compatibility_flags: ["nodejs_compat"]`, `hyperdrive: [{ binding: "HYPERDRIVE", id: "00000000000000000000000000000000", localConnectionString: "postgres://postgres@localhost:5433/pix_esconde" }]`, `triggers: { crons: ["*/15 * * * *"] }`, `vars: { PROVEDOR_PAGAMENTO: "fake", PROVEDOR_REPASSE: "fake", URL_PUBLICA: "http://localhost:5173" }`, `assets: { directory: "./public", binding: "ASSETS" }` se o template não trouxer.
- [ ] **Step 5:** Criar `.dev.vars.example` com `CHAVE_CIFRA=`, `SEGREDO_HMAC=`, `SEGREDO_COOKIE=` (base64 de 32 bytes cada, gerados por `openssl rand -base64 32`) e copiar para `.dev.vars` com valores reais de dev.
- [ ] **Step 6:** `vitest.config.ts`: dois projetos, `dominio` (environment `node`, include `src/**/*.test.ts`, `app/**/*.server.test.ts`) e `componentes` (environment `jsdom`, include `app/**/*.test.tsx`, setup `@testing-library/jest-dom/vitest`). `drizzle.config.ts`: `dialect: "postgresql"`, `schema: "./src/infra/db/schema/*.ts"`, `out: "./drizzle"`, `dbCredentials.url` de `DATABASE_URL`.
- [ ] **Step 7:** `.claude/verify.sh` executável: `set -euo pipefail; pnpm typecheck; pnpm test; pnpm build`. Testar que falha sem testes? Não: com zero testes o vitest sai 0 com `--passWithNoTests`; usar isso só até a Task 1.
- [ ] **Step 8:** Rodar `.claude/verify.sh`. Esperado: PASS (typecheck, vitest sem testes, build gera `build/`).
- [ ] **Step 9:** Commit `chore: esqueleto React Router + Cloudflare, verify.sh`.

### Task 1: Dinheiro

**Files:**
- Create: `src/domain/dinheiro.ts`, `src/domain/dinheiro.test.ts`

**Interfaces:**
- Produces: `calcularTaxa(valorCentavos: number, taxaBp: number): { taxa: number; liquido: number }` (arredonda meio para cima); `formatarReais(centavos: number): string` → `"R$ 5,00"`, `"R$ 1.234,50"`; `interpretarReais(texto: string): number | null` → centavos ou `null`; `formatarBp(bp: number): string` → `"10%"`, `"12,5%"`.

- [ ] **Step 1:** Testes: `calcularTaxa(500, 1000)` → `{taxa: 50, liquido: 450}`; `calcularTaxa(999, 1000)` → `{taxa: 100, liquido: 899}`; `calcularTaxa(500, 0)` → `{taxa: 0, liquido: 500}`; `formatarReais(500)` → `"R$ 5,00"`; `formatarReais(123450)` → `"R$ 1.234,50"`; `interpretarReais` para `"5"`→500, `"5,00"`→500, `"R$ 10"`→1000, `"10.5"`→1050, `"4,99"`→499, `"1e3"`→null, `""`→null, `"abc"`→null, `"-5"`→null, `"5,999"`→null.
- [ ] **Step 2:** Rodar `pnpm vitest run src/domain/dinheiro.test.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar. `interpretarReais` aceita apenas `^\s*(R\$)?\s*\d{1,6}([.,]\d{1,2})?\s*$`.
- [ ] **Step 4:** Rodar de novo. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(dominio): dinheiro em centavos, taxa e parsing de reais`.

### Task 2: Validação da chave Pix aleatória

**Files:**
- Create: `src/domain/chaves/validar-chave.ts`, `src/domain/chaves/validar-chave.test.ts`

**Interfaces:**
- Produces: `type ResultadoChave = { ok: true; chave: string } | { ok: false; motivo: "formato" | "cpf" | "cnpj" | "email" | "telefone" }`; `validarChaveAleatoria(entrada: string): ResultadoChave` (normaliza: trim, minúsculas, aceita 32 hex sem hífens e devolve com hífens `8-4-4-4-12`); `mascararChave(chave: string): string` → `"7f3a9c2e-••••-••••-••••-c21e5a6b0d93"`; `mensagemRecusa(motivo): string` com os textos da spec ("só chave aleatória; CPF, e-mail e telefone dizem quem você é").

- [ ] **Step 1:** Testes: UUID válido passa; com maiúsculas e espaços normaliza; 32 hex sem hífens vira UUID com hífens; `"123.456.789-09"` e `"12345678909"` → `cpf`; `"12.345.678/0001-95"` → `cnpj`; `"a@b.com"` → `email`; `"+5511999999999"` e `"11999999999"` → `telefone`; `"abc"` → `formato`; `mascararChave` mantém só o primeiro e o último grupo.
- [ ] **Step 2:** Rodar: FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(dominio): validação e máscara de chave Pix aleatória`.

### Task 3: Mensagem e apelido

**Files:**
- Create: `src/domain/texto/validar-mensagem.ts`, `src/domain/texto/validar-apelido.ts`, testes ao lado.

**Interfaces:**
- Produces: `validarMensagem(entrada: string, bloqueadas: string[]): { ok: true; mensagem: string | null } | { ok: false; motivo: "tamanho" | "link" | "contato" | "bloqueada" }` (trim, vazio → `null`, colapsa espaços, 140 chars, recusa URLs, e-mails, sequências de 10+ dígitos, padrão de CPF, palavras da lista sem distinguir acento/caixa); `validarApelido(entrada: string): { ok: true; apelido: string | null } | { ok: false; motivo: "formato" }` (trim, minúsculas, vazio → `null`).

- [ ] **Step 1:** Testes para cada motivo e para os casos felizes, inclusive `"  toma,   compra um pastel "` → `"toma, compra um pastel"` e apelido `"Pastel_De_Vento"` → `"pastel_de_vento"`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(dominio): validação de mensagem e apelido`.

### Task 4: Criptografia

**Files:**
- Create: `src/infra/crypto.ts`, `src/infra/crypto.test.ts`

**Interfaces:**
- Produces (todas com WebCrypto, funcionam em Node e workerd): `cifrar(texto: string, chaveBase64: string): Promise<string>` → `"enc:v1:<iv_b64>:<ct_b64>"`; `decifrar(valor: string, chaveBase64: string): Promise<string>` (aceita texto sem prefixo e devolve como está, para rollout); `hmacHex(texto: string, segredoBase64: string): Promise<string>`; `gerarToken(bytes?: number): string` (base64url, padrão 24 bytes); `sha256Hex(texto: string): Promise<string>`; `assinarCookie(valor: string, segredo: string): Promise<string>` e `verificarCookie(assinado: string, segredo: string): Promise<string | null>`.

- [ ] **Step 1:** Testes: round-trip cifra/decifra; dois `cifrar` do mesmo texto diferem (IV aleatório); `decifrar` com chave errada lança; texto sem prefixo volta igual; `hmacHex` determinístico e diferente por segredo; `gerarToken()` tem 32 chars e nunca repete em 1000 chamadas; cookie adulterado → `null`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(infra): cifra AES-GCM, HMAC, tokens e cookie assinado`.

### Task 5: Esquema do banco, migrações, cliente e harness de teste

**Files:**
- Create: `src/infra/db/schema/recebedores.ts`, `doacoes.ts`, `repasses.ts`, `lancamentos.ts`, `apelidos.ts`, `operacao.ts` (configuracao, eventos_webhook, denuncias, limites), `src/infra/db/schema/index.ts`
- Create: `src/infra/db/client.ts`, `src/infra/db/migrar.ts`, `src/infra/db/teste.ts`, `src/infra/db/config.ts`, `src/infra/db/schema.test.ts`
- Create: `drizzle/0000_*.sql` (gerado), `scripts/migrar.ts`

**Interfaces:**
- Produces: `type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>` exportado como `Db` de `client.ts`; `criarDb(connectionString: string): { db: Db; fechar(): Promise<void> }`; `criarDbTeste(): Promise<{ db: Db; fechar(): Promise<void> }>` (PGlite em memória com migrações aplicadas); `lerConfig(db): Promise<Config>` e `gravarConfig(db, parcial)`, onde `Config = { taxaBp: number; minimoCentavos: number; maximoCentavos: number; gatilhoRepasse: "imediato" | "diario"; minimoRepasseCentavos: number; palavrasBloqueadas: string[]; apelidosForaDoRanking: string[]; expiracaoIntencaoMin: number }` com padrões `1000, 500, 50000, "diario", 0, [], [], 30`.
- Tabelas (colunas essenciais; builder completa tipos e índices):
  - `recebedores`: `id uuid pk`, `numero_publico integer generated always as identity unique`, `token_hash text unique`, `status enum('aguardando_validacao','ativa','pausada','removida','invalida')`, `criado_em`, `atualizado_em`.
  - `chaves_pix`: `id`, `recebedor_id fk`, `chave_cifrada text`, `chave_hmac text`, `ativa boolean`, `criada_em`, `desativada_em`; índice único parcial `(chave_hmac) where ativa`.
  - `doacoes`: `id uuid pk`, `numero_comprovante integer identity unique`, `recebedor_id fk`, `valor_centavos`, `taxa_bp`, `taxa_centavos`, `liquido_centavos`, `mensagem text null`, `mensagem_oculta boolean default false`, `apelido_texto text null`, `apelido_id fk null`, `status enum('pendente','confirmada','expirada','estornada')`, `ref_externa text unique`, `provedor_pagamento_id text null`, `repasse_id fk null`, `criada_em`, `expira_em`, `confirmada_em null`, `estornada_em null`.
  - `repasses`: `id`, `recebedor_id`, `chave_pix_id`, `valor_centavos`, `status enum('agendado','enviando','concluido','falhou')`, `ref_externa unique`, `provedor_id null`, `tentativas int default 0`, `erro text null`, `agendado_para`, `criado_em`, `concluido_em null`.
  - `lancamentos`: `id bigserial`, `tipo enum('entrada','taxa','saida','reversao_entrada','reversao_taxa')`, `valor_centavos` (com sinal: entrada +, taxa −, saída −, reversões invertem), `doacao_id null`, `repasse_id null`, `criado_em`.
  - `apelidos`: `id`, `nome text unique`, `email_hash text unique`, `email_cifrado text`, `confirmado_em null`, `criado_em`. `tokens_magicos`: `id`, `apelido_id`, `doacao_id null`, `token_hash unique`, `expira_em`, `usado_em null`.
  - `configuracao`: `chave text pk`, `valor jsonb`, `atualizada_em`. `eventos_webhook`: `id`, `provedor`, `id_externo`, `payload jsonb`, `recebido_em`, `processado_em null`; único `(provedor, id_externo)`. `denuncias`: `id`, `doacao_id`, `motivo text null`, `criada_em`, `resolvida_em null`. `limites`: `chave text`, `janela timestamptz`, `contagem int`; pk `(chave, janela)`.

- [ ] **Step 1:** Escrever `schema.test.ts`: `criarDbTeste()` sobe; `select * from recebedores` responde vazio; inserir dois recebedores dá `numero_publico` 1 e 2; inserir a mesma `chave_hmac` ativa duas vezes lança; `lerConfig` devolve os padrões; `gravarConfig({taxaBp: 1500})` persiste.
- [ ] **Step 2:** Rodar: FAIL.
- [ ] **Step 3:** Escrever os schemas; `pnpm db:generate` gera `drizzle/0000_*.sql`; `migrar.ts` exporta `aplicarMigracoes(db)` usando o migrator do driver correto; `teste.ts` usa `drizzle-orm/pglite` + `drizzle-orm/pglite/migrator` com `migrationsFolder: "drizzle"`; `client.ts` usa `postgres(connectionString, { max: 5, prepare: false })` (pooler em modo transação exige `prepare: false`).
- [ ] **Step 4:** PASS. Também rodar `pnpm db:migrate` contra o Postgres local (`DATABASE_URL=postgres://postgres@localhost:5433/pix_esconde`) e conferir com `psql`/drizzle que as tabelas existem.
- [ ] **Step 5:** Commit `feat(infra): esquema Drizzle, migrações, PGlite para testes, configuração`.

### Task 6: Recebedores (cadastro, estados, lista, sorteio)

**Files:**
- Create: `src/domain/recebedores/servico.ts`, `src/domain/recebedores/servico.test.ts`

**Interfaces:**
- Consumes: Task 2, 4, 5.
- Produces: `criarServicoRecebedores(db: Db, segredos: { chaveCifra: string; segredoHmac: string }): ServicoRecebedores` com:
  - `cadastrar(entradaChave: string): Promise<{ ok: true; numeroPublico: number; token: string } | { ok: false; motivo: MotivoChave | "duplicada" }>`
  - `buscarPorToken(token: string): Promise<RecebedorPrivado | null>` (inclui `chaveMascarada`, `status`, `numeroPublico`)
  - `buscarPublico(numeroPublico: number): Promise<RecebedorPublico | null>` (`numeroPublico`, `status`, `totalRecebidoCentavos`, `quantidadePix`, `ultimaMensagem: { texto; apelido; em } | null`, `criadoEm`)
  - `listarPublico(opts: { ordem: "recentes" | "menos_receberam" | "mais_receberam" | "aleatoria"; limite: number; pagina: number }): Promise<{ itens: RecebedorPublico[]; total: number }>` (só `ativa` e `aguardando_validacao`)
  - `sortear(): Promise<number | null>` (numero público de um recebedor elegível, uniforme)
  - `pausar(id)`, `reativar(id)`, `remover(id)`, `trocarChave(id, entradaChave): Promise<ResultadoChave | { ok: false; motivo: "duplicada" }>`
  - `obterChaveDecifrada(recebedorId): Promise<{ chavePixId: string; chave: string } | null>` (uso interno do repasse)
  - `marcarInvalida(recebedorId)`.
  - Estatísticas públicas consideram só doações `confirmada`.

- [ ] **Step 1:** Testes em PGlite: cadastrar devolve número 1 e token de 32 chars, e `buscarPorToken` encontra; cadastrar a mesma chave duas vezes → `duplicada`; cadastrar CPF → `cpf`; token errado → `null`; `listarPublico` não mostra pausada/removida; `sortear()` com zero elegíveis → `null`; `sortear()` com 3 elegíveis devolve cada um ao menos uma vez em 200 sorteios; `trocarChave` para chave ativa de outro recebedor → `duplicada`; `trocarChave` válida desativa a anterior e volta status para `aguardando_validacao`; `obterChaveDecifrada` devolve o UUID original.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(recebedores): cadastro, link secreto, lista, sorteio, troca de chave`.

### Task 7: Interfaces de provedores e implementações falsas

**Files:**
- Create: `src/providers/tipos.ts`, `src/providers/payment-in/fake.ts`, `src/providers/payout/fake.ts`, `src/providers/email/console.ts`, `src/providers/captcha/sempre-ok.ts`, `src/providers/index.ts`, testes para os dois fakes.

**Interfaces:**
- Produces:
  ```ts
  interface ProvedorEntrada {
    criarCobranca(i: { refExterna: string; valorCentavos: number; descricao: string; urlRetorno: string; expiraEm: Date }): Promise<{ urlPagamento: string; idProvedor: string | null }>;
    consultar(i: { refExterna: string; idProvedor: string | null }): Promise<{ status: "aprovado" | "pendente" | "rejeitado" | "desconhecido"; valorCentavos: number | null; idProvedor: string | null }>;
    reembolsar(i: { idProvedor: string; valorCentavos: number }): Promise<{ ok: boolean; erro?: string }>;
  }
  interface ProvedorSaida {
    enviar(i: { refExterna: string; chavePix: string; valorCentavos: number; descricao: string }): Promise<{ idProvedor: string; status: "concluido" | "processando" | "falhou"; chaveInvalida: boolean; erro?: string }>;
    consultar(idProvedor: string): Promise<{ status: "concluido" | "processando" | "falhou" }>;
  }
  interface ProvedorEmail { enviar(i: { para: string; assunto: string; texto: string; html: string }): Promise<void> }
  interface ProvedorCaptcha { verificar(token: string | null, ip: string | null): Promise<boolean> }
  type Provedores = { entrada: ProvedorEntrada; saida: ProvedorSaida; email: ProvedorEmail; captcha: ProvedorCaptcha };
  criarProvedores(env: { PROVEDOR_PAGAMENTO: string; PROVEDOR_REPASSE: string; URL_PUBLICA: string }): Provedores  // "fake" → fakes; "mercadopago" → lança "não implementado nesta fase"
  ```
- Comportamento dos fakes: `FakeEntrada.criarCobranca` devolve `urlPagamento = ${URL_PUBLICA}/dev/pagar/${refExterna}` e guarda em memória; `consultar` responde o que a rota de dev marcou (`aprovado`/`rejeitado`) ou `pendente`. `FakeSaida.enviar`: chave começando com `00000000` → `falhou` com `chaveInvalida: true`; começando com `ffffffff` → `falhou` transitório; demais → `concluido`, `idProvedor = "fake_" + refExterna`.

- [ ] **Step 1:** Testes dos fakes conforme acima.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(providers): interfaces e provedores falsos`.

### Task 8: Doações (intenção, confirmação idempotente, expiração, razão)

**Files:**
- Create: `src/domain/doacoes/servico.ts`, `servico.test.ts`, `src/domain/razao/servico.ts` (funções `lancar(db, ...)` e `saldo(db)`), `razao.test.ts`.

**Interfaces:**
- Consumes: Tasks 1, 3, 5, 6, 7.
- Produces: `criarServicoDoacoes(deps: { db: Db; provedores: Provedores; recebedores: ServicoRecebedores; config: () => Promise<Config>; urlPublica: string; agora?: () => Date }): ServicoDoacoes`:
  - `criarIntencao(i: { numeroPublico: number; valorTexto: string; mensagem: string; apelido: string; apelidoIdDoCookie: string | null }): Promise<{ ok: true; doacaoId: string; urlPagamento: string } | { ok: false; campo: "valor" | "mensagem" | "apelido" | "recebedor"; motivo: string }>` — ref externa `doa_<uuid>`; `expira_em = agora + expiracaoIntencaoMin`.
  - `processarNotificacao(i: { provedor: string; idExterno: string; refExterna: string; idProvedor: string | null; payload: unknown }): Promise<{ resultado: "confirmada" | "ja_processada" | "nao_aprovada" | "desconhecida"; efeitosPendentes: boolean }>` — registra em `eventos_webhook` (único → `ja_processada`), consulta provedor, compara `valorCentavos` com o registrado (divergência só loga), `UPDATE doacoes SET status='confirmada' WHERE id=? AND status='pendente'` (0 linhas → `ja_processada`), lança `entrada` (+valor) e `taxa` (−taxa) no razão; efeitos pós-confirmação dentro de try/catch: atribuir apelido por cookie, e se `gatilhoRepasse === "imediato"` chamar `repasses.agendarParaRecebedor` (injetado depois via `setRepasses`, para evitar ciclo).
  - `expirarIntencoes(): Promise<number>` — pendentes com `expira_em < agora` → `expirada`.
  - `buscarComprovante(id: string): Promise<Comprovante | null>` com `numeroComprovante`, `status`, `valor`, `taxa`, `liquido`, `numeroPublico`, `apelidoTexto`, `mensagem`, `confirmadaEm`, `previsaoRepasse: "no próximo repasse" | "repassado" | null`.
  - `estornar(doacaoId, motivo)`: só confirmada e sem repasse concluído → `estornada`, lança `reversao_entrada` e `reversao_taxa`, chama `provedores.entrada.reembolsar`.
  - Razão: `lancar(db, { tipo, valorCentavos, doacaoId?, repasseId? })`, `saldo(db): Promise<number>`.

- [ ] **Step 1:** Testes: intenção com `valorTexto "4,99"` → `campo: "valor"`; `"5"` cria doação pendente com `taxa 50`, `liquido 450` e URL do fake; recebedor pausado → `campo: "recebedor"`; `processarNotificacao` com fake aprovado → `confirmada`, razão com +500 e −50, `saldo()` = 450; **a mesma notificação de novo → `ja_processada`, razão continua com 2 lançamentos**; notificação com outro `idExterno` para a mesma doação → `ja_processada` (status já confirmada), ainda 2 lançamentos; fake rejeitado → `nao_aprovada`, doação continua pendente; `expirarIntencoes` com relógio adiantado 31 min marca `expirada` e não toca confirmadas; `estornar` gera reversões e `saldo()` volta a 0; confirmar com `gatilhoRepasse: "imediato"` chama o agendador injetado uma vez.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(doacoes): intenção, confirmação idempotente por webhook, razão`.

### Task 9: Repasses

**Files:**
- Create: `src/domain/repasses/servico.ts`, `servico.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 6, 7, 8.
- Produces: `criarServicoRepasses(deps: { db: Db; provedores: Provedores; recebedores: ServicoRecebedores; config: () => Promise<Config>; agora?: () => Date }): ServicoRepasses`:
  - `agendarParaRecebedor(recebedorId: string): Promise<string | null>` — soma `liquido_centavos` das doações `confirmada` com `repasse_id null`; se ≥ `minimoRepasseCentavos` e > 0, cria repasse `agendado` (ref `rep_<uuid>`, `agendado_para = agora`) e marca as doações com `repasse_id`, tudo na mesma transação; se já existe repasse `agendado`/`enviando` para o recebedor, anexa as doações a ele e atualiza o valor.
  - `agendarTodos(): Promise<number>` — para o cron diário.
  - `processarAgendados(limite?: number): Promise<{ concluidos: number; falhos: number }>` — pega `agendado` com `agendado_para <= agora`, marca `enviando`, decifra a chave, chama `saida.enviar`; `concluido` → lança `saida` (−valor), `concluido_em`; `chaveInvalida` → `falhou`, `recebedores.marcarInvalida`; falha transitória → volta a `agendado` com `tentativas+1` e `agendado_para = agora + 2^tentativas min`, até 5, depois `falhou` definitivo.
  - `devolverRetidos(diasLimite = 30): Promise<number>` — recebedores `invalida` há mais de N dias com doações sem repasse concluído → `doacoes.estornar` cada uma.
  - `listarDoRecebedor(recebedorId)` para a página secreta.

- [ ] **Step 1:** Testes: duas doações confirmadas (450 + 1800) → um repasse de 2250 e ambas com `repasse_id`; `processarAgendados` com fake → `concluido`, razão com −2250, `saldo()` igual à soma das taxas; chave `00000000-…` → `falhou`, recebedor `invalida`; chave `ffffffff-…` → volta a `agendado` com `tentativas 1` e `agendado_para` no futuro; na 6ª tentativa → `falhou`; `agendarParaRecebedor` sem doações → `null`; `devolverRetidos` com relógio +31 dias estorna e razão volta ao zero líquido para aquela doação.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(repasses): agrupamento, envio com retentativa, devolução de retidos`.

### Task 10: Apelidos, ranking e denúncias

**Files:**
- Create: `src/domain/apelidos/servico.ts`, `servico.test.ts`, `src/domain/ranking/servico.ts`, `ranking.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 7, 8.
- Produces: `criarServicoApelidos(deps: { db; provedores; segredos: { chaveCifra; segredoHmac; segredoCookie }; urlPublica; agora? })`:
  - `solicitarVinculo(i: { doacaoId: string; email: string }): Promise<{ ok: true } | { ok: false; motivo: "sem_apelido" | "apelido_de_outro" | "email_invalido" }>` — a doação precisa ter `apelido_texto` e estar confirmada; se o apelido existe com outro `email_hash` → `apelido_de_outro`; cria apelido (se não existe) com `email_hash = hmac(email)` e `email_cifrado`; cria token mágico (expira 30 min) e envia e-mail com `${urlPublica}/apelido/confirmar/${token}`.
  - `confirmarToken(token: string): Promise<{ ok: true; apelidoId: string; cookie: string } | { ok: false }>` — token válido, não usado, não expirado → marca `usado_em`, `confirmado_em` no apelido, `doacoes.apelido_id` **só na doação do token**, devolve cookie assinado `apelido:<id>`.
  - `apelidoIdDoCookie(valorCookie: string | null): Promise<string | null>`.
  - `denunciar(doacaoId, motivo)`: insere denúncia e `mensagem_oculta = true`.
  - `criarServicoRanking(db)`: `doadores(i: { por: "valor" | "quantidade"; periodo: "tudo" | "mes" | "semana"; limite: number; excluir: string[] }): Promise<{ posicao; apelido; totalCentavos; quantidade }[]>` — só doações `confirmada` com `apelido_id` confirmado; demais agregadas numa linha `"anônimo"` no fim, fora da numeração; `resumoHome(): Promise<{ totalChaves; totalCentavos }>`.

- [ ] **Step 1:** Testes: vínculo → e-mail "enviado" (fake registra); token confirma uma vez e a segunda vez falha; token expirado falha; `apelido_de_outro` quando `email_hash` difere; cookie assinado resolve o id e cookie adulterado resolve `null`; ranking ordena por valor, respeita período, ignora apelido não confirmado e exclui os da configuração; `denunciar` oculta.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(apelidos): vínculo por link mágico, cookie de dono, ranking, denúncias`.

### Task 11: Worker, contexto de serviços, cron, layout e tokens visuais

**Files:**
- Modify: `workers/app.ts`; Create: `app/contexto.server.ts`, `app/servicos.server.ts`, `app/root.tsx` (reescrever), `app/app.css`, `app/componentes/{Cabecalho,Rodape,Botao,Carimbo,Campo,Tabela}.tsx`, `public/fonts/*.woff2`, `app/componentes/Carimbo.test.tsx`

**Interfaces:**
- Produces: `cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>()`; `servicosContext = createContext<Servicos>()` onde `Servicos = { db; config; provedores; recebedores; doacoes; repasses; apelidos; ranking; segredos; urlPublica }`; `montarServicos(env: Env): Servicos` (um por requisição; `criarDb(env.HYPERDRIVE.connectionString)`); `workers/app.ts` exporta `fetch` (cria `RouterContextProvider`, seta os dois contextos) e `scheduled` (chama `doacoes.expirarIntencoes`, `repasses.agendarTodos` se `gatilhoRepasse === "diario"` e for o horário configurado, `repasses.processarAgendados`, `repasses.devolverRetidos`); `ctx.waitUntil(db.fechar())`.
- Tokens em `app.css` via `@theme`: `--color-tinta: #141414; --color-papel: #ffffff; --color-cinza: #555555; --color-linha: #bdbdbd; --color-pix: #32BCAD; --color-carimbo: #D7263D; --font-mono: "IBM Plex Mono"; --font-titulo: "Archivo Narrow"`. Fontes baixadas de Google Fonts como woff2 (OFL) para `public/fonts`, `@font-face` com `font-display: swap`.
- Componentes: `Botao({ variante: "primario" | "contorno"; tamanho?: "p" | "m" })`, `Carimbo({ texto, tom: "vermelho" | "pix" })`, `Campo({ rotulo, dica?, erro?, children })`, `Cabecalho({ ativa?: "chaves" | "ranking" | "como" })`, `Rodape()`. Hover: botão sobe 1px e escurece; links sublinham ao passar; sem animação de entrada em cards.

- [ ] **Step 1:** Teste de componente: `Carimbo` renderiza o texto com `aria-hidden` falso e classe do tom; `Botao` primário é `<button>` ou `<a>` conforme `href`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar tudo acima; `root.tsx` com `<html lang="pt-BR">`, meta viewport, `Links`, fontes, `ErrorBoundary` no tom da direção ("Deu ruim. Não foi você."). **Step 4:** PASS; `pnpm typecheck` passa (atenção ao tipo de `context` nos loaders: `Route.LoaderArgs["context"]` é `RouterContextProvider`).
- [ ] **Step 5:** `pnpm dev` sobe e `/` responde 200 com o layout vazio. Commit `feat(app): worker, contexto de serviços, cron, layout e tokens da direção Comprovante`.

### Task 12: Rotas públicas: home, lista, sorteio, como funciona

**Files:**
- Modify: `app/routes.ts`; Create: `app/routes/home.tsx`, `app/routes/chaves.tsx`, `app/routes/sortear.tsx`, `app/routes/como-funciona.tsx`, `app/componentes/ListaRecebedores.tsx`, `app/componentes/RankingResumo.tsx`, `app/routes/home.server.test.ts`, `app/routes/sortear.server.test.ts`, `app/teste/contexto.ts` (helper que monta `RouterContextProvider` com serviços sobre PGlite e provedores falsos)

- [ ] **Step 1:** Testes de loader: `home.loader` devolve `resumo`, `recebedores` (até 8, ordem `recentes`) e `ranking` (top 3); `sortear.loader` sem elegíveis → `redirect("/cadastrar?motivo=vazio")` (status 302 e header `Location`); com elegíveis → redirect para `/mandar/<n>`; `chaves.loader` lê `?ordem=` e `?pagina=` e ignora valores inválidos.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar conforme o mockup `fluxos-comprovante-v2.html` seção 1: manchete "Mande um Pix pra um estranho.", subtítulo, dois botões, contadores, tabela de recebedores (`anônimo #0427`, última mensagem com apelido e tempo relativo, total, botão "mandar pix"), caixa de ranking, carimbo "SEM MOTIVO". `como-funciona.tsx` cobre: o que é, taxa (lida da config), repasse, anonimato, o que não fazemos. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(rotas): home, lista de chaves, sorteio, como funciona`.

### Task 13: Rotas de doação: mandar, comprovante, pagamento falso, webhook

**Files:**
- Create: `app/routes/mandar.tsx`, `app/routes/comprovante.tsx`, `app/routes/dev.pagar.tsx`, `app/routes/webhooks.fake.ts`, `app/routes/mandar.server.test.ts`, `app/routes/webhooks.fake.server.test.ts`

- [ ] **Step 1:** Testes: `mandar.action` com `valor "4,99"` devolve `data({ erros: { valor } }, { status: 400 })`; com `valor "5"`, mensagem e apelido válidos, devolve `redirect(urlPagamento)`; captcha falso recusando → erro de formulário; `webhooks.fake.action` com `ref` e `resultado=aprovado` chama `processarNotificacao` e responde 200 com JSON `{ resultado }`; dois POSTs iguais → segundo responde `ja_processada`; rota `dev.pagar` responde 404 quando `PROVEDOR_PAGAMENTO !== "fake"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar conforme mockup seção 2 e 3: chips de valor (5/10/20/50/outro) com `name="valor"`, campo mensagem com contador de 140, campo apelido, decomposição da taxa calculada no servidor (loader) e também ao vivo no cliente com `calcularTaxa`, botão "Pagar R$ X no Mercado Pago" (texto fixo, mesmo com provedor falso), nota do descritor. `comprovante.tsx`: recibo conforme mockup, estado `pendente` mostra "aguardando confirmação" com `<meta http-equiv="refresh" content="3">`, estado `confirmada` mostra carimbo "PAGO", botões "Baixar imagem" (link para `/comprovante/:id/imagem.png`, Task 16) e "Mandar outro", caixa de vínculo de apelido (Task 15). `dev.pagar.tsx`: página com dois botões (aprovar / rejeitar) que fazem POST em `/webhooks/fake` e redirecionam para o comprovante. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(rotas): mandar pix, comprovante, pagamento falso e webhook`.

### Task 14: Rotas de cadastro e página secreta

**Files:**
- Create: `app/routes/cadastrar.tsx`, `app/routes/k.tsx`, `app/routes/cadastrar.server.test.ts`, `app/routes/k.server.test.ts`

- [ ] **Step 1:** Testes: `cadastrar.action` com CPF → erro com a mensagem de recusa; com UUID → `redirect("/k/<token>?nova=1")`; `k.loader` com token inexistente → `Response` 404; com token válido → dados do recebedor, totais e lista de doações; `k.action` com `intent=pausar|reativar|remover|trocar|denunciar` muda o estado correspondente; `trocar` com chave duplicada → erro.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar conforme mockup seções 4 e 5. Limite por IP via tabela `limites` (`src/infra/limites.ts`: `permitir(db, chave, janelaMin, maximo)`): cadastro 10/dia por IP; a mesma função é usada em `mandar.action` com 30/hora por IP (acrescentar o teste lá). IP vem de `CF-Connecting-IP`, e `"local"` quando ausente. formulário com explicação de repasse e taxa (da config), aviso "Antes que você pergunte"; sucesso mostra carimbo "NA RODA", número, link completo, botão copiar (client-side, `navigator.clipboard`), status; página secreta com três caixas, abas mensagens/repasses (por `?aba=`), ações com `<Form method="post">` e confirmação nativa para remover. Cookie `Set-Cookie` não é usado aqui: o acesso é só pelo token na URL. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(rotas): cadastrar chave e página secreta do recebedor`.

### Task 15: Ranking e confirmação de apelido

**Files:**
- Create: `app/routes/ranking.tsx`, `app/routes/apelido.confirmar.tsx`, `app/routes/ranking.server.test.ts`, `app/routes/apelido.confirmar.server.test.ts`; Modify: `app/routes/comprovante.tsx` (action `intent=vincular`), `app/routes/mandar.tsx` (ler cookie do dono via `apelidoIdDoCookie`).

- [ ] **Step 1:** Testes: `comprovante.action` com e-mail inválido → erro; válido → `{ ok: true }` e fake de e-mail registra uma mensagem contendo `/apelido/confirmar/`; `apelido.confirmar.loader` com token válido → redirect para `/ranking?apelido=<nome>` com `Set-Cookie` contendo `apelido=`; token reutilizado → página "esse link já foi usado"; `ranking.loader` respeita `?por=` e `?periodo=`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar: ranking com abas por período e alternância valor/quantidade, linha "anônimo" agregada no fim; página de confirmação com o tom da direção. Cookie: `apelido`, `HttpOnly`, `SameSite=Lax`, `Secure` fora de dev, 1 ano. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(rotas): ranking e confirmação de apelido`.

### Task 16: Imagem do comprovante e metadados de compartilhamento

**Files:**
- Create: `app/routes/comprovante.imagem.tsx` (rota `/comprovante/:id/imagem.png`), `src/infra/imagem/comprovante.tsx` (árvore JSX para satori), `src/infra/imagem/comprovante.test.ts`; Modify: `app/routes/comprovante.tsx` (`meta` com `og:image`, `og:title`, `twitter:card`).

- [ ] **Step 1:** Teste (node): `gerarSvgComprovante(dados, fontes)` devolve string começando com `<svg` e contendo o valor formatado e `anônimo #0427`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar com satori (1080×1080, fundo papel, tipografia da direção, carimbo PAGO). Na rota: carregar as fontes via `env.ASSETS.fetch(new URL("/fonts/...", request.url))`, satori → SVG → `@resvg/resvg-wasm` → PNG, cabeçalho `Cache-Control: public, max-age=31536000, immutable` para confirmadas. Inicializar o wasm uma vez por isolate (`import wasm from "@resvg/resvg-wasm/index_bg.wasm"`). Se o wasm não carregar no Worker, a rota devolve o SVG com `Content-Type: image/svg+xml` e o `og:image` aponta para ele, e isso fica registrado no relatório final como pendência. **Step 4:** PASS; `pnpm build` passa; abrir `/comprovante/<id>/imagem.png` no dev e ver a imagem.
- [ ] **Step 5:** Commit `feat(comprovante): imagem para compartilhar e metadados Open Graph`.

### Task 17: Seeds, scripts operacionais e passagem visual

**Files:**
- Create: `scripts/seed.ts`, `scripts/config.ts` (`pnpm tsx scripts/config.ts set taxaBp 1500`), `scripts/denuncias.ts` (listar/resolver), `scripts/razao.ts` (saldo e últimos lançamentos). Scripts rodam em Node com `DATABASE_URL`.

- [ ] **Step 1:** `seed.ts` cria 12 recebedores com números e chaves aleatórias válidas, 40 doações confirmadas distribuídas com mensagens do mockup, 3 apelidos confirmados, 2 repasses concluídos, tudo pelo próprio domínio (não por INSERT cru), para o razão ficar consistente. Idempotente: se já há recebedores, não faz nada.
- [ ] **Step 2:** Rodar `pnpm db:seed` contra o Postgres local; `pnpm dev`; percorrer com Playwright as cinco telas em 1440 e 390 e salvar capturas em `.playwright-mcp/`. Corrigir o que estiver quebrado visualmente (sem rodar o gate completo da tasteskill: isto é um app com formulários, não uma landing; registrar no relatório).
- [ ] **Step 3:** Commit `chore: seeds e scripts de operação`.

### Task 18: Ponta a ponta, verify.sh final e README

**Files:**
- Create: `playwright.config.ts`, `e2e/fluxo-completo.spec.ts`; Modify: `README.md`, `.claude/verify.sh`, `package.json` (`e2e` sobe o dev server via `webServer`).

- [ ] **Step 1:** Spec Playwright: abre `/cadastrar`, cadastra uma chave UUID gerada, guarda o link secreto; vai para `/mandar/<numero>`, escolhe R$ 10, mensagem "teste e2e", apelido "robo_e2e", clica pagar; na página de pagamento falso clica "aprovar"; o comprovante mostra "PAGO" e "R$ 10,00"; a página secreta mostra "R$ 10,00" e a mensagem; `/ranking` existe e responde 200.
- [ ] **Step 2:** Rodar `pnpm e2e`. Esperado: PASS. Se falhar, é bug real: corrigir no módulo dono.
- [ ] **Step 3:** `verify.sh` final: typecheck, `vitest run`, build. E2E fica em `pnpm e2e` separado (precisa de Postgres), documentado no README junto com: subir Postgres local (`docker start pix-esconde-pg`), `.dev.vars`, migrar, seed, dev, e a lista de pendências externas (Payouts, PJ, contador, domínio, Supabase + Hyperdrive reais).
- [ ] **Step 4:** Rodar `.claude/verify.sh`. Esperado: PASS com a saída registrada no relatório final.
- [ ] **Step 5:** Commit `test: ponta a ponta do fluxo completo; docs: README`.
