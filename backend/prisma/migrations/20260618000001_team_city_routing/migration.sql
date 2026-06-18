-- AlterTable: roteamento por cidade nos times da roleta
ALTER TABLE "roulette_teams" ADD COLUMN "keywords" TEXT;
ALTER TABLE "roulette_teams" ADD COLUMN "isGeneral" BOOLEAN NOT NULL DEFAULT false;
