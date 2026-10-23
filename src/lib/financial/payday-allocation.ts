import { Account } from "@/models/Account";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { User } from "@/models/User";
import { isLiabilityAccount } from "@/lib/financial/balances";
import { getCreditCardsForUser } from "@/lib/financial/credit-cards";
import { getDebtsDueInRange } from "@/lib/financial/debts-due";
import { getFixedCostsInRange } from "@/lib/financial/fixed-costs";
import { getFixedCostPaidIdsInCycle } from "@/lib/financial/record-fixed-cost-payment";
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import type { AccountType, Currency } from "@/types";

export type AllocationEnvelope = {
  key: string;
  label: string;
  amount: number;
  source: "AUTO" | "MANUAL";
  kind:
    | "CC_STATEMENT"
    | "DEBT"
    | "FIXED"
    | "CASH_BUFFER"
    | "CC_SPEND_CAP"
    | "LIVING"
    | "GOALS"
    | "OTHER";
  linkedDebtId?: string;
  linkedAccountId?: string;
  linkedFixedCostId?: string;
  paid?: boolean;
  paymentTransactionId?: string;
};

export type PaydayAllocationSuggestion = {
  cycle: { start: string; end: string; paydayDay: number; label: string };
  currency: Currency;
  /** Actual take-home for this cycle (editable; may exceed base). */
  salary: number;
  /** Recurring salary from Settings — reference only. */
  baseSalary: number;
  startingCash: number;
  /** Suggested cash from accounts (before any saved override). */
  suggestedStartingCash: number;
  totalIn: number;
  envelopes: AllocationEnvelope[];
  allocated: number;
  remaining: number;
  configured: boolean;
  existingId: string | null;
  existingStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | null;
};

function roundMoney(n: number) {
  return Math.max(0, Math.round(n));
}

/**
 * Build a suggested payday envelope split for the current pay cycle.
 * CC statement due is taken from CREDIT_CARD accounts (not double-counted
 * via linked CREDIT_STATEMENT debts).
 */
