-- Pausa explícita do humano numa conversa da IA ("eu respondo agora").
-- Separado de aiAuto: no número da própria IA ela responde por padrão, então
-- aiAuto=false não distingue "nunca ligada" de "desligada de propósito".
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aiPaused" BOOLEAN NOT NULL DEFAULT false;
