-- Fotos de perfil (avatar) para usuários e contatos
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
