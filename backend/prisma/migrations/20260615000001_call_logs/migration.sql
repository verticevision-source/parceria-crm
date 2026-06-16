-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUT',
    "outcome" TEXT NOT NULL DEFAULT 'completed',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_logs_contactId_idx" ON "call_logs"("contactId");

-- CreateIndex
CREATE INDEX "call_logs_userId_idx" ON "call_logs"("userId");

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

