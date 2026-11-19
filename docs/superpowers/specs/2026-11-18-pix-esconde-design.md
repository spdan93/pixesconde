# pix esconde — desenho

Data: 2026-11-18. Estado: aguardando aprovação do Daniel.
Nome "pix esconde" é provisório (nome da pasta). Domínio ainda não definido.

## 1. Intenção

Uma plataforma web (desktop e celular, React) onde pessoas colocam uma chave Pix aleatória "na roda" e
desconhecidos mandam Pix para elas sem motivo nenhum, a partir de R$ 5, com uma mensagenzinha opcional.
A plataforma fica com uma taxa e exibe um ranking de maiores doadores. Não é vaquinha: não há causa,
não há pedido, não há história. É meme, acaso e um pouco de ajuda.

A promessa central é **anonimato nos dois sentidos**: quem manda não sabe quem recebeu, quem recebe não
sabe quem mandou. Isso só é possível se a plataforma for a única contraparte visível das duas pontas,
o que define o modelo de dinheiro (seção 5).

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Cadastro de chave em menos de um minuto, sem conta, sem e-mail, sem senha.
- Doar em menos de um minuto: escolher ou sortear, valor, mensagem, pagar.
- Comprovante público e compartilhável que carrega o meme (imagem pronta para story).
- Ranking real, baseado em pagamentos confirmados, nunca autodeclarado.
- Taxa da plataforma visível antes de pagar, sempre.
- Custo de operação zero até ter tráfego.

**Não-objetivos (agora)**
- App nativo. É web responsiva.
- Causas, metas, páginas de campanha, perfis públicos com história.
- Qualquer tipo de chave que não seja aleatória (EVP).
- Outros meios além do Mercado Pago.
- Internacionalização. É Brasil, português, BRL.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Expor quem mandou para quem recebeu, ou vice-versa, em qualquer tela, e-mail, extrato ou comprovante.
- Parecer golpe: taxa escondida, dinheiro que some, repasse sem rastro.
- Parecer aposta ou jogo de azar.
- Virar canal de assédio via mensagenzinha.

## 3. Restrições

- **Provedor de pagamento: Mercado Pago, só ele.** Entrada pelo Checkout Pro (liberado para a conta do
  Daniel hoje). Saída pela API de Payouts, cuja ativação em produção depende de pedido à equipe de
  Integrações do MP e tem tarifa não publicada. Decisão do Daniel em 2026-11-18, depois de avaliar Asaas
  (tarifas fixas de ~R$ 2 por Pix recebido e por Pix enviado, inviáveis para R$ 5).
- **A forma final do pagamento e do repasse ainda não está decidida** (na hora vs. diário agrupado; taxa
  exata). O estrutural é construído primeiro, com o pagamento atrás de interfaces e implementações falsas.
- **Tarifas do MP (Checkout Pro, tabela oficial em 2026-11-18):** Pix 0,99%; cartão de crédito 3,99% a
  4,98% conforme prazo de liberação; boleto 3,99%. A taxa da plataforma tem de ser percentual.
- **Custódia de passagem.** O dinheiro passa pelo saldo MP da plataforma antes do repasse. Exige: conta
  MP pessoa jurídica (o nome do titular aparece para doador e recebedor), repasse automático, livro-razão
  de cada centavo, e conversa com contador antes de abrir ao público. Não é responsabilidade do builder.
- **Preferência de infra do Daniel:** custo zero até escalar; gosta de Supabase e Cloudflare; React.
- **Kit do projeto:** o trabalho só está pronto quando `.claude/verify.sh` passa. Não existe ainda; o
  builder cria.

## 4. Produto: telas e regras

