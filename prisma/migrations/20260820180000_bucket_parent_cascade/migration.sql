-- Caixinha não existe sem a mãe: apagar a conta mãe apaga as caixinhas dela.
-- Com RESTRICT, apagar o usuário (cascata) esbarrava na própria chave estrangeira.
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
    CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("archived", "class", "color", "createdAt", "icon", "id", "initialBalanceCents", "institution", "name", "parentAccountId", "type", "userId") SELECT "archived", "class", "color", "createdAt", "icon", "id", "initialBalanceCents", "institution", "name", "parentAccountId", "type", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Account_parentAccountId_idx" ON "Account"("parentAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
