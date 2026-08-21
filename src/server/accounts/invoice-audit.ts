import { prisma } from "@/lib/prisma";
import {
  invoiceScheduleForPurchase,
  isOpenForPosting,
  shiftInvoiceSchedule,
  type InvoiceSchedule,
} from "./account.credit-card";

/**
 * Uma parcela do jeito que está hoje e do jeito que deveria estar. `correctSchedule` vem
 * só da data da compra e da posição da parcela, encadeado mês a mês a partir da primeira —
 * exatamente o que `createTransaction` produziria se a regra antiga nunca tivesse existido.
 */
export type InstallmentAllocation = {
  transactionId: string;
  installmentNumber: number | null;
  date: Date;
  currentInvoiceId: string;
  currentReferenceMonth: Date;
  correctSchedule: InvoiceSchedule;
};

export type MisallocatedGroup = {
  cardDetailsId: string;
  accountId: string;
  accountName: string;
  description: string;
  installmentGroupId: string | null;
  /** Todas as parcelas do grupo, na ordem — não só as que divergem — para realocar junto. */
  installments: InstallmentAllocation[];
};

/**
 * Acha compras presas na fatura errada pela regra antiga de alocação: a fatura anterior
 * existia, já tinha sido paga e ainda estava aberta no instante em que o lançamento foi
 * criado — exatamente a condição que fazia `ensureOpenInvoice` pular para a fatura
 * seguinte. Só reporta quando essa explicação se confirma; uma divergência sem essa causa
 * pode ter uma razão legítima e fica de fora, para não sugerir uma realocação errada.
 */
export async function findMisallocatedGroups(): Promise<MisallocatedGroup[]> {
  const cards = await prisma.creditCardDetails.findMany({
    select: {
      id: true,
      closingDay: true,
      dueDay: true,
      account: { select: { id: true, name: true } },
    },
  });

  const groups: MisallocatedGroup[] = [];

  for (const card of cards) {
    const transactions = await prisma.transaction.findMany({
      where: { accountId: card.account.id, invoiceId: { not: null }, type: { not: "TRANSFER" } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        createdAt: true,
        description: true,
        installmentGroupId: true,
        installmentNumber: true,
        invoice: { select: { id: true, referenceMonth: true } },
      },
    });

    const byGroup = new Map<string, typeof transactions>();
    for (const transaction of transactions) {
      const key = transaction.installmentGroupId ?? transaction.id;
      byGroup.set(key, [...(byGroup.get(key) ?? []), transaction]);
    }

    for (const rows of byGroup.values()) {
      const ordered = [...rows].sort(
        (left, right) => (left.installmentNumber ?? 1) - (right.installmentNumber ?? 1),
      );
      const anchor = ordered[0];
      let schedule = invoiceScheduleForPurchase(anchor.date, card.closingDay, card.dueDay);

      const installments: InstallmentAllocation[] = ordered.map((row, index) => {
        if (index > 0) schedule = shiftInvoiceSchedule(schedule, 1, card.closingDay, card.dueDay);
        return {
          transactionId: row.id,
          installmentNumber: row.installmentNumber,
          date: row.date,
          currentInvoiceId: row.invoice!.id,
          currentReferenceMonth: row.invoice!.referenceMonth,
          correctSchedule: schedule,
        };
      });

      const firstMismatch = installments.find(
        (installment) =>
          installment.currentReferenceMonth.getTime() !==
          installment.correctSchedule.referenceMonth.getTime(),
      );
      if (!firstMismatch) continue;

      const earlierInvoice = await prisma.invoice.findUnique({
        where: {
          creditCardDetailsId_referenceMonth: {
            creditCardDetailsId: card.id,
            referenceMonth: firstMismatch.correctSchedule.referenceMonth,
          },
        },
        select: { closingDate: true, paidAt: true },
      });
      const createdAt = ordered.find((row) => row.id === firstMismatch.transactionId)!.createdAt;
      const explainedByKnownBug =
        earlierInvoice !== null &&
        earlierInvoice.paidAt !== null &&
        earlierInvoice.paidAt.getTime() <= createdAt.getTime() &&
        isOpenForPosting(earlierInvoice.closingDate, createdAt);
      if (!explainedByKnownBug) continue;

      groups.push({
        cardDetailsId: card.id,
        accountId: card.account.id,
        accountName: card.account.name,
        description: anchor.description,
        installmentGroupId: anchor.installmentGroupId,
        installments,
      });
    }
  }

  return groups;
}

/**
 * Move para a fatura correta só as parcelas do grupo que realmente divergem, criando a
 * fatura de destino quando ainda não existir. As demais parcelas do grupo — as que já
 * caíram certas — ficam como estão.
 */
export async function reallocateGroup(group: MisallocatedGroup): Promise<number> {
  return prisma.$transaction(async (tx) => {
    let moved = 0;
    for (const installment of group.installments) {
      if (
        installment.currentReferenceMonth.getTime() ===
        installment.correctSchedule.referenceMonth.getTime()
      ) {
        continue;
      }

      const invoice = await tx.invoice.upsert({
        where: {
          creditCardDetailsId_referenceMonth: {
            creditCardDetailsId: group.cardDetailsId,
            referenceMonth: installment.correctSchedule.referenceMonth,
          },
        },
        create: { creditCardDetailsId: group.cardDetailsId, ...installment.correctSchedule },
        update: {},
        select: { id: true },
      });
      await tx.transaction.update({
        where: { id: installment.transactionId },
        data: { invoiceId: invoice.id },
      });
      moved += 1;
    }
    return moved;
  });
}
