-- Chave PIX por carteira. Fixar a chave dentro do robô faria a carteira B
-- mandar a chave da carteira A — cliente pagando na conta errada.
ALTER TABLE "wallet_links" ADD COLUMN IF NOT EXISTS "pixKey" TEXT;

-- Timeout por robô. NULL preserva o comportamento global de hoje, então o robô
-- de qualificação (que sustenta as vendas) não muda por causa desta coluna.
ALTER TABLE "chat_flows" ADD COLUMN IF NOT EXISTS "timeoutMinutes" INTEGER;
ALTER TABLE "chat_flows" ADD COLUMN IF NOT EXISTS "timeoutAction" TEXT;
