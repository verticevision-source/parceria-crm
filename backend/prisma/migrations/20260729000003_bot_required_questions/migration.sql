-- Perguntas obrigatórias do atendente de IA (uma por linha). Separado do
-- botPrompt para o dono editar a rotina sem encostar nas regras de segurança.
ALTER TABLE "ai_config" ADD COLUMN IF NOT EXISTS "botRequiredQuestions" TEXT;
