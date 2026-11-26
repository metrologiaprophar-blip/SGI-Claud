-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('MANUAL', 'POLICY', 'SOP', 'INSTRUCTION', 'SPECIFICATION', 'FORM', 'PLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'OBSOLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureMeaning" AS ENUM ('AUTHORED', 'REVIEWED', 'APPROVED', 'REJECTED', 'READ', 'OBSOLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissions" JSONB;

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "processId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "standards" JSONB NOT NULL,
    "reviewPeriodMonths" INTEGER NOT NULL DEFAULT 24,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "obsoletedAt" TIMESTAMP(3),
    "obsoleteReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "changeSummary" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "approverId" TEXT,
    "readerIds" JSONB,
    "effectiveDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "fileName" TEXT,
    "fileMime" TEXT,
    "fileSize" INTEGER,
    "fileSha256" TEXT,
    "storageKey" TEXT,
    "lastRejection" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectronicSignature" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userFullName" TEXT NOT NULL,
    "userJobTitle" TEXT,
    "meaning" "SignatureMeaning" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contentHash" TEXT,
    "signatureHash" TEXT NOT NULL,
    "comment" TEXT,
    "ip" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadAcknowledgement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "signatureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Process_organizationId_idx" ON "Process"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Process_organizationId_code_key" ON "Process"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Document_organizationId_type_idx" ON "Document"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_code_key" ON "Document"("organizationId", "code");

-- CreateIndex
CREATE INDEX "DocumentVersion_organizationId_status_idx" ON "DocumentVersion"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DocumentVersion_reviewerId_status_idx" ON "DocumentVersion"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "DocumentVersion_approverId_status_idx" ON "DocumentVersion"("approverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "ElectronicSignature_organizationId_userId_idx" ON "ElectronicSignature"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ElectronicSignature_entityType_entityId_idx" ON "ElectronicSignature"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ReadAcknowledgement_organizationId_userId_idx" ON "ReadAcknowledgement"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadAcknowledgement_versionId_userId_key" ON "ReadAcknowledgement"("versionId", "userId");

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadAcknowledgement" ADD CONSTRAINT "ReadAcknowledgement_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridad de datos GMP: las firmas electrónicas son de solo inserción.
CREATE OR REPLACE FUNCTION electronic_signature_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ElectronicSignature es de solo inserción: % no permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectronicSignature_no_update_delete"
  BEFORE UPDATE OR DELETE ON "ElectronicSignature"
  FOR EACH ROW EXECUTE FUNCTION electronic_signature_immutable();
