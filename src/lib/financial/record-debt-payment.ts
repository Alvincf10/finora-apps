import { Account } from "@/models/Account";
import { Category } from "@/models/Category";
import { Debt } from "@/models/Debt";
import { DebtPayment } from "@/models/DebtPayment";
import { Transaction } from "@/models/Transaction";
import {
  applyTransactionEffect,
  getAccountOrThrow,
  isLiabilityAccount,
  recalculateAccountBalance,
} from "@/lib/financial/balances";
import { sessionOption, withTransaction } from "@/lib/with-transaction";
import type { AccountType } from "@/types";

export type RecordDebtPaymentInput = {
  userId: string;
  debtId: string;
  accountId: string;
  amount: number;
  date?: Date;
  notes?: string;
  /** When paying a CC statement, also reduce card outstanding / statement due. */
  creditCardAccountId?: string;
};

export type RecordDebtPaymentResult = {
  paymentId: string;
  transactionId: string;
  debtRemaining: number;
  debtStatus: string;
  fundingBalance: number;
  creditCardOutstanding?: number;
  creditCardStatementDue?: number;
};

async function ensureDebtPaymentCategory(userId: string) {
  let debtCategory = await Category.findOne({
    userId,
    name: "Debt Payment",
    type: "EXPENSE",
  });
  if (!debtCategory) {
    debtCategory = await Category.create({
      userId,
      name: "Debt Payment",
      type: "EXPENSE",
      isSystem: true,
      isActive: true,
    });
  }
  return debtCategory;
}

/**
 * Record a debt payment: EXPENSE on funding account + DebtPayment + lower remaining.
 * Optionally sync linked CREDIT_CARD outstanding / statement due.
 */
export async function recordDebtPayment(
  input: RecordDebtPaymentInput
): Promise<RecordDebtPaymentResult> {
  const debt = await Debt.findOne({ _id: input.debtId, userId: input.userId });
  if (!debt) throw new Error("NOT_FOUND");
  if (debt.status !== "ACTIVE") throw new Error("Debt is not active");
  if (input.amount <= 0) throw new Error("Amount must be positive");

  const account = await getAccountOrThrow(input.accountId, input.userId);
  if (account.currency !== debt.currency) {
    throw new Error("Account currency must match debt currency");
  }
  if (isLiabilityAccount(account.type as AccountType)) {
    throw new Error("Pay debts from a cash/bank account, not the credit card");
  }

  const debtCategory = await ensureDebtPaymentCategory(input.userId);
  const payDate = input.date ?? new Date();
  const amount = Math.min(input.amount, debt.remainingAmount);

  const result = await withTransaction(async (session) => {
    const freshDebt = await Debt.findOne({
      _id: input.debtId,
      userId: input.userId,
    }).session(session);
    if (!freshDebt) throw new Error("NOT_FOUND");
    if (freshDebt.status !== "ACTIVE") throw new Error("Debt is not active");

    const payAmount = Math.min(amount, freshDebt.remainingAmount);

    const [tx] = await Transaction.create(
      [
        {
          userId: input.userId,
          accountId: account._id,
          type: "EXPENSE",
          amount: payAmount,
          currency: freshDebt.currency,
          categoryId: debtCategory._id,
          description: `Debt payment: ${freshDebt.name}`,
          date: payDate,
          notes: input.notes,
          debtId: freshDebt._id,
          tags: ["debt-payment", "payday"],
        },
      ],
      sessionOption(session)
    );

    const [payment] = await DebtPayment.create(
      [
        {
          userId: input.userId,
          debtId: freshDebt._id,
          accountId: account._id,
          amount: payAmount,
          currency: freshDebt.currency,
          date: payDate,
          notes: input.notes,
          transactionId: tx._id,
        },
      ],
      sessionOption(session)
    );

    freshDebt.remainingAmount = Math.max(
      0,
      freshDebt.remainingAmount - payAmount
    );
    if (freshDebt.remainingAmount === 0) freshDebt.status = "PAID";
    await freshDebt.save(sessionOption(session));

    await recalculateAccountBalance(
      account._id.toString(),
      session ?? undefined
    );

    let creditCardOutstanding: number | undefined;
    let creditCardStatementDue: number | undefined;

    if (input.creditCardAccountId) {
      const card = await Account.findOne({
        _id: input.creditCardAccountId,
        userId: input.userId,
        type: "CREDIT_CARD",
      }).session(session);

      if (card) {
        const outstanding = Math.max(0, (card.currentBalance ?? 0) - payAmount);
        const statementDue = Math.max(
          0,
          (card.statementDueAmount ?? 0) - payAmount
        );
        // Keep ledger consistent without a phantom CC transaction:
        // adjust opening so outstanding = initial + liability effects.
        const txs = await Transaction.find({ accountId: card._id })
          .session(session)
          .lean();
        let effects = 0;
        for (const t of txs) {
          effects = applyTransactionEffect(
            effects,
            t,
            "CREDIT_CARD" as AccountType
          );
        }
        card.initialBalance = outstanding - effects;
        card.currentBalance = outstanding;
        card.statementDueAmount = statementDue;
        await card.save(sessionOption(session));
        creditCardOutstanding = outstanding;
        creditCardStatementDue = statementDue;
      }
    }

    const funding = await Account.findById(account._id).session(session);

    return {
      paymentId: payment._id.toString(),
      transactionId: tx._id.toString(),
      debtRemaining: freshDebt.remainingAmount,
      debtStatus: freshDebt.status,
      fundingBalance: funding?.currentBalance ?? 0,
      creditCardOutstanding,
      creditCardStatementDue,
    };
  });

  return result;
}

export async function resolveDefaultFundingAccountId(
  userId: string
): Promise<string | null> {
  const accounts = await Account.find({
    userId,
    isActive: true,
    type: { $in: ["BANK", "CASH", "E_WALLET"] },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const preferred =
    accounts.find((a) => /bca/i.test(a.name)) ??
    accounts.find((a) => a.type === "BANK") ??
    accounts[0];

  return preferred?._id?.toString() ?? null;
}

/**
 * Resolve (or create) the CREDIT_STATEMENT debt mirrored to a CC account,
 * so Payday CC envelopes can settle without a pre-linked debt id.
 */
export async function resolveDebtIdForCreditCard(
  userId: string,
  creditCardAccountId: string
): Promise<string> {
  const existing = await Debt.findOne({
    userId,
    status: "ACTIVE",
    linkedAccountId: creditCardAccountId,
  }).lean();
  if (existing) return existing._id.toString();

  const card = await Account.findOne({
    _id: creditCardAccountId,
    userId,
    type: "CREDIT_CARD",
    isActive: true,
  });
  if (!card) throw new Error("Credit card account not found");

  const outstanding = Math.max(0, card.currentBalance ?? 0);
  if (outstanding <= 0) {
    throw new Error("Credit card has no outstanding balance to pay");
  }

  const statementDue = Math.max(
    0,
    Math.min(outstanding, card.statementDueAmount ?? outstanding)
  );

  const created = await Debt.create({
    userId,
    name: `Bayar CC · ${card.name}`,
    kind: "CONSUMER",
    originalAmount: outstanding,
    remainingAmount: outstanding,
    currency: card.currency,
    obligationType: "CREDIT_STATEMENT",
    linkedAccountId: card._id,
    plannedPayment: statementDue > 0 ? statementDue : outstanding,
    status: "ACTIVE",
  });

  return created._id.toString();
}
