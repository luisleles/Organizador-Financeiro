import { prisma } from "@/lib/prisma";

/**
 * Rastro de uma época em que nada impedia `INCOME` numa conta `CREDIT_CARD` — antes de
 * `assertOperationAllowed` existir. Esta auditoria só encontra e descreve; a decisão do que
 * fazer com cada uma é de quem roda o script, nunca automática.
 */
export type IncomeOnCardFinding = {
  transactionId: string;
  accountId: string;
  accountName: string;
  date: Date;
  amountCents: number;
  description: string;
};

export async function findIncomeOnCreditCard(): Promise<IncomeOnCardFinding[]> {
  const rows = await prisma.transaction.findMany({
    where: { type: "INCOME", account: { class: "LIABILITY" } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      amountCents: true,
      description: true,
      account: { select: { id: true, name: true } },
    },
  });

  return rows.map((row) => ({
    transactionId: row.id,
    accountId: row.account.id,
    accountName: row.account.name,
    date: row.date,
    amountCents: row.amountCents,
    description: row.description,
  }));
}

/**
 * Converte em estorno sem mudar valor, data nem fatura: só troca `type` para `REFUND`. A
 * alocação de fatura já é a mesma — um `INCOME` positivo já caía na fatura certa pela regra
 * de fechamento, do mesmo jeito que um `REFUND` cairia.
 */
export async function convertFindingToRefund(transactionId: string): Promise<void> {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { type: "REFUND" },
  });
}

/**
 * Converte em pagamento de fatura: cria a perna que falta na conta de origem indicada e
 * liga as duas pelo mesmo `transferGroupId`, do jeito que `payInvoice` faria. Só faz
 * sentido quando o valor já corresponde ao que baixou a fatura — quem chama decide isso.
 */
export async function convertFindingToInvoicePayment(
  transactionId: string,
  fromAccountId: string,
): Promise<void> {
  const finding = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { userId: true, date: true, amountCents: true, description: true, invoiceId: true },
  });

  await prisma.$transaction(async (tx) => {
    const transferGroupId = crypto.randomUUID();
    await tx.transaction.update({
      where: { id: transactionId },
      data: { type: "TRANSFER", transferGroupId, provider: "manual" },
    });
    await tx.transaction.create({
      data: {
        userId: finding.userId,
        accountId: fromAccountId,
        date: finding.date,
        description: finding.description,
        amountCents: -finding.amountCents,
        type: "TRANSFER",
        transferGroupId,
        provider: "manual",
      },
    });
    if (finding.invoiceId) {
      await tx.invoice.update({
        where: { id: finding.invoiceId },
        data: { paymentTransferGroupId: transferGroupId },
      });
    }
  });
}

export async function deleteFinding(transactionId: string): Promise<void> {
  await prisma.transaction.delete({ where: { id: transactionId } });
}
