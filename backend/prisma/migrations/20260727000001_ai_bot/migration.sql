-- Atendente de IA: a IA vira "mais um vendedor" na roleta.
-- botUserId = qual usuário É a IA (null = nenhum/desligada). O número dela é
-- derivado da WhatsAppSession desse usuário.
ALTER TABLE "ai_config" ADD COLUMN IF NOT EXISTS "botEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_config" ADD COLUMN IF NOT EXISTS "botUserId"  TEXT;
ALTER TABLE "ai_config" ADD COLUMN IF NOT EXISTS "botPrompt"  TEXT;

-- Marca o que a IA escreveu: auditoria do que o robô falou + base dos tetos de custo.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
