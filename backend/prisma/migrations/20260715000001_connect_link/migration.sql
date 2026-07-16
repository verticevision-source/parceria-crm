-- Link público de conexão: o vendedor abre /conectar/<token>, vê o QR e conecta
-- o WhatsApp dele sem precisar logar no CRM. Token aleatório com validade.
ALTER TABLE "whatsapp_sessions" ADD COLUMN "connectToken" TEXT;
ALTER TABLE "whatsapp_sessions" ADD COLUMN "connectTokenExp" TIMESTAMP(3);
CREATE UNIQUE INDEX "whatsapp_sessions_connectToken_key" ON "whatsapp_sessions"("connectToken");
