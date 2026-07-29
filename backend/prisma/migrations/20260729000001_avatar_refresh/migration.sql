-- Última TENTATIVA de buscar a foto de perfil do contato (mesmo sem retorno).
-- Permite refresh periódico (7 dias) sem re-tentar a cada mensagem.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "avatarUpdatedAt" TIMESTAMP(3);
