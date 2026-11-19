# pix esconde

Mande um Pix pra um estranho. Sem motivo. A partir de R$ 5.

Pessoas colocam uma chave Pix **aleatória** na roda; desconhecidos escolhem (ou sorteiam) uma e mandam um Pix com
uma mensagenzinha. Quem manda não sabe quem recebeu, quem recebe não sabe quem mandou: a plataforma é a única
contraparte visível dos dois lados. Desenho completo em `docs/superpowers/specs/2026-11-18-pix-esconde-design.md`;
plano do estrutural em `docs/superpowers/plans/2026-11-18-pix-esconde-estrutural.md`.

## Stack

React Router 8 (framework mode, SSR) em Cloudflare Workers · Postgres (Supabase em produção, via Hyperdrive) com
Drizzle · Tailwind 4 · Vitest (domínio em PGlite, Postgres em WASM) · Playwright · satori + resvg para a imagem do
comprovante.

```
app/            rotas, loaders, actions, componentes
src/domain/     regras: recebedores, doacoes, repasses, apelidos, ranking, razao
src/providers/  interfaces de pagamento (entrada/saída), e-mail e captcha + implementações falsas
src/infra/      drizzle (schema, migrações), cripto, limites, imagem
workers/app.ts  entrada do Worker: fetch (site) + scheduled (cron a cada 15 min)
scripts/        migrar, seed, config, denúncias, razão (operação sem painel)
drizzle/        migrações SQL versionadas
```

## Rodar local

Pré-requisitos: Node 22+, pnpm, Docker.

```bash
# 1. Postgres local (porta 5433, usuário/senha postgres, só localhost)
docker start pix-esconde-pg   # primeira vez: ver "Banco local" abaixo

# 2. Variáveis
cp .dev.vars.example .dev.vars   # gere os três segredos com: openssl rand -base64 32

# 3. Dependências, migrações, dados de exemplo
pnpm install
set -a; . ./.dev.vars; set +a
pnpm db:migrate
pnpm db:seed      # imprime o link secreto do anônimo #0001

# 4. Dev server (runtime do Worker, com bindings locais)
pnpm dev          # http://localhost:5173
```

Com `PROVEDOR_PAGAMENTO=fake` (padrão em dev), o botão de pagar leva para `/dev/pagar/:ref`, uma página que
aprova ou rejeita a cobrança e dispara o mesmo webhook que o Mercado Pago vai disparar.

### Banco local

```bash
docker run -d --name pix-esconde-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pix_esconde postgres:17
# com a imagem do Supabase, o banco nasce de outra dona:
# docker exec pix-esconde-pg psql -U supabase_admin -d postgres -c "ALTER DATABASE pix_esconde OWNER TO postgres;"
```

## Verificar

```bash
.claude/verify.sh   # typecheck + testes unitários (PGlite) + build. "Pronto" = isso passa.
pnpm e2e            # ponta a ponta no navegador; precisa do Postgres local (sobe o dev server sozinho)
```

## Operação (sem painel nesta fase)

```bash
pnpm tsx scripts/config.ts                       # configuração atual (taxa, limites, gatilho de repasse…)
pnpm tsx scripts/config.ts set taxaBp 1500       # muda a quente
pnpm tsx scripts/config.ts set gatilhoRepasse '"imediato"'
pnpm tsx scripts/denuncias.ts                    # mensagens denunciadas; resolver <id> | reexibir <id>
pnpm tsx scripts/razao.ts                        # saldo segundo o razão, repasses presos, estornos pendentes
```

O cron (`triggers.crons` em `wrangler.jsonc`, a cada 15 min) expira intenções, agrupa repasses (às 13h UTC quando o
gatilho é `diario`), envia o que está agendado, concilia envios ambíguos, devolve o que ficou retido por chave inválida
há mais de 30 dias e concilia estornos ambíguos.

## Segurança: decisões que não são óbvias no código

- A chave Pix é guardada cifrada (AES-GCM, `CHAVE_CIFRA`); unicidade por HMAC (`SEGREDO_HMAC`); o token do link
  secreto só existe como hash. Perder o link é perder o acesso, de propósito.
- Todas as tabelas têm RLS ativo sem políticas: a Data API do Supabase não enxerga nada. A aplicação conecta direto,
  como dona das tabelas. **Desligue a Data API no projeto Supabase mesmo assim.**
- Dinheiro: confirmação só por webhook, idempotente; razão append-only; repasse com trava por recebedor, índice
  único, compare-and-swap na transição e conciliação com carência; estorno só do que comprovadamente não saiu.
- Só quem mandou o Pix (cookie HttpOnly do doador) pode vincular o apelido; o apelido só nasce quando o link mágico é
  confirmado; limites por IP, por doação e por e-mail em tudo que gera escrita ou e-mail.
- **satori está pinado em 0.15.x** de propósito: é a última linha que roda em Workers (`satori/wasm` + Yoga como
  módulo). Não atualize sem retestar `/comprovante/:id/imagem.png` no dev server.

## O que falta para produção (fora deste estrutural)

1. **Mercado Pago**: implementar `MercadoPagoCheckoutPro` (entrada) e `MercadoPagoPayouts` (saída) atrás das
   interfaces em `src/providers/tipos.ts`, seguindo a skill `mercadopago-marketplace-integration` (flag única de
   teste em todas as partes, `x-signature`, reconciliação por `GET /v1/payments/{id}`, roteamento de webhook por
   prefixo). Depende da ativação dos Payouts pela equipe de Integrações do MP e da tarifa por envio, que define o
   gatilho de repasse padrão.
2. **Turnstile** real no lugar do captcha `sempre-ok`; **Resend** no lugar do e-mail de console.
3. **Supabase + Hyperdrive**: criar o projeto, apontar o Hyperdrive para o pooler (modo transação), rodar
   `pnpm db:migrate` com `DATABASE_URL` de produção, `wrangler secret put` para `CHAVE_CIFRA`, `SEGREDO_HMAC`,
   `SEGREDO_COOKIE`; `URL_PUBLICA` com https.
4. Conta Mercado Pago PJ, conversa com contador sobre o fluxo de passagem, nome e domínio definitivos.
