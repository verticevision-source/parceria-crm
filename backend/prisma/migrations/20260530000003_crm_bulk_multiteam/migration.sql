-- CRM Dinâmico, Envio em Massa e Multi-time

-- ── Remove coluna teamId antiga do roulette_agents ─────────────────────────
ALTER TABLE "roulette_agents" DROP COLUMN IF EXISTS "teamId";

-- ── Many-to-many: agente em vários times ──────────────────────────────────
CREATE TABLE "roulette_agent_teams" (
    "id"      TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "teamId"  TEXT NOT NULL,
    CONSTRAINT "roulette_agent_teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roulette_agent_teams_agentId_teamId_key"
    ON "roulette_agent_teams"("agentId", "teamId");

ALTER TABLE "roulette_agent_teams"
    ADD CONSTRAINT "roulette_agent_teams_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "roulette_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roulette_agent_teams"
    ADD CONSTRAINT "roulette_agent_teams_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "roulette_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CRM Boards ─────────────────────────────────────────────────────────────
CREATE TABLE "crm_boards" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT NOT NULL DEFAULT '#6366f1',
    "icon"        TEXT NOT NULL DEFAULT 'briefcase',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_boards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_board_members" (
    "id"      TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId"  TEXT NOT NULL,
    "role"    TEXT NOT NULL DEFAULT 'member',
    CONSTRAINT "crm_board_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_board_members_boardId_userId_key"
    ON "crm_board_members"("boardId", "userId");

ALTER TABLE "crm_board_members"
    ADD CONSTRAINT "crm_board_members_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "crm_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm_board_members"
    ADD CONSTRAINT "crm_board_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Atualiza PipelineStage e Lead para suportar boards ─────────────────────
ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "boardId" TEXT;

ALTER TABLE "pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "crm_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "boardId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tags" TEXT;

ALTER TABLE "leads"
    ADD CONSTRAINT "leads_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "crm_boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Envio em Massa ─────────────────────────────────────────────────────────
CREATE TYPE "BulkMessageStatus" AS ENUM ('DRAFT', 'RUNNING', 'DONE', 'FAILED');

CREATE TABLE "bulk_messages" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status"      "BulkMessageStatus" NOT NULL DEFAULT 'DRAFT',
    "filterType"  TEXT NOT NULL,
    "filterValue" TEXT,
    "filterDays"  INTEGER,
    "totalCount"  INTEGER NOT NULL DEFAULT 0,
    "sentCount"   INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt"   TIMESTAMP(3),
    "finishedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bulk_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bulk_messages"
    ADD CONSTRAINT "bulk_messages_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bulk_message_recipients" (
    "id"            TEXT NOT NULL,
    "bulkMessageId" TEXT NOT NULL,
    "contactId"     TEXT NOT NULL,
    "phone"         TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "sentAt"        TIMESTAMP(3),
    "repliedAt"     TIMESTAMP(3),
    "errorMessage"  TEXT,
    CONSTRAINT "bulk_message_recipients_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bulk_message_recipients"
    ADD CONSTRAINT "bulk_message_recipients_bulkMessageId_fkey"
    FOREIGN KEY ("bulkMessageId") REFERENCES "bulk_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bulk_message_recipients"
    ADD CONSTRAINT "bulk_message_recipients_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
