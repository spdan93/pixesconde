-- RLS ativo e sem políticas em todas as tabelas: a Data API do Supabase (roles anon /
-- authenticated) não enxerga nada. A aplicação conecta direto, como dona das tabelas,
-- e dona de tabela não é afetada por RLS (não usamos FORCE). Tabela nova = repetir aqui.
ALTER TABLE "recebedores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chaves_pix" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "repasses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lancamentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "apelidos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tokens_magicos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "configuracao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "eventos_webhook" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "denuncias" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "limites" ENABLE ROW LEVEL SECURITY;
