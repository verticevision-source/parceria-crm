-- Política "nenhuma conversa some do banco": troca ON DELETE CASCADE por
-- RESTRICT nas FKs de User → sessões/contatos/conversas. Assim o banco recusa
-- apagar um usuário que ainda tenha histórico (a app faz soft-delete do usuário).

-- whatsapp_sessions.userId
ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "whatsapp_sessions_userId_fkey";
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- contacts.userId
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_userId_fkey";
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- conversations.userId
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_userId_fkey";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
