-- Por que a sessão do robô parou ('timeout' | 'finished' | 'handoff').
-- Sem isso, qualquer sessão 'done' (mesmo por ter terminado o menu ou
-- encaminhado pra humano) reabria o robô do zero na próxima mensagem.
ALTER TABLE "chat_flow_sessions" ADD COLUMN "doneReason" TEXT;
