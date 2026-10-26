import mongoose from "mongoose";
import { Account } from "@/models/Account";
import { Category } from "@/models/Category";
import { FixedCost } from "@/models/FixedCost";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import {
  getAccountOrThrow,
  isLiabilityAccount,
  recalculateAccountBalance,
} from "@/lib/financial/balances";
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import { resolveDefaultFundingAccountId } from "@/lib/financial/record-debt-payment";
import { sessionOption, withTransaction } from "@/lib/with-transaction";
import type { AccountType } from "@/types";

/**
 * Prefer dedicated fixed-cost pocket (name contains "fixed"), then BCA/bank.
 */
export async function resolveFixedCostFundingAccountId(
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
    accounts.find((a) => /fixed/i.test(a.name)) ??
    accounts.find((a) => /bca/i.test(a.name)) ??
    accounts.find((a) => a.type === "BANK") ??
    accounts[0];

  return preferred?._id?.toString() ?? null;
}

export type RecordFixedCostPaymentInput = {
  userId: string;
  fixedCostId: string;
  accountId?: string;
  amount?: number;
  date?: Date;
  notes?: string;
};

export type RecordFixedCostPaymentResult = {
  transactionId: string;
  fundingAccountId: string;
  fundingBalance: number;
  amount: number;
  envelopeKey: string;
  alreadyPaidThisCycle: boolean;
};

async function ensureBillsCategory(userId: string) {
  let cat = await Category.findOne({
    userId,
    name: "Bills",
    type: "EXPENSE",
  });
  if (!cat) {
    cat = await Category.create({
      userId,
      name: "Bills",
      type: "EXPENSE",
      isSystem: true,
      isActive: true,
    });
  }
  return cat;
}

/**
 * Pay a fixed cost: EXPENSE on funding account + mark payday envelope paid.
 */
