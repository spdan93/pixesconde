ALTER TYPE "public"."status_doacao" ADD VALUE 'estornando';--> statement-breakpoint
ALTER TABLE "doacoes" ADD COLUMN "segredo_doador_hash" text;--> statement-breakpoint
ALTER TABLE "repasses" ADD COLUMN "reclamado_em" timestamp with time zone;