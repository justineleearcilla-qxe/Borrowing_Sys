-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "Loan_batchId_idx" ON "Loan"("batchId");
