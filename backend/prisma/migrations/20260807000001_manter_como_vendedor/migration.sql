-- Trava contra o sync com o financeiro promover a GERENTE quem tambem vende.
-- Gerente nao entra na roleta; sem isto, cada "Sincronizar equipe" tirava a
-- pessoa da roleta de novo.
ALTER TABLE "users" ADD COLUMN "manterComoVendedor" BOOLEAN NOT NULL DEFAULT false;