export async function recordFixedCostPayment(
  input: RecordFixedCostPaymentInput
): Promise<RecordFixedCostPaymentResult> {
  const cost = await FixedCost.findOne({
    _id: input.fixedCostId,
    userId: input.userId,
  });
  if (!cost) throw new Error("NOT_FOUND");
  if (!cost.isActive) throw new Error("Fixed cost is inactive");

  const user = await User.findById(input.userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const currency = (user?.baseCurrency as string) ?? cost.currency;
  const cycle = getPayCycleBounds(paydayDay);

  // Idempotent: already paid this cycle?
  const existingTx = await Transaction.findOne({
    userId: input.userId,
    fixedCostId: cost._id,
    type: "EXPENSE",
    date: { $gte: cycle.start, $lte: cycle.end },
  }).lean();

  if (existingTx) {
    return {
      transactionId: existingTx._id.toString(),
      fundingAccountId: existingTx.accountId.toString(),
      fundingBalance: 0,
      amount: existingTx.amount,
      envelopeKey: `fixed:${cost._id.toString()}`,
      alreadyPaidThisCycle: true,
    };
  }

  const fundingAccountId =
    input.accountId?.trim() ||
    (await resolveFixedCostFundingAccountId(input.userId)) ||
    (await resolveDefaultFundingAccountId(input.userId));
  if (!fundingAccountId) {
    throw new Error("Select a bank/cash account to pay from");
  }

  const account = await getAccountOrThrow(fundingAccountId, input.userId);
  if (account.currency !== cost.currency) {
    throw new Error("Account currency must match fixed cost currency");
  }
  if (isLiabilityAccount(account.type as AccountType)) {
    throw new Error("Pay fixed costs from a cash/bank account");
  }

  const amount = input.amount && input.amount > 0 ? input.amount : cost.amount;
  const payDate = input.date ?? new Date();
  const billsCategory = await ensureBillsCategory(input.userId);
  const envelopeKey = `fixed:${cost._id.toString()}`;

  const result = await withTransaction(async (session) => {
    const [tx] = await Transaction.create(
      [
        {
          userId: input.userId,
          accountId: account._id,
          type: "EXPENSE",
          amount,
          currency: cost.currency,
          categoryId: billsCategory._id,
          description: `Fixed cost: ${cost.name}`,
          date: payDate,
          notes: input.notes ?? cost.notes,
          fixedCostId: cost._id,
          tags: ["fixed-cost", "payday"],
        },
      ],
      sessionOption(session)
    );

    await recalculateAccountBalance(
      account._id.toString(),
      session ?? undefined
    );

    const funding = await Account.findById(account._id).session(session);

    return {
      transactionId: tx._id.toString(),
      fundingAccountId: account._id.toString(),
      fundingBalance: funding?.currentBalance ?? 0,
      amount,
      envelopeKey,
      alreadyPaidThisCycle: false,
    };
  });

  // Sync payday allocation envelope (outside TX — best effort).
  await syncPaydayFixedEnvelope({
    userId: input.userId,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    currency,
    salary: user?.monthlySalary ?? 0,
    envelopeKey,
    label: cost.name,
    amount,
    fixedCostId: cost._id.toString(),
    transactionId: result.transactionId,
  });

  return result;
}

async function syncPaydayFixedEnvelope(args: {
  userId: string;
  cycleStart: Date;
  cycleEnd: Date;
  currency: string;
  salary: number;
  envelopeKey: string;
  label: string;
  amount: number;
  fixedCostId: string;
  transactionId: string;
}) {
  let allocation = await PaydayAllocation.findOne({
    userId: args.userId,
    cycleStart: args.cycleStart,
  });

  const txOid = new mongoose.Types.ObjectId(args.transactionId);
  const fixedOid = new mongoose.Types.ObjectId(args.fixedCostId);

  if (!allocation) {
    await PaydayAllocation.create({
      userId: args.userId,
      cycleStart: args.cycleStart,
      cycleEnd: args.cycleEnd,
      currency: args.currency,
      salary: args.salary,
      startingCash: 0,
      status: "ACTIVE",
      envelopes: [
        {
          key: args.envelopeKey,
          label: args.label,
          amount: args.amount,
          source: "AUTO",
          kind: "FIXED",
          linkedFixedCostId: fixedOid,
          paid: true,
          paidAt: new Date(),
          paymentTransactionId: txOid,
        },
      ],
    });
    return;
  }

  // Remove legacy bundled "fixed:all" once we start paying per item.
  allocation.envelopes = allocation.envelopes.filter(
    (e: { key: string }) => e.key !== "fixed:all"
  );

  const existing = allocation.envelopes.find(
    (e: { key: string }) => e.key === args.envelopeKey
  );

  if (existing) {
    existing.paid = true;
    existing.paidAt = new Date();
    existing.paymentTransactionId = txOid;
    existing.amount = args.amount;
    existing.linkedFixedCostId = fixedOid;
    existing.label = args.label;
    existing.kind = "FIXED";
  } else {
    allocation.envelopes.push({
      key: args.envelopeKey,
      label: args.label,
      amount: args.amount,
      source: "AUTO",
      kind: "FIXED",
      linkedFixedCostId: fixedOid,
      paid: true,
      paidAt: new Date(),
      paymentTransactionId: txOid,
    });
  }

  allocation.status = "ACTIVE";
  await allocation.save();
}

export async function getFixedCostPaidIdsInCycle(
  userId: string,
  start: Date,
  end: Date
): Promise<Set<string>> {
  const map = await getFixedCostPaymentsInCycle(userId, start, end);
  return new Set(map.keys());
}

export type FixedCostPaymentInCycle = {
  transactionId: string;
  accountId: string;
  amount: number;
};

export async function getFixedCostPaymentsInCycle(
  userId: string,
  start: Date,
  end: Date
): Promise<Map<string, FixedCostPaymentInCycle>> {
  const txs = await Transaction.find({
    userId,
    type: "EXPENSE",
    fixedCostId: { $ne: null },
    date: { $gte: start, $lte: end },
  })
    .select({ fixedCostId: 1, accountId: 1, amount: 1 })
    .lean();

  const map = new Map<string, FixedCostPaymentInCycle>();
  for (const tx of txs) {
    if (!tx.fixedCostId) continue;
    map.set(tx.fixedCostId.toString(), {
      transactionId: tx._id.toString(),
      accountId: tx.accountId.toString(),
      amount: tx.amount,
    });
  }
  return map;
}

/**
 * Move this cycle's fixed-cost expense to another funding account and
 * recalculate both balances.
 */
export async function reassignFixedCostPaymentSource(input: {
  userId: string;
  fixedCostId: string;
  accountId: string;
}): Promise<{
  transactionId: string;
  previousAccountId: string;
  fundingAccountId: string;
  fundingBalance: number;
  previousBalance: number;
  amount: number;
}> {
  const cost = await FixedCost.findOne({
    _id: input.fixedCostId,
    userId: input.userId,
  });
  if (!cost) throw new Error("NOT_FOUND");

  const user = await User.findById(input.userId).lean();
  const cycle = getPayCycleBounds(user?.paydayDay ?? 25);

  const existingTx = await Transaction.findOne({
    userId: input.userId,
    fixedCostId: cost._id,
    type: "EXPENSE",
    date: { $gte: cycle.start, $lte: cycle.end },
  });
  if (!existingTx) {
    throw new Error("No payment recorded this cycle to reassign");
  }

  const previousAccountId = existingTx.accountId.toString();
  if (previousAccountId === input.accountId) {
    const same = await getAccountOrThrow(input.accountId, input.userId);
    return {
      transactionId: existingTx._id.toString(),
      previousAccountId,
      fundingAccountId: previousAccountId,
      fundingBalance: same.currentBalance,
      previousBalance: same.currentBalance,
      amount: existingTx.amount,
    };
  }

  const nextAccount = await getAccountOrThrow(input.accountId, input.userId);
  if (nextAccount.currency !== cost.currency) {
    throw new Error("Account currency must match fixed cost currency");
  }
  if (isLiabilityAccount(nextAccount.type as AccountType)) {
    throw new Error("Pay fixed costs from a cash/bank account");
  }

  return withTransaction(async (session) => {
    existingTx.accountId = nextAccount._id;
    await existingTx.save(sessionOption(session));

    const previous = await recalculateAccountBalance(
      previousAccountId,
      session ?? undefined
    );
    const funding = await recalculateAccountBalance(
      nextAccount._id.toString(),
      session ?? undefined
    );

    return {
      transactionId: existingTx._id.toString(),
      previousAccountId,
      fundingAccountId: nextAccount._id.toString(),
      fundingBalance: funding.currentBalance,
      previousBalance: previous.currentBalance,
      amount: existingTx.amount,
    };
  });
}
