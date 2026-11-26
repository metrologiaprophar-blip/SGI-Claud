-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CalibrationKind" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "CalibrationResult" AS ENUM ('CONFORM', 'ADJUSTED', 'NON_CONFORM');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('RECORDED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('CONFORM', 'NON_CONFORM');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "QualificationPhase" AS ENUM ('DQ', 'IQ', 'OQ', 'PQ');

-- CreateEnum
CREATE TYPE "QualificationResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "ProficiencyOutcome" AS ENUM ('SATISFACTORY', 'QUESTIONABLE', 'UNSATISFACTORY');

-- AlterEnum
ALTER TYPE "CapaSource" ADD VALUE 'PROFICIENCY';

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "processId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "criticality" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "isReferenceStandard" BOOLEAN NOT NULL DEFAULT false,
    "measurementRange" TEXT,
    "resolution" TEXT,
    "unit" TEXT,
    "maxPermissibleError" DOUBLE PRECISION,
    "calibrationIntervalMonths" INTEGER,
    "verificationIntervalDays" INTEGER,
    "maintenanceIntervalMonths" INTEGER,
    "lastCalibrationAt" TIMESTAMP(3),
    "nextCalibrationDue" TIMESTAMP(3),
    "lastVerificationAt" TIMESTAMP(3),
    "nextVerificationDue" TIMESTAMP(3),
    "lastMaintenanceAt" TIMESTAMP(3),
    "nextMaintenanceDue" TIMESTAMP(3),
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calibration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "kind" "CalibrationKind" NOT NULL,
    "provider" TEXT,
    "accreditation" TEXT,
    "certificateNumber" TEXT,
    "calibratedAt" TIMESTAMP(3) NOT NULL,
    "points" JSONB NOT NULL,
    "unit" TEXT,
    "referenceStandardIds" JSONB,
    "result" "CalibrationResult" NOT NULL,
    "computedResult" "CalibrationResult",
    "comments" TEXT,
    "impactAssessment" TEXT,
    "deviationId" TEXT,
    "fileName" TEXT,
    "fileMime" TEXT,
    "fileSize" INTEGER,
    "fileSha256" TEXT,
    "storageKey" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Calibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "readings" TEXT NOT NULL,
    "result" "VerificationResult" NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "performedBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiresRecalibration" BOOLEAN NOT NULL DEFAULT false,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "phase" "QualificationPhase" NOT NULL,
    "protocolRef" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "result" "QualificationResult" NOT NULL,
    "summary" TEXT NOT NULL,
    "fileName" TEXT,
    "fileMime" TEXT,
    "fileSize" INTEGER,
    "fileSha256" TEXT,
    "storageKey" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyTest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "measurand" TEXT NOT NULL,
    "equipmentId" TEXT,
    "reportedValue" DOUBLE PRECISION,
    "assignedValue" DOUBLE PRECISION,
    "sigma" DOUBLE PRECISION,
    "zScore" DOUBLE PRECISION NOT NULL,
    "outcome" "ProficiencyOutcome" NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "comments" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProficiencyTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_organizationId_status_idx" ON "Equipment"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_organizationId_code_key" ON "Equipment"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Calibration_organizationId_equipmentId_idx" ON "Calibration"("organizationId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Calibration_organizationId_code_key" ON "Calibration"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Verification_organizationId_equipmentId_idx" ON "Verification"("organizationId", "equipmentId");

-- CreateIndex
CREATE INDEX "Maintenance_organizationId_equipmentId_idx" ON "Maintenance"("organizationId", "equipmentId");

-- CreateIndex
CREATE INDEX "Qualification_organizationId_equipmentId_idx" ON "Qualification"("organizationId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_organizationId_code_key" ON "Qualification"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ProficiencyTest_organizationId_reportDate_idx" ON "ProficiencyTest"("organizationId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyTest_organizationId_code_key" ON "ProficiencyTest"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calibration" ADD CONSTRAINT "Calibration_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyTest" ADD CONSTRAINT "ProficiencyTest_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

