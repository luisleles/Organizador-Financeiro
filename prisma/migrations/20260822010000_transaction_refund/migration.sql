-- `REFUND` é um novo valor de `TransactionType`. O provider sqlite do Prisma não gera
-- CHECK constraint para enum, então nenhuma migração de dado é necessária para o tipo.
--
-- `refundOfId` é um vínculo só informativo de um estorno com a compra original, no mesmo
-- espírito de `installmentGroupId`: não é chave estrangeira, para que apagar a compra nunca
-- apague nem trave o estorno que ela gerou.
ALTER TABLE "Transaction" ADD COLUMN "refundOfId" TEXT;
CREATE INDEX "Transaction_refundOfId_idx" ON "Transaction"("refundOfId");
