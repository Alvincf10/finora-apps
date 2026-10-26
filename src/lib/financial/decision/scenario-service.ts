import { Debt } from "@/models/Debt";
import { Scenario } from "@/models/Scenario";
import { SavingsGoal } from "@/models/SavingsGoal";
import { getFinancialSummary } from "@/lib/financial/summary";
import { getFinancialProfile } from "@/lib/financial/phase2-service";
import { resolvePeriodBounds, type Period } from "@/lib/financial/summary";
import {
  compareScenarioEvaluations,
  evaluateDecisionScenario,
} from "@/lib/financial/decision/scenario-engine";
import {
  DECISION_LAB_RULES_VERSION,
  type ScenarioAssumptions,
  type ScenarioBaselineSnapshot,
} from "@/lib/financial/decision/types";
import type { Currency } from "@/types";

export async function captureScenarioBaseline(
  userId: string,
  period: Period
): Promise<ScenarioBaselineSnapshot> {
  const [summary, profile, debts, emergencyGoals, bounds] = await Promise.all([
    getFinancialSummary(userId, period),
    getFinancialProfile(userId, period),
    Debt.find({ userId, status: "ACTIVE" }).lean(),
    SavingsGoal.find({
      userId,
      status: { $in: ["ACTIVE", "COMPLETED"] },
      goalType: "EMERGENCY_FUND",
    }).lean(),
    resolvePeriodBounds(userId, period),
  ]);

  const currency = summary.currency as Currency;
  const scopedDebts = debts.filter((d) => d.currency === currency);
  const totalDebt = scopedDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const interest =
    scopedDebts.length === 1 ? (scopedDebts[0].interestRate ?? null) : null;

  const emergencyFund = emergencyGoals
    .filter((g) => g.currency === currency)
    .reduce((sum, g) => sum + (g.currentAmount ?? 0), 0);

  const essentialMonthly =
    profile.averageFixedExpense > 0
      ? profile.averageFixedExpense
      : profile.averageMonthlyExpense > 0
        ? profile.averageMonthlyExpense
        : null;

  return {
    capturedAt: new Date().toISOString(),
    period,
    cycleLabel: bounds.label,
    currency,
    income: summary.income,
    expenses: summary.expense,
    debtPayment: summary.debtPayment,
    savings: summary.savings,
    debtBalance: totalDebt,
    debtInterestRate: interest,
    startingBalance: summary.liquidAssets,
    liquidAssets: summary.liquidAssets,
    netWorth: summary.netWorth,
    essentialMonthly,
    emergencyFund,
    rulesVersion: DECISION_LAB_RULES_VERSION,
  };
}

export async function createScenario(input: {
  userId: string;
  period: Period;
  name: string;
  assumptions?: ScenarioAssumptions;
  notes?: string;
  /** Reuse an existing snapshot instead of re-capturing live data. */
  baselineSnapshot?: ScenarioBaselineSnapshot;
}) {
  const baseline =
    input.baselineSnapshot ??
    (await captureScenarioBaseline(input.userId, input.period));
  const assumptions = sanitizeAssumptions(input.assumptions ?? {});
  const results = evaluateDecisionScenario(baseline, assumptions);

  const doc = await Scenario.create({
    userId: input.userId,
    name: input.name.trim() || "Untitled scenario",
    currency: baseline.currency,
    baselineSnapshot: baseline,
    assumptions,
    results,
    notes: input.notes,
    rulesVersion: DECISION_LAB_RULES_VERSION,
  });

  return serializeScenario(doc);
}

export async function listScenarios(userId: string, limit = 20) {
  const docs = await Scenario.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(50, Math.max(1, limit)))
    .lean();
  return docs.map(serializeScenario);
}

export async function getScenario(userId: string, id: string) {
  const doc = await Scenario.findOne({ _id: id, userId }).lean();
  if (!doc) return null;
  return serializeScenario(doc);
}

