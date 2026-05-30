-- Times regionais da roleta

CREATE TABLE "roulette_teams" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT NOT NULL DEFAULT '#6366f1',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roulette_teams_pkey" PRIMARY KEY ("id")
);

-- Adiciona teamId em roulette_agents
ALTER TABLE "roulette_agents" ADD COLUMN "teamId" TEXT;

ALTER TABLE "roulette_agents"
    ADD CONSTRAINT "roulette_agents_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "roulette_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adiciona teamId em campaigns
ALTER TABLE "campaigns" ADD COLUMN "teamId" TEXT;

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "roulette_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