export async function suggestPaydayAllocation(
  userId: string,
  now: Date = new Date(),
  options: { ignoreSaved?: boolean } = {}
): Promise<PaydayAllocationSuggestion> {
  const user = await User.findById(userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const baseSalary = user?.monthlySalary ?? 0;
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const cycle = getPayCycleBounds(paydayDay, now);

  const [accounts, cards, debtsDue, fixedCosts, paidFixedIds, existing] =
    await Promise.all([
      Account.find({ userId, isActive: true }).lean(),
      getCreditCardsForUser(userId),
      getDebtsDueInRange(userId, cycle.start, cycle.end, currency),
      getFixedCostsInRange(userId, cycle.start, cycle.end, currency),
      getFixedCostPaidIdsInCycle(userId, cycle.start, cycle.end),
      PaydayAllocation.findOne({
        userId,
        cycleStart: cycle.start,
      }).lean(),
    ]);

  let suggestedStartingCash = 0;
  for (const account of accounts) {
    if (!isLiabilityAccount(account.type as AccountType)) {
      suggestedStartingCash += Math.max(0, account.currentBalance);
    }
  }

  const useSaved =
    !options.ignoreSaved &&
    existing?.envelopes &&
    existing.envelopes.length > 0;

  // Cycle salary is flexible: saved override wins, else Settings base.
  const salary = useSaved
    ? (existing!.salary ?? baseSalary)
    : baseSalary;
  const startingCash = useSaved
    ? (existing!.startingCash ?? suggestedStartingCash)
    : suggestedStartingCash;

  const linkedCcAccountIds = new Set(
    cards.map((c) => c.accountId)
  );

  const envelopes: AllocationEnvelope[] = [];

  for (const card of cards) {
    if (card.statementDueAmount <= 0) continue;
    envelopes.push({
      key: `cc_statement:${card.accountId}`,
      label: `Bayar CC · ${card.name}`,
      amount: card.statementDueAmount,
      source: "AUTO",
      kind: "CC_STATEMENT",
      linkedAccountId: card.accountId,
    });
  }

  for (const debt of debtsDue.items) {
    // Skip debts that mirror a CC account statement (avoid double count).
    if (
      debt.linkedAccountId &&
      linkedCcAccountIds.has(debt.linkedAccountId)
    ) {
      continue;
    }
    if (debt.remainingDue <= 0) continue;
    envelopes.push({
      key: `debt:${debt.debtId}`,
      label: debt.name,
      amount: debt.remainingDue,
      source: "AUTO",
      kind: "DEBT",
      linkedDebtId: debt.debtId,
    });
  }

  for (const item of fixedCosts.items) {
    const key = `fixed:${item.fixedCostId}`;
    const paid = paidFixedIds.has(item.fixedCostId);
    envelopes.push({
      key,
      label: `${item.name} · tgl ${item.dueDay}`,
      amount: item.amount,
      source: "AUTO",
      kind: "FIXED",
      linkedFixedCostId: item.fixedCostId,
      paid,
    });
  }

  const totalIn = startingCash + salary;
  const obligated = envelopes.reduce((s, e) => s + e.amount, 0);
  let leftover = Math.max(0, totalIn - obligated);

  // Default split of leftover: cash buffer 20% (min ~500k IDR if possible),
  // CC spend cap 55%, living/hepi 25%.
  const bufferTarget =
    currency === "IDR"
      ? Math.min(leftover, Math.max(500_000, Math.round(leftover * 0.2)))
      : Math.min(leftover, Math.round(leftover * 0.2));
  leftover -= bufferTarget;

  const ccCap = roundMoney(leftover * 0.7);
  const living = Math.max(0, leftover - ccCap);

  if (bufferTarget > 0) {
    envelopes.push({
      key: "cash_buffer",
      label: "Cash pegangan",
      amount: bufferTarget,
      source: "AUTO",
      kind: "CASH_BUFFER",
    });
  }

  const primaryCard = cards[0];
  if (ccCap > 0) {
    envelopes.push({
      key: primaryCard
        ? `cc_spend_cap:${primaryCard.accountId}`
        : "cc_spend_cap",
      label: primaryCard
        ? `Cap belanja CC · ${primaryCard.name}`
        : "Cap belanja CC",
      amount: ccCap,
      source: "AUTO",
      kind: "CC_SPEND_CAP",
      linkedAccountId: primaryCard?.accountId,
    });
  }

  if (living > 0) {
    envelopes.push({
      key: "living",
      label: "Makan & hepi (cash)",
      amount: living,
      source: "AUTO",
      kind: "LIVING",
    });
  }

  let finalEnvelopes: AllocationEnvelope[] = envelopes;

  if (useSaved) {
    const savedMapped = existing!.envelopes.map(
      (e: {
        key: string;
        label: string;
        amount: number;
        source?: string;
        kind?: string;
        linkedDebtId?: { toString(): string };
        linkedAccountId?: { toString(): string };
        linkedFixedCostId?: { toString(): string };
        paid?: boolean;
        paymentTransactionId?: { toString(): string };
      }) => ({
        key: e.key,
        label: e.label,
        amount: e.amount,
        source: (e.source as "AUTO" | "MANUAL") ?? "MANUAL",
        kind: (e.kind as AllocationEnvelope["kind"]) ?? "OTHER",
        linkedDebtId: e.linkedDebtId?.toString(),
        linkedAccountId: e.linkedAccountId?.toString(),
        linkedFixedCostId: e.linkedFixedCostId?.toString(),
        paid: Boolean(e.paid),
        paymentTransactionId: e.paymentTransactionId?.toString(),
      })
    );

    const savedByKey = new Map<string, AllocationEnvelope>(
      savedMapped.map((e: AllocationEnvelope) => [e.key, e])
    );
    // Keep debts/buffer/fun/goals from saved; always refresh FIXED per-item list.
    const nonFixedSaved = savedMapped.filter(
      (e: AllocationEnvelope) => e.kind !== "FIXED" && e.key !== "fixed:all"
    );
    const freshFixed = envelopes
      .filter((e) => e.kind === "FIXED")
      .map((e) => {
        const saved = savedByKey.get(e.key);
        return {
          ...e,
          paid: Boolean(e.paid) || Boolean(saved?.paid),
          paymentTransactionId:
            saved?.paymentTransactionId ?? e.paymentTransactionId,
          amount: saved?.amount ?? e.amount,
        };
      });

    const mergedNonFixed = [...nonFixedSaved];
    for (const e of envelopes) {
      if (e.kind === "FIXED") continue;
      if (!savedByKey.has(e.key)) {
        mergedNonFixed.push(e);
      }
    }

    finalEnvelopes = [...mergedNonFixed, ...freshFixed];
  }

  const allocated = finalEnvelopes.reduce((s, e) => s + e.amount, 0);
  const totalInFinal = salary + startingCash;

  return {
    cycle: {
      start: cycle.start.toISOString(),
      end: cycle.end.toISOString(),
      paydayDay: cycle.paydayDay,
      label: cycle.label,
    },
    currency,
    salary,
    baseSalary,
    startingCash,
    suggestedStartingCash,
    totalIn: totalInFinal,
    envelopes: finalEnvelopes,
    allocated,
    remaining: totalInFinal - allocated,
    configured: baseSalary > 0 || salary > 0,
    existingId: existing?._id?.toString() ?? null,
    existingStatus:
      (existing?.status as PaydayAllocationSuggestion["existingStatus"]) ??
      null,
  };
}
