-- Amarra o robô a um número específico (o da campanha), em vez de "qualquer
-- número do Administrador". Null mantém o comportamento antigo.
ALTER TABLE "chat_flows" ADD COLUMN "whatsappSessionId" TEXT;
