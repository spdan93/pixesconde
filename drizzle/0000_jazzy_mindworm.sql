CREATE TYPE "public"."status_doacao" AS ENUM('pendente', 'confirmada', 'expirada', 'estornada');--> statement-breakpoint
CREATE TYPE "public"."status_recebedor" AS ENUM('aguardando_validacao', 'ativa', 'pausada', 'removida', 'invalida');--> statement-breakpoint
CREATE TYPE "public"."status_repasse" AS ENUM('agendado', 'enviando', 'concluido', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('entrada', 'taxa', 'saida', 'reversao_entrada', 'reversao_taxa');--> statement-breakpoint
CREATE TABLE "apelidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email_hash" text NOT NULL,
	"email_cifrado" text NOT NULL,
	"confirmado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apelidos_nome_unique" UNIQUE("nome"),
	CONSTRAINT "apelidos_email_hash_unique" UNIQUE("email_hash")
);
--> statement-breakpoint
CREATE TABLE "tokens_magicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apelido_id" uuid NOT NULL,
	"doacao_id" uuid,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_magicos_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "doacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_comprovante" integer GENERATED ALWAYS AS IDENTITY (sequence name "doacoes_numero_comprovante_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recebedor_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"taxa_bp" integer NOT NULL,
	"taxa_centavos" integer NOT NULL,
	"liquido_centavos" integer NOT NULL,
	"mensagem" text,
	"mensagem_oculta" boolean DEFAULT false NOT NULL,
	"apelido_texto" text,
	"apelido_id" uuid,
	"status" "status_doacao" DEFAULT 'pendente' NOT NULL,
	"ref_externa" text NOT NULL,
	"provedor_pagamento_id" text,
	"repasse_id" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"confirmada_em" timestamp with time zone,
	"estornada_em" timestamp with time zone,
	CONSTRAINT "doacoes_numero_comprovante_unique" UNIQUE("numero_comprovante"),
	CONSTRAINT "doacoes_ref_externa_unique" UNIQUE("ref_externa")
);
--> statement-breakpoint
CREATE TABLE "chaves_pix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recebedor_id" uuid NOT NULL,
	"chave_cifrada" text NOT NULL,
	"chave_hmac" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"desativada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recebedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_publico" integer GENERATED ALWAYS AS IDENTITY (sequence name "recebedores_numero_publico_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"token_hash" text NOT NULL,
	"status" "status_recebedor" DEFAULT 'aguardando_validacao' NOT NULL,
	"invalida_desde" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recebedores_numero_publico_unique" UNIQUE("numero_publico"),
	CONSTRAINT "recebedores_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "repasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recebedor_id" uuid NOT NULL,
	"chave_pix_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"status" "status_repasse" DEFAULT 'agendado' NOT NULL,
	"ref_externa" text NOT NULL,
	"provedor_id" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"agendado_para" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "repasses_ref_externa_unique" UNIQUE("ref_externa")
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"doacao_id" uuid,
	"repasse_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracao" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doacao_id" uuid NOT NULL,
	"motivo" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvida_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eventos_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"id_externo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	"resultado" text
);
--> statement-breakpoint
CREATE TABLE "limites" (
	"chave" text NOT NULL,
	"janela" timestamp with time zone NOT NULL,
	"contagem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "limites_chave_janela_pk" PRIMARY KEY("chave","janela")
);
--> statement-breakpoint
ALTER TABLE "tokens_magicos" ADD CONSTRAINT "tokens_magicos_apelido_id_apelidos_id_fk" FOREIGN KEY ("apelido_id") REFERENCES "public"."apelidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doacoes" ADD CONSTRAINT "doacoes_recebedor_id_recebedores_id_fk" FOREIGN KEY ("recebedor_id") REFERENCES "public"."recebedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doacoes" ADD CONSTRAINT "doacoes_apelido_id_apelidos_id_fk" FOREIGN KEY ("apelido_id") REFERENCES "public"."apelidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doacoes" ADD CONSTRAINT "doacoes_repasse_id_repasses_id_fk" FOREIGN KEY ("repasse_id") REFERENCES "public"."repasses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chaves_pix" ADD CONSTRAINT "chaves_pix_recebedor_id_recebedores_id_fk" FOREIGN KEY ("recebedor_id") REFERENCES "public"."recebedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_recebedor_id_recebedores_id_fk" FOREIGN KEY ("recebedor_id") REFERENCES "public"."recebedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_chave_pix_id_chaves_pix_id_fk" FOREIGN KEY ("chave_pix_id") REFERENCES "public"."chaves_pix"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_doacao_id_doacoes_id_fk" FOREIGN KEY ("doacao_id") REFERENCES "public"."doacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_repasse_id_repasses_id_fk" FOREIGN KEY ("repasse_id") REFERENCES "public"."repasses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_doacao_id_doacoes_id_fk" FOREIGN KEY ("doacao_id") REFERENCES "public"."doacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doacoes_recebedor_status_idx" ON "doacoes" USING btree ("recebedor_id","status");--> statement-breakpoint
CREATE INDEX "doacoes_status_expira_idx" ON "doacoes" USING btree ("status","expira_em");--> statement-breakpoint
CREATE INDEX "doacoes_apelido_idx" ON "doacoes" USING btree ("apelido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chaves_pix_hmac_ativa_unq" ON "chaves_pix" USING btree ("chave_hmac") WHERE "chaves_pix"."ativa" = true;--> statement-breakpoint
CREATE INDEX "chaves_pix_recebedor_idx" ON "chaves_pix" USING btree ("recebedor_id");--> statement-breakpoint
CREATE INDEX "repasses_status_agendado_idx" ON "repasses" USING btree ("status","agendado_para");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_webhook_provedor_id_unq" ON "eventos_webhook" USING btree ("provedor","id_externo");