-- Configuração de IA + modo automático por conversa

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aiAuto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ai_config" (
    "id"           TEXT NOT NULL DEFAULT 'singleton',
    "provider"     TEXT NOT NULL DEFAULT 'gemini',
    "apiKey"       TEXT,
    "model"        TEXT,
    "systemPrompt" TEXT,
    "enabled"      BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_config_pkey" PRIMARY KEY ("id")
);
