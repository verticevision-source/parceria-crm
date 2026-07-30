-- Atendente de IA com prioridade: recebe todos os leads, exceto os grupos
-- listados em botExcludedTeamIds (ex.: Brasília, que é da Aline).
ALTER TABLE "ai_config" ADD COLUMN IF NOT EXISTS "botPriority" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_config" ADD COLUMN IF NOT EXISTS "botExcludedTeamIds" TEXT;
