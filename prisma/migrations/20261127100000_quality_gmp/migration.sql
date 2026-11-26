-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DeviationStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'PENDING_QA', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviationCategory" AS ENUM ('PROCESS', 'EQUIPMENT', 'MATERIAL', 'DOCUMENTATION', 'ENVIRONMENT', 'PERSONNEL', 'STORAGE_TRANSPORT', 'LABORATORY', 'COMPUTERIZED_SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "RootCauseMethod" AS ENUM ('FIVE_WHYS', 'ISHIKAWA', 'FAULT_TREE', 'OTHER');

-- CreateEnum
CREATE TYPE "CapaStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'EFFECTIVENESS_CHECK', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CapaSource" AS ENUM ('DEVIATION', 'AUDIT', 'COMPLAINT', 'CHANGE_CONTROL', 'MANAGEMENT_REVIEW', 'RISK', 'OOS', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "CapaType" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'BOTH');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('DRAFT', 'IN_ASSESSMENT', 'APPROVED', 'IMPLEMENTED', 'CLOSED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('PROCESS', 'EQUIPMENT', 'FACILITY', 'DOCUMENT', 'SUPPLIER', 'MATERIAL', 'COMPUTERIZED_SYSTEM', 'ANALYTICAL_METHOD', 'PRODUCT', 'STORAGE_DISTRIBUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "SignatureMeaning" ADD VALUE 'VERIFIED';

-- CreateTable
CREATE TABLE "Deviation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "DeviationCategory" NOT NULL,
    "processId" TEXT NOT NULL,
    "location" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "reportedById" TEXT NOT NULL,
    "batches" TEXT,
    "immediateAction" TEXT NOT NULL,
    "status" "DeviationStatus" NOT NULL DEFAULT 'REPORTED',
    "classification" "Classification",
    "investigatorId" TEXT,
    "dueDate" TIMESTAMP(3),
    "capaRequired" BOOLEAN NOT NULL DEFAULT false,
    "triageComment" TEXT,
    "rootCauseMethod" "RootCauseMethod",
    "rootCause" TEXT,
    "impactAssessment" TEXT,
    "productDisposition" TEXT,
    "conclusion" TEXT,
    "returnComment" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deviation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capa" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" "CapaSource" NOT NULL,
    "deviationId" TEXT,
    "sourceReference" TEXT,
    "problemStatement" TEXT NOT NULL,
    "rootCause" TEXT,
    "type" "CapaType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "CapaStatus" NOT NULL DEFAULT 'OPEN',
    "effectivenessCriteria" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "effectivenessDueDate" TIMESTAMP(3),
    "effectivenessResult" TEXT,
    "returnComment" TEXT,
    "verifiedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeControl" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "processId" TEXT NOT NULL,
    "affectedItems" TEXT,
    "plannedDate" TIMESTAMP(3),
    "requesterId" TEXT NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "classification" "Classification",
    "riskLevel" "RiskLevel",
    "regulatoryNotification" BOOLEAN,
    "impactQuality" TEXT,
    "impactValidation" TEXT,
    "impactDocuments" TEXT,
    "impactTraining" TEXT,
    "assessmentComment" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "implementedAt" TIMESTAMP(3),
    "closureComment" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "capaId" TEXT,
    "changeControlId" TEXT,
    "description" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deviation_organizationId_status_idx" ON "Deviation"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Deviation_organizationId_code_key" ON "Deviation"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Capa_organizationId_status_idx" ON "Capa"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Capa_organizationId_code_key" ON "Capa"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ChangeControl_organizationId_status_idx" ON "ChangeControl"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeControl_organizationId_code_key" ON "ChangeControl"("organizationId", "code");

-- CreateIndex
CREATE INDEX "QualityAction_organizationId_responsibleId_status_idx" ON "QualityAction"("organizationId", "responsibleId", "status");

-- AddForeignKey
ALTER TABLE "Deviation" ADD CONSTRAINT "Deviation_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deviation" ADD CONSTRAINT "Deviation_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deviation" ADD CONSTRAINT "Deviation_investigatorId_fkey" FOREIGN KEY ("investigatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeControl" ADD CONSTRAINT "ChangeControl_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeControl" ADD CONSTRAINT "ChangeControl_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAction" ADD CONSTRAINT "QualityAction_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "Capa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAction" ADD CONSTRAINT "QualityAction_changeControlId_fkey" FOREIGN KEY ("changeControlId") REFERENCES "ChangeControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAction" ADD CONSTRAINT "QualityAction_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

