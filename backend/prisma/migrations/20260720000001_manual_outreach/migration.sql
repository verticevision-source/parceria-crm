-- Vendedor de "chip frágil": robô só avisa ele (sem mandar a 1ª msg fria pela
-- API, que não entrega nesses chips) — ele chama o cliente pelo celular.
ALTER TABLE "roulette_agents" ADD COLUMN "manualOutreach" BOOLEAN NOT NULL DEFAULT false;
