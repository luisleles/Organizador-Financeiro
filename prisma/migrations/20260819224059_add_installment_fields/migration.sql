-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "installmentGroupId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "installmentNumber" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "installmentTotal" INTEGER;
