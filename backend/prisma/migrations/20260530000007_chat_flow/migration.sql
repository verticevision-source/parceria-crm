-- Construtor de fluxo (chatbot)

CREATE TABLE "chat_flows" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT false,
    "nodes"     JSONB NOT NULL DEFAULT '[]',
    "edges"     JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_flows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_flow_sessions" (
    "id"             TEXT NOT NULL,
    "flowId"         TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId"      TEXT NOT NULL,
    "currentNodeId"  TEXT,
    "status"         TEXT NOT NULL DEFAULT 'running',
    "lastReply"      TEXT,
    "waitingSince"   TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_flow_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_flow_sessions_conversationId_key" ON "chat_flow_sessions"("conversationId");
