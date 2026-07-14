-- Guarda as respostas capturadas pelo robô (cidade, modalidade, etc.) para
-- usar em etapas posteriores do fluxo (roteamento por cidade + dia/semana).
ALTER TABLE "chat_flow_sessions" ADD COLUMN "vars" JSONB;
