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
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import {
  EMERGENCY_PATTERNS,
  LADDER_STARTER_GOAL_NAME,
  nameMatches,
} from "@/lib/financial/wealth-ladder-math";
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
  /** Which savings pocket to fill first (aligned with Financial Insights ladder). */
  goalAdvice: {
    goalId: string;
    goalName: string;
    reason: string;
    suggestedAmount: number;
  } | null;
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
    getDebtsDueInRange(userId, cycle.start, cycle.end, currency),
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
  const pocketGoals = activeGoals.filter((g) => {
    const gap = Math.max(0, (g.targetAmount ?? 0) - (g.currentAmount ?? 0));
    return gap > 0;
  });

  function pickPriorityGoal() {
    if (pocketGoals.length === 0) return null;

    // Tangga Ternak Uang step 1: Basic tabungan / nabung cash 10jt first.
    const basic = pocketGoals.find(
      (g) =>
        (g as { goalType?: string }).goalType === "BASIC_SAVINGS" ||
        g.name === LADDER_STARTER_GOAL_NAME
    );
    if (basic) {
      return {
        goal: basic,
        reason:
          "Tangga Ternak Uang step 1: isi Basic tabungan (nabung cash 10jt) dulu sebelum goal lain.",
      };
    }

    // Step 3-ish: emergency fund after starter + small debts.
    const emergency = pocketGoals.find(
      (g) =>
        (g as { goalType?: string }).goalType === "EMERGENCY_FUND" ||
        nameMatches(g.name, EMERGENCY_PATTERNS)
    );
    if (emergency) {
      return {
        goal: emergency,
        reason:
          "Basic tabungan sudah cukup — lanjut isi dana darurat (Tangga Ternak Uang).",
      };
    }

    const sorted = [...pocketGoals].sort((a, b) => {
      const gapA = Math.max(0, (a.targetAmount ?? 0) - (a.currentAmount ?? 0));
      const gapB = Math.max(0, (b.targetAmount ?? 0) - (b.currentAmount ?? 0));
      return gapA - gapB;
    });
    const nearest = sorted[0];
    return {
      goal: nearest,
      reason: `Sisa target paling kecil — selesaikan “${nearest.name}” dulu sebelum goal lain.`,
    };
  }

  const priority = pickPriorityGoal();

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

  /**
   * Split cash left after debts/CC/fixed for the user's real pockets:
   * goals (tabungan) → pegangan tunai → foya/hepi.
   * CC spend uses the card limit separately — not taken from this cash leftover.
   */
  function buildLeftoverEnvelopes(
    obligatedAmount: number,
    manualLeftovers: AllocationEnvelope[] = []
  ): AllocationEnvelope[] {
    const manualSum = manualLeftovers.reduce((s, e) => s + e.amount, 0);
    // Cap by real spendable bank cash (ex Fixed) so saran = dashboard, not inflated plan.
    let leftover = Math.max(0, totalIn - obligatedAmount - manualSum);
    leftover = Math.min(leftover, Math.max(0, spendableCash));

    const priorityGoal = priority?.goal ?? null;
    const priorityGap = priorityGoal
      ? Math.max(
          0,
          (priorityGoal.targetAmount ?? 0) - (priorityGoal.currentAmount ?? 0)
        )
      : 0;

    // Goals first: ~25% of clean spendable (toward the Insights-priority pocket).
    const goalsTarget = priorityGoal
      ? roundMoney(
          Math.min(
            leftover * 0.25,
            priorityGap > 0 ? priorityGap : leftover * 0.25
          )
        )
      : 0;
    leftover -= goalsTarget;

    // Physical cash buffer next: ~30% of what remains (floor ~300k IDR if possible).
    let bufferTarget = roundMoney(leftover * 0.3);
    if (currency === "IDR" && leftover >= 300_000) {
      bufferTarget = Math.max(bufferTarget, 300_000);
    }
    bufferTarget = Math.min(leftover, bufferTarget);
    leftover -= bufferTarget;

    // Rest = foya / living cash.
    const living = Math.max(0, leftover);

    const goalsLabel = priorityGoal
      ? `Tabungan · ${priorityGoal.name}`
      : "Tabungan goals";

    const auto: AllocationEnvelope[] = [];
    if (goalsTarget > 0) {
      auto.push({
        key: priorityGoal
          ? `goals:${priorityGoal._id.toString()}`
          : "goals",
        label: goalsLabel,
        amount: goalsTarget,
        source: "AUTO",
        kind: "GOALS",
      });
    }
    if (bufferTarget > 0) {
      auto.push({
        key: "cash_buffer",
        label: "Cash pegangan (tarik tunai)",
        amount: bufferTarget,
        source: "AUTO",
        kind: "CASH_BUFFER",
      });
    }
    if (living > 0) {
      auto.push({
        key: "living",
        label: "Foya / hepi (cash)",
        amount: living,
        source: "AUTO",
        kind: "LIVING",
      });
    }
    return [...manualLeftovers, ...auto];
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
        // Backfill CC links from fresh suggestion (older saves lacked linkedDebtId).
        if (saved.kind === "CC_STATEMENT") {
          const fresh = freshByKey.get(saved.key);
          if (fresh) {
            return {
              ...saved,
              linkedDebtId: saved.linkedDebtId ?? fresh.linkedDebtId,
              linkedAccountId: saved.linkedAccountId ?? fresh.linkedAccountId,
              paid: Boolean(saved.paid) || Boolean(fresh.paid),
              paymentTransactionId:
                saved.paymentTransactionId ?? fresh.paymentTransactionId,
            };
          }
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

  const allocated = finalEnvelopes.reduce((s, e) => s + e.amount, 0);
  const totalInFinal = salary + startingCash;
  const goalsEnvelope = finalEnvelopes.find((e) => e.kind === "GOALS");

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
    goalAdvice:
      priority && goalsEnvelope && goalsEnvelope.amount > 0
        ? {
            goalId: priority.goal._id.toString(),
            goalName: priority.goal.name,
            reason: priority.reason,
            suggestedAmount: goalsEnvelope.amount,
          }
        : null,
  };
}
