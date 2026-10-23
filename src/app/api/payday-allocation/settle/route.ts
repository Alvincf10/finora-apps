import mongoose from "mongoose";
import { ok, handleError } from "@/lib/api";
import {
  recordDebtPayment,
  resolveDefaultFundingAccountId,
} from "@/lib/financial/record-debt-payment";
import { recordFixedCostPayment } from "@/lib/financial/record-fixed-cost-payment";
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import { requireUser } from "@/lib/session";
import { settlePaydayEnvelopeSchema } from "@/lib/validations";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { User } from "@/models/User";

/**
 * Mark a payday debt/CC/fixed envelope as paid and record a transaction.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = settlePaydayEnvelopeSchema.parse(await request.json());

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
    if (!input.linkedDebtId) {
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

    const creditCardAccountId =
      input.kind === "CC_STATEMENT" ? input.linkedAccountId : undefined;

    const payment = await recordDebtPayment({
      userId,
      debtId: input.linkedDebtId,
      accountId: fundingAccountId,
      amount: input.amount,
      date: new Date(),
      notes: `Payday settle: ${input.label}`,
      creditCardAccountId,
    });

    const txOid = new mongoose.Types.ObjectId(payment.transactionId);
    const debtOid = new mongoose.Types.ObjectId(input.linkedDebtId);
    const cardOid = input.linkedAccountId
      ? new mongoose.Types.ObjectId(input.linkedAccountId)
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