export async function updateScenarioAssumptions(
  userId: string,
  id: string,
  assumptions: ScenarioAssumptions,
  name?: string
) {
  const doc = await Scenario.findOne({ _id: id, userId });
  if (!doc) return null;

  const baseline = doc.baselineSnapshot as ScenarioBaselineSnapshot;
  const next = sanitizeAssumptions(assumptions);
  doc.assumptions = next;
  doc.results = evaluateDecisionScenario(baseline, next);
  if (name != null && name.trim()) doc.name = name.trim();
  await doc.save();
  return serializeScenario(doc);
}

export async function deleteScenario(userId: string, id: string) {
  const res = await Scenario.deleteOne({ _id: id, userId });
  return res.deletedCount === 1;
}

export async function compareUserScenarios(
  userId: string,
  scenarioIds: string[]
) {
  const unique = [...new Set(scenarioIds)].slice(0, 5);
  const docs = await Scenario.find({
    userId,
    _id: { $in: unique },
  }).lean();

  if (docs.length === 0) {
    return compareScenarioEvaluations([]);
  }

  // Use the first scenario's snapshot as shared baseline row
  const primary = docs[0];
  const baseline = primary.baselineSnapshot as ScenarioBaselineSnapshot;
  const baselineEval = evaluateDecisionScenario(baseline, {});

  const rows = [
    {
      id: `baseline:${primary._id.toString()}`,
      name: "Baseline (snapshot)",
      isBaseline: true,
      evaluation: baselineEval,
    },
    ...docs.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      isBaseline: false,
      evaluation: evaluateDecisionScenario(
        d.baselineSnapshot as ScenarioBaselineSnapshot,
        sanitizeAssumptions(d.assumptions as ScenarioAssumptions)
      ),
    })),
  ];

  return {
    ...compareScenarioEvaluations(rows),
    currency: baseline.currency,
    snapshotCapturedAt: baseline.capturedAt,
    warning:
      docs.length > 1 &&
      docs.some(
        (d) =>
          (d.baselineSnapshot as ScenarioBaselineSnapshot).capturedAt !==
          baseline.capturedAt
      )
        ? "Compared scenarios use different baseline snapshots — deltas are not fully aligned."
        : null,
  };
}

function sanitizeAssumptions(a: ScenarioAssumptions): ScenarioAssumptions {
  const out: ScenarioAssumptions = {};
  if (a.incomeOverride != null) {
    if (a.incomeOverride < 0) throw new Error("VALIDATION");
    out.incomeOverride = Math.floor(a.incomeOverride);
  }
  if (a.expensesOverride != null) {
    if (a.expensesOverride < 0) throw new Error("VALIDATION");
    out.expensesOverride = Math.floor(a.expensesOverride);
  }
  if (a.debtPaymentOverride != null) {
    if (a.debtPaymentOverride < 0) throw new Error("VALIDATION");
    out.debtPaymentOverride = Math.floor(a.debtPaymentOverride);
  }
  if (a.savingsOverride != null) {
    out.savingsOverride = Math.floor(a.savingsOverride);
  }
  if (a.cashBufferOverride != null) {
    if (a.cashBufferOverride < 0) throw new Error("VALIDATION");
    out.cashBufferOverride = Math.floor(a.cashBufferOverride);
  }
  return out;
}

function serializeScenario(doc: {
  _id: { toString(): string };
  name: string;
  currency: string;
  baselineSnapshot: unknown;
  assumptions: unknown;
  results: unknown;
  notes?: string | null;
  rulesVersion: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    currency: doc.currency,
    baselineSnapshot: doc.baselineSnapshot,
    assumptions: doc.assumptions,
    results: doc.results,
    notes: doc.notes ?? null,
    rulesVersion: doc.rulesVersion,
    createdAt: doc.createdAt?.toISOString?.() ?? null,
    updatedAt: doc.updatedAt?.toISOString?.() ?? null,
  };
}
