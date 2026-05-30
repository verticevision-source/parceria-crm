-- Sistema de Roleta de Leads

-- Configuração da roleta por agente
CREATE TABLE "roulette_agents" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "isActive"   BOOLEAN NOT NULL DEFAULT false,
    "weight"     INTEGER NOT NULL DEFAULT 1,
    "leadsToday" INTEGER NOT NULL DEFAULT 0,
    "leadsTotal" INTEGER NOT NULL DEFAULT 0,
    "lastLeadAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roulette_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roulette_agents_userId_key" ON "roulette_agents"("userId");

ALTER TABLE "roulette_agents"
    ADD CONSTRAINT "roulette_agents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Campanhas
CREATE TABLE "campaigns" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "source"      TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "leadsCount"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- Adiciona campaignId em leads
ALTER TABLE "leads" ADD COLUMN "campaignId" TEXT;

ALTER TABLE "leads"
    ADD CONSTRAINT "leads_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Log de distribuições da roleta
CREATE TABLE "roulette_logs" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "leadId"     TEXT,
    "campaignId" TEXT,
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roulette_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "roulette_logs"
    ADD CONSTRAINT "roulette_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roulette_logs"
    ADD CONSTRAINT "roulette_logs_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "roulette_logs"
    ADD CONSTRAINT "roulette_logs_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
