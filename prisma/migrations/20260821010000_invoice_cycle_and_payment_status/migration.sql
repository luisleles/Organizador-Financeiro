-- A fatura para de guardar um status combinado de ciclo e pagamento. O ciclo (aberta ou
-- fechada) passa a vir só do fechamento e nunca é persistido; o pagamento passa a ser
-- derivado do saldo dos lançamentos mais `paidAt`, que já existia e continua intacto.
-- Nenhuma fatura hoje marcada como paga perde essa informação: `paidAt` já estava
-- preenchido para todas elas.
ALTER TABLE "Invoice" DROP COLUMN "status";
