import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { SavingsGoal } from "@/models/SavingsGoal";
import { User } from "@/models/User";
import { isLiabilityAccount } from "@/lib/financial/balances";
import { getCreditCardsForUser } from "@/lib/financial/credit-cards";
import { getDebtsDueInRange } from "@/lib/financial/debts-due";
import { getFixedCostsInRange } from "@/lib/financial/fixed-costs";
import { getFixedCostPaidIdsInCycle } from "@/lib/financial/record-fixed-cost-payment";
import {
  resolveAllocationDebtWindow,
  resolvePaydayTargetCycle,
  type PaydayCycleTarget,
} from "@/lib/financial/pay-cycle";
import {
  buildPaydayLeftoverEnvelopes,
  countsAgainstCashTotal,
  resolvePaydayLeftoverCash,
  sumCashAllocated,
  type LeftoverEnvelope,
} from "@/lib/financial/payday-leftover";
import {
  filterGoalsWithGap,
  pickPriorityGoal,
} from "@/lib/financial/priority-goal";
import {
  assessPaydayCompleteness,
  type PaydayCompletenessResult,
} from "@/lib/financial/debt-crush-plan";
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
  /** Which cycle is being edited (current running vs upcoming paycheck). */
  target: PaydayCycleTarget;
  currentCycle: { start: string; end: string; label: string };
  nextCycle: { start: string; end: string; label: string };
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
  /** Which savings pocket to fill first (aligned with Financial Insights ladder). */
  goalAdvice: {
    goalId: string;
    goalName: string;
    reason: string;
    suggestedAmount: number;
  } | null;
  /** Raw saved envelopes vs auto obligations (P0 completeness). */
  completeness: PaydayCompletenessResult;
};

/**
 * Build a suggested payday envelope split for a pay cycle.
 * Mid-cycle defaults to the upcoming paycheck so you can prepare next period.
 * CC statement due is taken from CREDIT_CARD accounts (not double-counted
 * via linked CREDIT_STATEMENT debts).
 */
