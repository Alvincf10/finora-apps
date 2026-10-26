import mongoose from "mongoose";
import { ok, handleError } from "@/lib/api";
import {
  getAccountOrThrow,
  recalculateAccountBalance,
} from "@/lib/financial/balances";
import {
  recordDebtPayment,
  resolveDebtIdForCreditCard,
  resolveDefaultFundingAccountId,
} from "@/lib/financial/record-debt-payment";
import { recordFixedCostPayment } from "@/lib/financial/record-fixed-cost-payment";
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import { requireUser } from "@/lib/session";
import { sessionOption, withTransaction } from "@/lib/with-transaction";
import { settlePaydayEnvelopeSchema } from "@/lib/validations";
import { Category } from "@/models/Category";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";

async function ensureSavingsCategory(userId: string) {
  let savingsCategory = await Category.findOne({
    userId,
    name: "Savings",
    type: "EXPENSE",
  });
  if (!savingsCategory) {
    savingsCategory = await Category.create({
      userId,
      name: "Savings",
      type: "EXPENSE",
      isSystem: true,
      isActive: true,
    });
  }
  return savingsCategory;
}

async function upsertAllocationEnvelopePaid(args: {
  userId: string;
  input: {
    envelopeKey: string;
    amount: number;
    kind: string;
    label: string;
    salary?: number;
    startingCash?: number;
    envelopes?: Array<{
      key: string;
      label: string;
      amount: number;
      source?: string;
      kind?: string;
      linkedDebtId?: string;
      linkedAccountId?: string;
      linkedFixedCostId?: string;
      paid?: boolean;
    }>;
  };
  transactionId: string;
}) {
  const user = await User.findById(args.userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const currency = user?.baseCurrency ?? "IDR";
  const cycle = getPayCycleBounds(paydayDay);

  let allocation = await PaydayAllocation.findOne({
    userId: args.userId,
    cycleStart: cycle.start,
  });

  if (!allocation) {
    allocation = await PaydayAllocation.create({
      userId: args.userId,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      currency,
      salary: args.input.salary ?? user?.monthlySalary ?? 0,
      startingCash: args.input.startingCash ?? 0,
      envelopes: (args.input.envelopes ?? []).map((e) => ({
        key: e.key,
        label: e.label,
        amount: e.amount,
        source: e.source ?? "MANUAL",
        kind: e.kind ?? "OTHER",
        linkedDebtId: e.linkedDebtId
          ? new mongoose.Types.ObjectId(e.linkedDebtId)
          : undefined,
        linkedAccountId: e.linkedAccountId
          ? new mongoose.Types.ObjectId(e.linkedAccountId)
          : undefined,
        linkedFixedCostId: e.linkedFixedCostId
          ? new mongoose.Types.ObjectId(e.linkedFixedCostId)
          : undefined,
        paid: e.paid ?? false,
      })),
      status: "ACTIVE",
    });
  }

  const existing = allocation.envelopes.find(
    (e: { key: string }) => e.key === args.input.envelopeKey
  );
  const txOid = new mongoose.Types.ObjectId(args.transactionId);
  if (existing) {
    existing.paid = true;
    existing.paidAt = new Date();
    existing.paymentTransactionId = txOid;
    existing.amount = args.input.amount;
  } else {
    allocation.envelopes.push({
      key: args.input.envelopeKey,
      label: args.input.label,
      amount: args.input.amount,
      source: "MANUAL",
      kind: args.input.kind,
      paid: true,
      paidAt: new Date(),
      paymentTransactionId: txOid,
    });
  }
  if (args.input.salary != null) allocation.salary = args.input.salary;
  if (args.input.startingCash != null) {
    allocation.startingCash = args.input.startingCash;
  }
  allocation.status = "ACTIVE";
  await allocation.save();
}

/**
 * Mark a payday debt/CC/fixed/goals envelope as paid and record a transaction.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = settlePaydayEnvelopeSchema.parse(await request.json());

    if (input.kind === "GOALS") {
      const goalId = input.envelopeKey.startsWith("goals:")
        ? input.envelopeKey.slice("goals:".length)
        : null;
      if (!goalId || !mongoose.isValidObjectId(goalId)) {
        throw new Error("Goal envelope has no linked savings goal");
      }

      const fundingAccountId =
        input.accountId ?? (await resolveDefaultFundingAccountId(userId));
      if (!fundingAccountId) {
        throw new Error("No bank/cash account found to fund the goal");
      }

      const goal = await SavingsGoal.findOne({ _id: goalId, userId });
      if (!goal) throw new Error("NOT_FOUND");
      if (goal.status !== "ACTIVE") throw new Error("Goal is not active");

      const account = await getAccountOrThrow(fundingAccountId, userId);
      if (account.currency !== goal.currency) {
        throw new Error("Account currency must match goal currency");
      }

      const savingsCategory = await ensureSavingsCategory(userId);

      const result = await withTransaction(async (session) => {
        const freshGoal = await SavingsGoal.findOne({
          _id: goalId,
          userId,
        }).session(session);
        if (!freshGoal) throw new Error("NOT_FOUND");
        if (freshGoal.status !== "ACTIVE") {
          throw new Error("Goal is not active");
        }

        const [tx] = await Transaction.create(
          [
            {
              userId,
              accountId: account._id,
              type: "EXPENSE",
              amount: input.amount,
              currency: freshGoal.currency,
              categoryId: savingsCategory._id,
              description: `Contribution: ${freshGoal.name}`,
              date: new Date(),
              notes: `Payday settle: ${input.label}`,
              goalId: freshGoal._id,
              tags: ["goal-contribution", "payday"],
            },
          ],
          sessionOption(session)
        );

        freshGoal.currentAmount += input.amount;
        if (freshGoal.currentAmount >= freshGoal.targetAmount) {
          freshGoal.status = "COMPLETED";
        }
        await freshGoal.save(sessionOption(session));
        const funding = await recalculateAccountBalance(
          account._id.toString(),
          session ?? undefined
        );

        return {
          transactionId: tx._id.toString(),
          goalId: freshGoal._id.toString(),
          goalCurrent: freshGoal.currentAmount,
          goalStatus: freshGoal.status,
          fundingBalance: funding.currentBalance,
        };
      });

      await upsertAllocationEnvelopePaid({
        userId,
        input,
        transactionId: result.transactionId,
      });

      return ok({
        ...result,
        envelopeKey: input.envelopeKey,
        fundingAccountId,
        message: "Goal contribution recorded",
      });
    }

    if (input.kind === "FIXED") {
      const fixedCostId =
        input.linkedFixedCostId ??
        (input.envelopeKey.startsWith("fixed:")
          ? input.envelopeKey.slice("fixed:".length)
          : null);
      if (!fixedCostId) {
        throw new Error("Fixed envelope has no linked fixed cost");
      }
      const payment = await recordFixedCostPayment({
        userId,
        fixedCostId,
        accountId: input.accountId,
        amount: input.amount,
        notes: `Payday settle: ${input.label}`,
      });
      return ok({
        ...payment,
        envelopeKey: input.envelopeKey,
        message: payment.alreadyPaidThisCycle
          ? "Fixed cost already paid this cycle"
          : "Fixed cost payment recorded",
      });
    }

    if (input.kind !== "DEBT" && input.kind !== "CC_STATEMENT") {
      throw new Error(
        "Only debt / CC / fixed envelopes can be settled into transactions"
      );
    }

    const creditCardAccountId =
      input.kind === "CC_STATEMENT"
        ? input.linkedAccountId ??
          (input.envelopeKey.startsWith("cc_statement:")
            ? input.envelopeKey.slice("cc_statement:".length)
            : undefined)
        : input.linkedAccountId;

    let linkedDebtId = input.linkedDebtId;
    if (!linkedDebtId && input.kind === "CC_STATEMENT") {
      if (!creditCardAccountId) {
        throw new Error("CC envelope has no linked credit card account");
      }
      linkedDebtId = await resolveDebtIdForCreditCard(
        userId,
        creditCardAccountId
      );
    }
    if (!linkedDebtId) {
      throw new Error(
        "Envelope has no linked debt — cannot auto-record payment"
      );
    }

    const fundingAccountId =
      input.accountId ?? (await resolveDefaultFundingAccountId(userId));
    if (!fundingAccountId) {
      throw new Error("No bank/cash account found to pay from");
    }

    const user = await User.findById(userId).lean();
    const paydayDay = user?.paydayDay ?? 25;
    const currency = user?.baseCurrency ?? "IDR";
    const cycle = getPayCycleBounds(paydayDay);

    let allocation = await PaydayAllocation.findOne({
      userId,
      cycleStart: cycle.start,
    });

    if (!allocation) {
      allocation = await PaydayAllocation.create({
        userId,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        currency,
        salary: input.salary ?? user?.monthlySalary ?? 0,
        startingCash: input.startingCash ?? 0,
        envelopes: (input.envelopes ?? []).map((e) => ({
          key: e.key,
          label: e.label,
          amount: e.amount,
          source: e.source ?? "MANUAL",
          kind: e.kind ?? "OTHER",
          linkedDebtId: e.linkedDebtId
            ? new mongoose.Types.ObjectId(e.linkedDebtId)
            : undefined,
          linkedAccountId: e.linkedAccountId
            ? new mongoose.Types.ObjectId(e.linkedAccountId)
            : undefined,
          linkedFixedCostId: e.linkedFixedCostId
            ? new mongoose.Types.ObjectId(e.linkedFixedCostId)
            : undefined,
          paid: e.paid ?? false,
        })),
        status: "ACTIVE",
      });
    }

    const existing = allocation.envelopes.find(
      (e: { key: string; paymentTransactionId?: unknown }) =>
        e.key === input.envelopeKey
    );
    if (existing?.paymentTransactionId) {
      throw new Error("Envelope already settled — payment already recorded");
    }

    const payment = await recordDebtPayment({
      userId,
      debtId: linkedDebtId,
      accountId: fundingAccountId,
      amount: input.amount,
      date: new Date(),
      notes: `Payday settle: ${input.label}`,
      creditCardAccountId:
        input.kind === "CC_STATEMENT" ? creditCardAccountId : undefined,
    });

    const txOid = new mongoose.Types.ObjectId(payment.transactionId);
    const debtOid = new mongoose.Types.ObjectId(linkedDebtId);
    const cardOid = creditCardAccountId
      ? new mongoose.Types.ObjectId(creditCardAccountId)
      : undefined;

    if (existing) {
      existing.paid = true;
      existing.paidAt = new Date();
      existing.paymentTransactionId = txOid;
      existing.amount = input.amount;
      if (!existing.linkedDebtId) existing.linkedDebtId = debtOid;
      if (cardOid && !existing.linkedAccountId) {
        existing.linkedAccountId = cardOid;
      }
    } else {
      allocation.envelopes.push({
        key: input.envelopeKey,
        label: input.label,
        amount: input.amount,
        source: "MANUAL",
        kind: input.kind,
        linkedDebtId: debtOid,
        linkedAccountId: cardOid,
        paid: true,
        paidAt: new Date(),
        paymentTransactionId: txOid,
      });
    }

    if (input.salary != null) allocation.salary = input.salary;
    if (input.startingCash != null) allocation.startingCash = input.startingCash;
    allocation.status = "ACTIVE";
    await allocation.save();

    return ok({
      ...payment,
      envelopeKey: input.envelopeKey,
      fundingAccountId,
      message: "Payment recorded as Debt Payment transaction",
    });
  } catch (error) {
    return handleError(error);
  }
}
