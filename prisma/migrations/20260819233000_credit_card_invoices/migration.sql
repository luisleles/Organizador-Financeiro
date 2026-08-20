PRAGMA foreign_keys=OFF;

CREATE TEMP TABLE "_LegacyCreditCardDetails" AS
SELECT
    "id" AS "accountId",
    COALESCE("closingDay", 1) AS "closingDay",
    COALESCE("dueDay", 1) AS "dueDay",
    COALESCE("creditLimitCents", 0) AS "creditLimitCents"
FROM "Account"
WHERE "type" = 'CREDIT_CARD';

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
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Account" (
    "id", "userId", "name", "institution", "type", "class",
    "initialBalanceCents", "color", "icon", "archived", "createdAt"
)
SELECT
    "id", "userId", "name", "institution", "type",
    CASE WHEN "type" = 'CREDIT_CARD' THEN 'LIABILITY' ELSE 'ASSET' END,
    "initialBalanceCents", "color", "icon", "archived", "createdAt"
FROM "Account";

DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE TABLE "CreditCardDetails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "closingDay" INTEGER NOT NULL CHECK ("closingDay" BETWEEN 1 AND 31),
    "dueDay" INTEGER NOT NULL CHECK ("dueDay" BETWEEN 1 AND 31),
    "creditLimitCents" INTEGER NOT NULL CHECK ("creditLimitCents" >= 0),
    "lastFourDigits" TEXT,
    "brand" TEXT,
    CONSTRAINT "CreditCardDetails_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreditCardDetails_accountId_key" ON "CreditCardDetails"("accountId");

INSERT INTO "CreditCardDetails" (
    "id", "accountId", "closingDay", "dueDay", "creditLimitCents"
)
SELECT
    lower(hex(randomblob(16))), "accountId", "closingDay", "dueDay", "creditLimitCents"
FROM "_LegacyCreditCardDetails";

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditCardDetailsId" TEXT NOT NULL,
    "referenceMonth" DATETIME NOT NULL,
    "closingDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paidAt" DATETIME,
    "paymentTransferGroupId" TEXT,
    CONSTRAINT "Invoice_creditCardDetailsId_fkey" FOREIGN KEY ("creditCardDetailsId") REFERENCES "CreditCardDetails" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Invoice_creditCardDetailsId_referenceMonth_key" ON "Invoice"("creditCardDetailsId", "referenceMonth");
CREATE INDEX "Invoice_creditCardDetailsId_closingDate_idx" ON "Invoice"("creditCardDetailsId", "closingDate");

CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "transferGroupId" TEXT,
    "invoiceId" TEXT,
    "installmentGroupId" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "notes" TEXT,
    "provider" TEXT,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Transaction" (
    "id", "userId", "accountId", "categoryId", "date", "description",
    "amountCents", "type", "transferGroupId", "installmentGroupId",
    "installmentNumber", "installmentTotal", "notes", "provider", "externalId",
    "createdAt", "updatedAt"
)
SELECT
    "id", "userId", "accountId", "categoryId", "date", "description",
    "amountCents", "type", "transferGroupId", "installmentGroupId",
    "installmentNumber", "installmentTotal", "notes", "provider", "externalId",
    "createdAt", "updatedAt"
FROM "Transaction";

DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");
CREATE INDEX "Transaction_invoiceId_idx" ON "Transaction"("invoiceId");
CREATE INDEX "Transaction_installmentGroupId_installmentNumber_idx" ON "Transaction"("installmentGroupId", "installmentNumber");
CREATE UNIQUE INDEX "Transaction_provider_externalId_key" ON "Transaction"("provider", "externalId");

CREATE TEMP TABLE "_InvoiceAllocation" (
    "transactionId" TEXT NOT NULL PRIMARY KEY,
    "creditCardDetailsId" TEXT NOT NULL,
    "referenceMonth" INTEGER NOT NULL
);

WITH "local_transactions" AS (
    SELECT
        t."id" AS "transactionId",
        d."id" AS "creditCardDetailsId",
        d."closingDay",
        date(datetime(t."date" / 1000, 'unixepoch', '-3 hours')) AS "localDate",
        date(datetime(t."date" / 1000, 'unixepoch', '-3 hours'), 'start of month') AS "localMonth"
    FROM "Transaction" t
    JOIN "CreditCardDetails" d ON d."accountId" = t."accountId"
),
"allocated" AS (
    SELECT
        "transactionId",
        "creditCardDetailsId",
        CASE
            WHEN CAST(strftime('%d', "localDate") AS INTEGER) <= MIN(
                "closingDay",
                CAST(strftime('%d', date("localMonth", '+1 month', '-1 day')) AS INTEGER)
            ) THEN "localMonth"
            ELSE date("localMonth", '+1 month')
        END AS "referenceLocalMonth"
    FROM "local_transactions"
)
INSERT INTO "_InvoiceAllocation" ("transactionId", "creditCardDetailsId", "referenceMonth")
SELECT
    "transactionId",
    "creditCardDetailsId",
    CAST(strftime('%s', "referenceLocalMonth" || ' 03:00:00') AS INTEGER) * 1000
FROM "allocated";

WITH "invoice_months" AS (
    SELECT DISTINCT
        a."creditCardDetailsId",
        a."referenceMonth",
        date(a."referenceMonth" / 1000, 'unixepoch', '-3 hours') AS "referenceLocalMonth",
        d."closingDay",
        d."dueDay"
    FROM "_InvoiceAllocation" a
    JOIN "CreditCardDetails" d ON d."id" = a."creditCardDetailsId"
),
"invoice_dates" AS (
    SELECT
        *,
        date(
            "referenceLocalMonth",
            printf(
                '+%d days',
                MIN(
                    "closingDay",
                    CAST(strftime('%d', date("referenceLocalMonth", '+1 month', '-1 day')) AS INTEGER)
                ) - 1
            )
        ) AS "closingLocalDate",
        CASE
            WHEN "dueDay" > "closingDay" THEN "referenceLocalMonth"
            ELSE date("referenceLocalMonth", '+1 month')
        END AS "dueLocalMonth"
    FROM "invoice_months"
)
INSERT INTO "Invoice" (
    "id", "creditCardDetailsId", "referenceMonth", "closingDate", "dueDate", "status"
)
SELECT
    lower(hex(randomblob(16))),
    "creditCardDetailsId",
    "referenceMonth",
    CAST(strftime('%s', "closingLocalDate" || ' 03:00:00') AS INTEGER) * 1000,
    CAST(
        strftime(
            '%s',
            date(
                "dueLocalMonth",
                printf(
                    '+%d days',
                    MIN(
                        "dueDay",
                        CAST(strftime('%d', date("dueLocalMonth", '+1 month', '-1 day')) AS INTEGER)
                    ) - 1
                )
            ) || ' 03:00:00'
        ) AS INTEGER
    ) * 1000,
    'OPEN'
FROM "invoice_dates";

UPDATE "Transaction"
SET "invoiceId" = (
    SELECT i."id"
    FROM "_InvoiceAllocation" a
    JOIN "Invoice" i
      ON i."creditCardDetailsId" = a."creditCardDetailsId"
     AND i."referenceMonth" = a."referenceMonth"
    WHERE a."transactionId" = "Transaction"."id"
)
WHERE "id" IN (SELECT "transactionId" FROM "_InvoiceAllocation");

DROP TABLE "_InvoiceAllocation";
DROP TABLE "_LegacyCreditCardDetails";

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
