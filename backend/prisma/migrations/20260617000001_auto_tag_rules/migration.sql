-- CreateTable
CREATE TABLE "auto_tag_rules" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_tag_rules_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "auto_tag_rules" ADD CONSTRAINT "auto_tag_rules_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