Direção visual escolhida: **"Comprovante"** (mockups em `.superpowers/brainstorm/`, arquivos
`direcao-visual-v2.html` e `fluxos-comprovante-v2.html`). Branco, tinta preta, IBM Plex Mono para o
corpo, Archivo Narrow para títulos, linha pontilhada, verde Pix (#32BCAD) só na ação principal, carimbo
vermelho (#D7263D) "SEM MOTIVO". Humor seco: a interface parece documento oficial de uma coisa absurda.
Na construção, a skill `design-taste-frontend` roda o processo dela (paleta sorteada dentro dessa
direção, checagens em navegador, gate).

### 4.1 Rotas públicas

| Rota | O que é |
|---|---|
| `/` | Home: manchete, "Sortear uma chave", "Escolher na lista", lista de chaves, ranking resumido |
| `/chaves` | Lista completa, ordenável: mais recentes, quem menos recebeu, quem mais recebeu, aleatório |
| `/mandar/:numero` | Formulário de doação para a chave `anônimo #numero` |
| `/sortear` | Sorteia uma chave ativa e redireciona para `/mandar/:numero` |
| `/comprovante/:id` | Comprovante público de um Pix confirmado, com imagem para compartilhar |
| `/cadastrar` | Cadastro de chave aleatória |
| `/k/:token` | Página secreta de quem recebe (token longo, não adivinhável) |
| `/ranking` | Ranking completo de doadores |
| `/como-funciona` | Regras, taxa, repasse, anonimato, em linguagem de gente |
| `/apelido/confirmar/:token` | Confirmação de apelido por link de e-mail |

### 4.2 Chave (quem recebe)

- Só chave aleatória: formato UUID (`8-4-4-4-12` hexadecimal). Qualquer outro formato é recusado na hora
  com a explicação "só chave aleatória; CPF, e-mail e telefone dizem quem você é".
- Uma chave só pode estar na roda uma vez (unicidade sobre a chave normalizada).
- A chave recebe um **número público sequencial** (`anônimo #0427`), e é só isso que aparece em qualquer
  lugar público. A chave em si nunca é exibida, nem parcialmente, exceto mascarada na própria página
  secreta.
- A chave é guardada **cifrada em repouso** (AES-GCM, prefixo de versão `enc:v1:`, chave de cifra em
  variável de ambiente com nome literal no código). A busca por unicidade usa um hash (HMAC) separado.
- O cadastro devolve um **link secreto** `/k/:token`. Sem e-mail, sem senha. Quem perde o link perde o
  acesso (decisão 3 da seção 7). O token é guardado como hash.
- Estados: `aguardando_validacao` (nenhum repasse ainda), `ativa`, `pausada` (não entra em lista nem
  sorteio; doações pendentes continuam), `removida` (sai da roda; saldo pendente ainda é repassado),
  `invalida` (o provedor de saída recusou a chave; dinheiro fica retido e a página secreta avisa).
- Validação real da chave acontece no primeiro repasse, porque o MP só confirma a chave quando tenta pagar.
- **Chave `invalida` pode ser trocada** pelo dono, na própria página secreta, por outra chave aleatória.
  O número público e o histórico continuam os mesmos; o registro guarda histórico de chaves (1 número → N
  chaves, só uma ativa). Se ninguém trocar em 30 dias, o saldo retido é devolvido aos doadores pela API do
  MP (o MP conhece o pagador; a plataforma não precisa saber quem é), e as doações ficam `estornadas`.
- Proteção anti-robô no formulário (Turnstile). Limite de cadastros por IP por dia.

### 4.3 Doação (quem manda)

- Valor mínimo R$ 5,00. Sugestões: 5, 10, 20, 50, outro valor. Valor máximo por doação definido em
  configuração (proposta: R$ 500) para não virar canal de lavagem.
- Mensagem opcional, até 140 caracteres, texto puro. Recusa links, telefones, e-mails e padrões de CPF.
  Lista de palavras bloqueadas configurável. Aparece pública na lista e para quem recebe.
- Apelido opcional (3 a 24 caracteres, `[a-z0-9_]`). Em branco = "anônimo". Apelido só conta no ranking
  acumulado depois de confirmado por e-mail (seção 4.5).
- Antes do botão de pagar aparece a decomposição: valor, taxa da plataforma (percentual e em reais), o que
  chega para quem recebe. Nada disso fica em letra miúda.
- O botão cria uma **intenção de doação** (`pendente`) e chama o provedor de entrada, que devolve a URL
  de pagamento. O usuário é redirecionado. Volta para `/comprovante/:id`, que mostra "aguardando
  confirmação" até o webhook confirmar.
- **Meios de pagamento:** só **Pix e saldo Mercado Pago** no MVP, excluindo cartão e boleto na
  preferência do Checkout Pro (decisão do Daniel). Os dois
  liquidam na hora, não têm prazo de liberação e não têm chargeback. Cartão entra numa fase seguinte, com
  carência de repasse até a data de liberação informada pelo MP (`money_release_date`).
- Estados da doação: `pendente` (intenção criada), `confirmada` (webhook reconciliado), `expirada`
  (intenção sem pagamento após o prazo da preferência, proposta 30 min), `estornada` (devolvida ao
  doador). Toda transição gera lançamento no razão; estorno gera lançamentos de reversão.
- Confirmação só por webhook, nunca pelo retorno do navegador. Reconciliação com o provedor antes de
  marcar `confirmada`. Transição `pendente → confirmada` é atômica e idempotente (webhooks repetem).
- Devolução depois do repasse (MED do Pix, disputa): o Pix já saiu para a chave e não volta. A plataforma
  absorve, registra reversão no razão e marca a doação `estornada`. É risco aceito e um dos motivos para
  o valor máximo por doação.
- Efeitos pós-confirmação (ranking, enfileirar repasse, gerar imagem) rodam dentro de try/catch que não
  derruba a resposta 200 do webhook; falha é marcada para reprocessamento.
- Fatura do cartão / extrato do doador: descritor `PIXESCONDE` (até 13 caracteres, sem espaço, sem acento).

### 4.4 Comprovante

- Público, sem nada que identifique as pontas: valor, `anônimo #numero`, apelido do doador (ou
  "anônimo"), motivo: nenhum, mensagem, quanto chega lá e quando, data, número sequencial `PE-000913`.
- Imagem quadrada gerada no servidor para compartilhar, guardada no R2. Metadados Open Graph apontam para
  ela, para a prévia aparecer no WhatsApp.
- É a peça de distribuição do produto. Deve ficar bonita antes de qualquer outra coisa ficar.

### 4.5 Apelido e ranking

- Ranking por **valor total confirmado** (padrão) e por **quantidade de Pix**. Períodos: tudo, mês, semana.
- Um apelido só acumula depois de vinculado a um e-mail confirmado (link mágico enviado após o primeiro
  pagamento com aquele apelido). Antes disso, cada doação com apelido não confirmado conta como
  "anônimo" no ranking e exibe o apelido só no comprovante.
- Mesmo apelido, dono diferente: o segundo a tentar recebe "esse apelido já tem dono". O vínculo é por
  e-mail, mas o e-mail nunca aparece e é guardado como hash + cifrado para reenvio.
- **Como o dono prova que é dono nas doações seguintes:** ao confirmar o e-mail, o navegador recebe um
  cookie de dono do apelido (longa duração, httpOnly, assinado). Doação feita com esse cookie conta direto.
  Sem o cookie (outro aparelho), o formulário aceita o apelido, mas a doação só é atribuída depois de um
  novo link mágico, enviado para o e-mail já vinculado, sem pedir o e-mail no formulário; até lá conta
  como "anônimo". Nenhuma doação anterior é vinculada retroativamente além da que originou o link: evita
  que o primeiro a confirmar "roube" doações de outros com o mesmo apelido.
- Doações do próprio dono da plataforma não entram no ranking (configuração).
- Também existe um ranking de "quem mais recebeu" e "quem menos recebeu", só por número anônimo, usado
  como ordenação da lista.

### 4.6 Página secreta de quem recebe (`/k/:token`)

- Três números: recebido no total; já caiu na conta (soma dos repasses concluídos, com taxa descontada);
  próximo repasse (pendente, com previsão).
- Abas: mensagens (cada Pix com valor, data, apelido do doador, mensagem, estado do repasse) e repasses
  (cada envio com valor, data, estado, identificador do provedor).
- Ações: pausar, reativar, tirar da roda. Sem pedir motivo.
- Denunciar mensagem: oculta a mensagem para o público e marca o apelido para revisão.
- Qualquer acesso a `/k/:token` com token inválido responde 404 genérico, sem distinguir "não existe" de
  "existiu".

### 4.7 Repasse (saída)

- Cada doação confirmada gera um crédito pendente para a chave. O repasse agrupa créditos pendentes de
  uma chave num envio.
- **Gatilho é configuração**: `imediato` (webhook confirmado dispara envio) ou `diario` (cron agrupa). O
  padrão fica para depois da resposta do MP sobre tarifa de Payouts. O código é o mesmo; só muda quem chama.
- O envio sai da conta da plataforma, valor líquido (já descontada a taxa da plataforma), para a chave
  aleatória. **A tarifa do provedor, de entrada e de saída, é sempre absorvida pela plataforma**, nunca
  descontada do que o comprovante prometeu. Se a tarifa de saída inviabilizar, a resposta é subir o
  percentual da plataforma ou o mínimo, nunca mudar o valor depois de emitido o comprovante. Valor mínimo
  acumulado para repassar é configuração (padrão zero). Identificador de referência externa único por envio; idempotência garantida pelo nosso lado
  (um envio pendente existente é reutilizado, nunca recriado).
- Estados do envio: `agendado`, `enviando`, `concluido`, `falhou`. Falha por chave inválida muda a chave
  para `invalida` e avisa na página secreta. Outras falhas voltam para `agendado` com tentativa limitada.
- **Livro-razão append-only**: toda entrada (pagamento confirmado), taxa retida e saída (repasse) é um
  lançamento. Saldo que a plataforma deveria ter = soma dos lançamentos. Conciliação diária compara com o
  saldo real do provedor e registra divergências.

### 4.8 Abuso e limites

- Turnstile nos dois formulários. Limite por IP para cadastro e para criação de intenção de doação.
- Mensagens passam por filtro (links, contatos, lista de bloqueio). Denúncia oculta e marca.
- Valor máximo por doação e por apelido por dia, configuráveis.
- Nenhum dado pessoal é coletado além do e-mail opcional do apelido. Sem analytics de terceiros no MVP.

### 4.9 Operação (sem área de admin no MVP)

- Não existe `/admin` nem login de operador nesta fase. O sistema inteiro é sem conta, e um subsistema de
  autenticação só para o operador não paga o custo agora.
- **Configuração em tabela** (`configuracao`, chave/valor tipado, lida com cache curto): taxa percentual,
  mínimo e máximo por doação, gatilho de repasse, mínimo acumulado, lista de palavras bloqueadas, apelidos
  excluídos do ranking. Muda a quente, sem redeploy. Segredos ficam em variáveis de ambiente.
- Revisão de denúncias, divergências de conciliação e ajustes de configuração são feitos por **scripts de
  linha de comando** no repositório (rodam contra o banco com credencial de operador) e por consulta
  direta no Supabase. Mensagem denunciada é ocultada automaticamente; o script lista e decide.
- Área de admin com autenticação é fase futura, quando o volume de denúncias justificar.

## 5. Abordagens consideradas

### 5.1 Modelo de dinheiro

| Opção | Como | Por que não / por que sim |
|---|---|---|
| A. Split marketplace do MP (OAuth) | doador paga direto na conta MP de quem recebe, plataforma fica com `marketplace_fee` | **Rejeitada.** Quem recebe vê o nome do pagador no extrato, doador vê a conta recebedora no checkout. Mata o anonimato. Além disso exige conta MP e autorização de quem recebe. |
| B. Passagem: Checkout Pro + Payouts | doador paga a plataforma; plataforma retém a taxa e envia Pix para a chave | **Escolhida.** Única que entrega anonimato nos dois sentidos e cadastro só com chave. Dependência: ativação de Payouts (pedido à equipe de Integrações do MP) e tarifa desconhecida. |
| C. Só exibir a chave, sem processador | doador copia e paga pelo banco | Rejeitada. Sem taxa, sem confirmação, ranking impossível de verificar. |
| D. Asaas (total ou só na saída) | cobrança/transferência Pix por API | Rejeitada pelo custo: tarifas fixas de ~R$ 2 por Pix recebido e por enviado, ~80% de uma doação de R$ 5. Fica registrada como fallback de saída, com repasse agrupado, se o MP negar Payouts. |

### 5.2 Arquitetura

| Opção | Por que não / por que sim |
|---|---|
| A. Next.js full-stack na Vercel + Postgres gerenciado | Boa, mas Vercel não é a preferência do Daniel e o free tier do cron é limitado. |
| B. SPA Vite + backend Node separado com fila (Railway/Fly) | Dois deploys, SPA não entrega prévia de link do comprovante sem camada extra. Só compensa com volume de fila que não temos. |
| C. Next.js + Supabase inteiro (Edge Functions, pg_cron, Auth) | Lógica repartida entre Next e Deno; experiência registrada na skill do MP mostra a dor de depurar isso. |
| **D. React Router v7 (framework) em Cloudflare Workers + Supabase Postgres** | **Escolhida.** React, SSR para comprovante compartilhável, Cloudflare é alvo nativo (sem OpenNext, sem estourar os 3 MB do Worker gratuito), webhook e cron no mesmo projeto, tudo free tier. |

### 5.3 Stack (decisões do Claude, dentro da escolha D)

- TypeScript estrito. React Router v7 em modo framework, SSR, deploy em Cloudflare Workers.
- Tailwind. Fontes IBM Plex Mono e Archivo Narrow (self-hosted, não Google Fonts em produção).
- Postgres no Supabase (plano gratuito; o cron diário impede a pausa por inatividade). Acesso por Drizzle
  ORM com driver `postgres` via **Cloudflare Hyperdrive** apontando para o pooler do Supabase (modo
  transação). Migrações com drizzle-kit, versionadas no repositório. Sem PostgREST, sem Edge Functions.
- Cloudflare Cron Triggers para repasse diário, conciliação e limpeza. R2 para imagens de comprovante.
  Turnstile para anti-robô. KV ou tabela para rate limit (builder decide).
- Resend para e-mail de confirmação de apelido (link mágico próprio, token com validade curta).
- Geração de imagem do comprovante no Worker (Satori + resvg-wasm, ou equivalente que rode em Workers;
  builder valida o tamanho do bundle).
- Testes: Vitest + Testing Library (unidade e componente), Playwright (ponta a ponta nos fluxos
  principais com provedores falsos). `.claude/verify.sh` roda lint, typecheck, testes unitários e build.
- Desenvolvimento local: `wrangler dev`; webhook do MP via Cloudflare Tunnel quando chegar a hora.
- Segredos em variáveis de ambiente do Worker; nomes literais no código para auditoria por grep.

## 6. Módulos e interfaces

Monolito modular. Domínio não importa nada de React Router nem de Cloudflare.

```
app/            rotas, loaders, actions, componentes (React Router)
src/domain/     chaves, doacoes, repasses, apelidos, ranking, razao   (regras puras + repositórios)
src/providers/  payment-in/   PaymentInProvider: criarCobranca(intencao) → {url, refExterna}
                              confirmar(refExterna) → estado reconciliado
                payout/       PayoutProvider: enviar(repasse) → {idProvedor, estado}
                              consultar(idProvedor) → estado
                              validarChave?(chave) → opcional, se o provedor permitir
                email/        enviarLinkMagico(email, url)
                captcha/      verificar(token)
src/infra/      drizzle (schema, migrações), crypto (AES-GCM, HMAC), r2, kv, config
workers/        entrypoint do Worker: fetch (app) + scheduled (cron) + rota do webhook
```

- Agora: `FakePaymentIn` (confirma via página de teste local), `FakePayout` (conclui após N segundos,
  com modo de falha configurável), `ConsoleEmail`, `AlwaysOkCaptcha` em dev.
- Depois: `MercadoPagoCheckoutPro` e `MercadoPagoPayouts`, seguindo a skill
  `mercadopago-marketplace-integration` (flag única de teste honrada em todas as partes, validação de
  `x-signature`, reconciliação por `GET /v1/payments/{id}`, comparar `transaction_amount`, roteamento de
  webhook por prefixo de `external_reference` que nunca lança exceção).

## 7. Decisões já tomadas (e por quem)

| # | Decisão | Quem |
|---|---|---|
| 1 | Só chave aleatória; nenhum outro tipo | Daniel |
| 2 | Mínimo R$ 5 | Daniel |
| 3 | Anonimato nos dois sentidos; plataforma como única contraparte | Daniel |
| 4 | Só Mercado Pago; Asaas descartado pelo custo | Daniel |
| 5 | Direção visual "Comprovante" | Daniel |
| 6 | React Router v7 + Cloudflare + Supabase | Daniel aprovou proposta do Claude |
| 7 | Estrutural primeiro; forma do pagamento/repasse decidida depois | Daniel |
| 8 | Repasse como configuração `imediato`/`diario`; padrão aguarda tarifa do MP | Claude, Daniel questionou e aceitou adiar |
| 9 | Taxa da plataforma percentual, mostrada antes de pagar; valor inicial 10% em configuração | Claude (não contestado) |
| 10 | Sem e-mail no cadastro da chave; perder o link é perder o acesso | Claude (não contestado) |
| 11 | Ranking acumula por apelido confirmado por e-mail depois do pagamento | Claude (não contestado) |
| 12 | A chave nunca aparece em tela pública | Claude (não contestado) |
| 13 | Chave cifrada em repouso; token do link secreto guardado como hash | Claude |
| 14 | Livro-razão append-only desde o primeiro dia | Claude |
| 15 | Só Pix e saldo MP no MVP; cartão depois, com carência de repasse | Daniel |
| 16 | Estados `expirada` e `estornada`; devolução após repasse é absorvida pela plataforma | Claude (após revisão do builder) |
| 17 | Chave inválida pode ser trocada pelo link secreto; sem troca em 30 dias, devolve aos doadores | Claude (após revisão do builder) |
| 18 | Dono do apelido prova por cookie assinado; sem cookie, novo link mágico; sem vínculo retroativo | Claude (após revisão do builder) |
| 19 | Tarifas do provedor sempre absorvidas pela plataforma; comprovante nunca muda depois de emitido | Claude (após revisão do builder) |
| 20 | Sem admin no MVP; configuração em tabela; moderação e conciliação por scripts | Claude (após revisão do builder) |

## 8. O que fica para o builder

- Esquema exato das tabelas (chaves, doações, créditos, repasses, lançamentos, apelidos, tokens,
  denúncias, configuração), índices e migrações.
- Estratégia de rate limit (KV vs tabela), valores iniciais dos limites.
- Como gerar o número público sequencial sem colisão sob concorrência.
- Biblioteca de geração de imagem compatível com Workers e seu impacto no bundle.
- Estrutura de componentes React, design tokens e tipografia dentro da direção "Comprovante", passando
  pelo processo da skill `design-taste-frontend`.
- Conteúdo da página "como funciona" e textos de erro, no tom da direção.
- Seeds de desenvolvimento com dados fictícios (chaves, doações, mensagens) para as telas não nascerem vazias.
- Pipeline: `verify.sh`, deploy via `wrangler`, ambientes `dev`/`prod` no Cloudflare e dois projetos no
  Supabase.

## 9. Pendências fora do código

- **Daniel:** abrir o pedido de ativação de Payouts junto à equipe de Integrações do MP, com o par de
  chaves Ed25519 que o Claude prepara, e perguntar: (a) a tarifa por envio; (b) se o envio para chave
  aleatória exige algum dado do titular além da chave (a documentação pública diz que não, só tipo e
  chave, mas o erro documentado "chave com outro titular" sugere que pode haver conferência opcional). A
  resposta (a) define o padrão do repasse (decisão 8); a resposta (b), se for "exige", reabre o cadastro.
- **Daniel:** conta MP pessoa jurídica antes de produção; conversa com contador sobre o fluxo de passagem.
- **Daniel:** nome definitivo e domínio.
- **Depois do estrutural:** implementar `MercadoPagoCheckoutPro` e `MercadoPagoPayouts`, sandbox completo
  conforme a skill (contas de teste Vendedor/Comprador/Marketplace, app de sandbox, webhook de teste).
