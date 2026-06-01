-- Multi-número de WhatsApp (Cloud API)

CREATE TABLE "whatsapp_numbers" (
    "id"            TEXT NOT NULL,
    "label"         TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "token"         TEXT NOT NULL,
    "wabaId"        TEXT,
    "displayNumber" TEXT,
    "verifiedName"  TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "isDefault"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_numbers_phoneNumberId_key" ON "whatsapp_numbers"("phoneNumberId");
