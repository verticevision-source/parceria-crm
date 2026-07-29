-- Sinal vermelho do semáforo: a IA disse que não sabe e passou pra equipe,
-- ou bateu no teto de respostas da conversa. Sem isso o "se perdeu" só
-- aparecia se alguém lesse a conversa inteira.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aiNeedsHuman" BOOLEAN NOT NULL DEFAULT false;
