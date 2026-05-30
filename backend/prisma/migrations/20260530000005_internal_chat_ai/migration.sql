-- Chat interno da equipe + flag de IA por usuário

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "internal_groups" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT NOT NULL DEFAULT '#6366f1',
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "internal_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_group_members" (
    "id"         TEXT NOT NULL,
    "groupId"    TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    CONSTRAINT "internal_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_group_members_groupId_userId_key"
    ON "internal_group_members"("groupId", "userId");

CREATE TABLE "internal_messages" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "internal_group_members"
    ADD CONSTRAINT "internal_group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "internal_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_group_members"
    ADD CONSTRAINT "internal_group_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "internal_messages"
    ADD CONSTRAINT "internal_messages_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "internal_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_messages"
    ADD CONSTRAINT "internal_messages_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
