-- DropIndex
DROP INDEX "RecurringRule_userId_idx";

-- CreateTable
CREATE TABLE "RecurringOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "amountCents" INTEGER,
    CONSTRAINT "RecurringOverride_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOverride_ruleId_date_key" ON "RecurringOverride"("ruleId", "date");

-- CreateIndex
CREATE INDEX "RecurringRule_userId_active_idx" ON "RecurringRule"("userId", "active");