export async function suggestPaydayAllocation(
  userId: string,
  now: Date = new Date(),
  options: {
    ignoreSaved?: boolean;
    target?: PaydayCycleTarget | "auto";
  } = {}
): Promise<PaydayAllocationSuggestion> {
  const user = await User.findById(userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const baseSalary = user?.monthlySalary ?? 0;
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const resolved = resolvePaydayTargetCycle(
    paydayDay,
    now,
    options.target ?? "auto"
  );
  const cycle = resolved.cycle;
  const debtWindow = resolveAllocationDebtWindow(cycle);

  const [
    accounts,
    cards,
    debtsDue,
    fixedCosts,
    paidFixedIds,
    existing,
    ccDebts,
    activeGoals,
  ] = await Promise.all([
    Account.find({ userId, isActive: true }).lean(),
    getCreditCardsForUser(userId),
    getDebtsDueInRange(userId, debtWindow.start, debtWindow.end, currency),
    getFixedCostsInRange(userId, cycle.start, cycle.end, currency),
    getFixedCostPaidIdsInCycle(userId, cycle.start, cycle.end),
    PaydayAllocation.findOne({
      userId,
      cycleStart: cycle.start,
    }).lean(),
    Debt.find({
      userId,
      status: "ACTIVE",
      linkedAccountId: { $ne: null },
    })
      .select({ _id: 1, linkedAccountId: 1 })
      .lean(),
    SavingsGoal.find({ userId, status: "ACTIVE" })
      .select({ name: 1, currentAmount: 1, targetAmount: 1, goalType: 1 })
      .lean(),
  ]);

  const spendableCash = accounts.reduce((sum, account) => {
    if (isLiabilityAccount(account.type as AccountType)) return sum;
    if (/fixed/i.test(account.name ?? "")) return sum;
    return sum + Math.max(0, account.currentBalance ?? 0);
  }, 0);

  /** All active goals that still have a gap — including system Basic tabungan. */
  const pocketGoals = filterGoalsWithGap(activeGoals);
  const priority = pickPriorityGoal(pocketGoals);

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

  // Map CC account → linked debt so Payday settle can record a real payment.
  const debtIdByCcAccount = new Map<string, string>();
  for (const debt of ccDebts) {
    const cardId = debt.linkedAccountId?.toString();
    if (cardId && linkedCcAccountIds.has(cardId) && !debtIdByCcAccount.has(cardId)) {
      debtIdByCcAccount.set(cardId, debt._id.toString());
    }
  }

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
      linkedDebtId: debtIdByCcAccount.get(card.accountId),
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

  function isLeftoverKind(kind: AllocationEnvelope["kind"]) {
    return (
      kind === "CASH_BUFFER" ||
      kind === "CC_SPEND_CAP" ||
      kind === "LIVING" ||
      kind === "GOALS" ||
      kind === "OTHER"
    );
  }

  /** Plafon belanja CC: only cards marked "pakai seperti debit". */
  const ccSpendCap = cards
    .filter((c) => c.debitMode)
    .reduce((sum, c) => sum + Math.max(0, c.available), 0);

  /**
   * Split cash left after debts/CC/fixed:
   * goals → physical wallet → debit/QRIS. CC plafon is planning-only.
   */
  function buildLeftoverEnvelopes(
    obligatedAmount: number,
    manualLeftovers: AllocationEnvelope[] = []
  ): AllocationEnvelope[] {
    const manualSum = manualLeftovers.reduce(
      (s, e) => s + (countsAgainstCashTotal(e.kind) ? e.amount : 0),
      0
    );
    // Next-payday prep: allocate the full planned leftover from gaji.
    // Current period: still cap by real bank/cash on hand.
    const leftoverCash = resolvePaydayLeftoverCash({
      totalIn,
      obligatedAmount,
      manualLeftoverSum: manualSum,
      spendableCash,
      planningAhead: resolved.target === "next",
    });

    const priorityGoal = priority?.goal
      ? {
          id: priority.goal._id.toString(),
          name: priority.goal.name,
          targetAmount: priority.goal.targetAmount ?? 0,
          currentAmount: priority.goal.currentAmount ?? 0,
        }
      : null;

    const built = buildPaydayLeftoverEnvelopes({
      leftoverCash,
      currency,
      priorityGoal,
      ccSpendCap,
      manualLeftovers: manualLeftovers as LeftoverEnvelope[],
    });

    return built.map((e) => ({
      ...e,
      kind: e.kind as AllocationEnvelope["kind"],
    }));
  }

  const obligatedFresh = envelopes.reduce((s, e) => s + e.amount, 0);
  envelopes.push(...buildLeftoverEnvelopes(obligatedFresh));

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

    // Keep obligated envelopes from saved; always refresh FIXED per-item list.
    // Leftover pockets (buffer / CC cap / living) are rebuilt below so paid
    // debts don't get double-counted with a fresh leftover split.
    const obligatedSaved = savedMapped.filter(
      (e: AllocationEnvelope) =>
        e.kind !== "FIXED" &&
        e.key !== "fixed:all" &&
        !isLeftoverKind(e.kind)
    );
    const manualLeftovers = savedMapped.filter(
      (e: AllocationEnvelope) =>
        isLeftoverKind(e.kind) && e.source === "MANUAL"
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

    const freshByKey = new Map(
      envelopes.map((e): [string, AllocationEnvelope] => [e.key, e])
    );
    const mergedObligated: AllocationEnvelope[] = obligatedSaved.map(
      (saved: AllocationEnvelope) => {
        const fresh = freshByKey.get(saved.key);
        // Keep unpaid AUTO debt/CC amounts in sync with Dashboard dues.
        if (
          fresh &&
          (saved.kind === "CC_STATEMENT" || saved.kind === "DEBT") &&
          saved.source === "AUTO" &&
          !saved.paid
        ) {
          return {
            ...saved,
            amount: fresh.amount,
            linkedDebtId: saved.linkedDebtId ?? fresh.linkedDebtId,
            linkedAccountId: saved.linkedAccountId ?? fresh.linkedAccountId,
            paid: Boolean(fresh.paid),
            paymentTransactionId:
              saved.paymentTransactionId ?? fresh.paymentTransactionId,
          };
        }
        // Backfill CC links from fresh suggestion (older saves lacked linkedDebtId).
        if (saved.kind === "CC_STATEMENT" && fresh) {
          return {
            ...saved,
            linkedDebtId: saved.linkedDebtId ?? fresh.linkedDebtId,
            linkedAccountId: saved.linkedAccountId ?? fresh.linkedAccountId,
            paid: Boolean(saved.paid) || Boolean(fresh.paid),
            paymentTransactionId:
              saved.paymentTransactionId ?? fresh.paymentTransactionId,
          };
        }
        return saved;
      }
    );
    for (const e of envelopes) {
      if (e.kind === "FIXED" || isLeftoverKind(e.kind)) continue;
      if (!savedByKey.has(e.key)) {
        mergedObligated.push(e);
      }
    }

    const obligatedAmount = [...mergedObligated, ...freshFixed].reduce(
      (s, e) => s + e.amount,
      0
    );
    finalEnvelopes = [
      ...mergedObligated,
      ...freshFixed,
      ...buildLeftoverEnvelopes(obligatedAmount, manualLeftovers),
    ];
  }

  const allocated = sumCashAllocated(finalEnvelopes);
  const totalInFinal = salary + startingCash;
  const goalsEnvelope = finalEnvelopes.find((e) => e.kind === "GOALS");

  const completeness = assessPaydayCompleteness({
    salary: existing?.salary ?? salary,
    startingCash: existing?.startingCash ?? startingCash,
    expected: envelopes.map((e) => ({
      key: e.key,
      label: e.label,
      amount: e.amount,
      kind: e.kind,
    })),
    saved: (existing?.envelopes ?? []).map(
      (e: { key: string; label: string; amount: number; kind?: string }) => ({
        key: e.key,
        label: e.label,
        amount: e.amount,
        kind: e.kind ?? "OTHER",
      })
    ),
  });

  return {
    cycle: {
      start: cycle.start.toISOString(),
      end: cycle.end.toISOString(),
      paydayDay: cycle.paydayDay,
      label: cycle.label,
    },
    target: resolved.target,
    currentCycle: {
      start: resolved.currentCycle.start.toISOString(),
      end: resolved.currentCycle.end.toISOString(),
      label: resolved.currentCycle.label,
    },
    nextCycle: {
      start: resolved.nextCycle.start.toISOString(),
      end: resolved.nextCycle.end.toISOString(),
      label: resolved.nextCycle.label,
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
    goalAdvice:
      priority && goalsEnvelope && goalsEnvelope.amount > 0
        ? {
            goalId: priority.goal._id.toString(),
            goalName: priority.goal.name,
            reason: priority.reason,
            suggestedAmount: goalsEnvelope.amount,
          }
        : null,
    completeness,
  };
}
