-- Antes de apagar GoalContribution, guarda o que o script de dados vai precisar.
-- A migração de schema não decide nada sobre saldo: ela só preserva a informação para
-- que `scripts/migrate-goals-to-buckets.ts` possa perguntar caso a caso.
CREATE TABLE IF NOT EXISTS "_GoalBucketMigration" (
    "goalId" TEXT NOT NULL PRIMARY KEY,
    "goalName" TEXT NOT NULL,
    "previousAccountId" TEXT,
    "contributionCount" INTEGER NOT NULL,
    "totalContributedCents" INTEGER NOT NULL,
    "resolution" TEXT,
    "resolvedAt" DATETIME
);

INSERT OR IGNORE INTO "_GoalBucketMigration" (
    "goalId", "goalName", "previousAccountId", "contributionCount", "totalContributedCents"
)
SELECT
    g."id",
    g."name",
    g."accountId",
    COUNT(c."id"),
    COALESCE(SUM(c."amountCents"), 0)
FROM "Goal" g
LEFT JOIN "GoalContribution" c ON c."goalId" = g."id"
GROUP BY g."id";

-- DropIndex
DROP INDEX "GoalContribution_goalId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "GoalContribution";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "type" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "initialBalanceCents" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentAccountId" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("archived", "class", "color", "createdAt", "icon", "id", "initialBalanceCents", "institution", "name", "type", "userId") SELECT "archived", "class", "color", "createdAt", "icon", "id", "initialBalanceCents", "institution", "name", "type", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Account_parentAccountId_idx" ON "Account"("parentAccountId");
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "parentId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("archived", "color", "icon", "id", "kind", "name", "parentId", "sortOrder", "userId") SELECT "archived", "color", "icon", "id", "kind", "name", "parentId", "sortOrder", "userId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_userId_idx" ON "Category"("userId");
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bucketAccountId" TEXT,
    "expectedYearlyRatePercent" DECIMAL,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_bucketAccountId_fkey" FOREIGN KEY ("bucketAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("archived", "color", "createdAt", "icon", "id", "name", "targetCents", "targetDate", "userId") SELECT "archived", "color", "createdAt", "icon", "id", "name", "targetCents", "targetDate", "userId" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE UNIQUE INDEX "Goal_bucketAccountId_key" ON "Goal"("bucketAccountId");
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
