-- Papel "gerente de carteira". ADD VALUE é aditivo e não tem rollback simples
-- no Postgres; por isso o valor NÃO é usado nesta mesma migration (o Postgres
-- só libera o uso depois do commit).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GERENTE';

-- Ponteiro para a carteira no Parceria Financeiro. Sem saldo, sem parcela:
-- só o vínculo de quem gerencia o quê.
CREATE TABLE IF NOT EXISTS "wallet_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "walletName" TEXT NOT NULL,
    "whatsappSessionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_links_userId_walletId_key" ON "wallet_links"("userId", "walletId");
CREATE INDEX IF NOT EXISTS "wallet_links_walletId_idx" ON "wallet_links"("walletId");

ALTER TABLE "wallet_links" DROP CONSTRAINT IF EXISTS "wallet_links_userId_fkey";
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
