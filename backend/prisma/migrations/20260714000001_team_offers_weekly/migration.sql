-- Grupo de trabalho que só faz plano diário (ex: Brasília) tem offersWeekly=false;
-- o robô esconde a opção "por semana" quando a cidade cai só nesses grupos.
ALTER TABLE "roulette_teams" ADD COLUMN "offersWeekly" BOOLEAN NOT NULL DEFAULT true;
