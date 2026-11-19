ALTER TABLE "tokens_magicos" ALTER COLUMN "apelido_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens_magicos" ADD COLUMN "nome" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens_magicos" ADD COLUMN "email_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens_magicos" ADD COLUMN "email_cifrado" text NOT NULL;