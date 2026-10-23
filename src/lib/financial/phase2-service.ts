import mongoose from "mongoose";
import { Transaction } from "@/models/Transaction";
import { Category } from "@/models/Category";
import { Debt } from "@/models/Debt";
import { Budget } from "@/models/Budget";
import { Account } from "@/models/Account";
import { SavingsGoal } from "@/models/SavingsGoal";
import { FinancialRecommendation } from "@/models/FinancialRecommendation";
import {
  buildInsightFromTrend,
  calculateDebtScenario,
  calculateEmergencyCoverage,
  defaultClassification,
  defaultNature,
  detectAnomaly,
  detectSpendingTrend,
  forecastMonthlyCashflow,
  generateBudgetRecommendation,
  mean,
  projectCategorySpend,
  runWhatIf,
  weightedAverage3,
} from "@/lib/financial/phase2-math";
import { getBudgetOverview, getFinancialSummary } from "@/lib/financial/summary";
import {
  getPlanningBaselines,
  resolveExpectedIncome,
} from "@/lib/financial/planning-baselines";
import {
  getCycleProgress,
  getPayCycleForPeriod,
  getUserPaydayDay,
  periodFromDate,
  shiftPeriodRef,
} from "@/lib/financial/pay-cycle";
import { formatMoney, percent } from "@/lib/money";
import type {
  CategoryMonthlySpend,
  ExpenseClass,
  ExpenseNature,
  InsightRecommendation,
  Period,
  WhatIfInput,
} from "@/lib/financial/phase2-types";
import type { Currency } from "@/types";

const TARGET_EMERGENCY_MONTHS = 3;
const INCOME_CHANGE_THRESHOLD = 15;
const DEBT_BURDEN_WARNING = 30;
const DEBT_BURDEN_CRITICAL = 40;

function periodKey(p: Period) {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function shiftPeriod(period: Period, monthsBack: number): Period {
  return shiftPeriodRef(period, monthsBack);
}

function completedHistoryPeriods(current: Period, count: number): Period[] {
  const periods: Period[] = [];
  for (let i = 1; i <= count; i++) {
    periods.push(shiftPeriod(current, i));
  }
  return periods.reverse(); // oldest → newest
}

export async function aggregateCategoryMonthly(
  userId: string,
  periods: Period[],
  currency?: Currency
) {
  const results: Array<{
    period: Period;
    byCategory: Map<string, number>;
    income: number;
    expense: number;
  }> = [];

  const paydayDay = await getUserPaydayDay(userId);

  for (const period of periods) {
    const cycle = getPayCycleForPeriod(paydayDay, period);
    const match: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      date: { $gte: cycle.start, $lte: cycle.end },
      type: { $in: ["INCOME", "EXPENSE"] },
    };
    if (currency) match.currency = currency;

    const rows = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { type: "$type", categoryId: "$categoryId" },
          total: { $sum: "$amount" },
        },
      },
    ]);

    const byCategory = new Map<string, number>();
    let income = 0;
    let expense = 0;
    for (const row of rows) {
      if (row._id.type === "INCOME") {
        income += row.total;
      } else {
        expense += row.total;
        const cid = row._id.categoryId?.toString() ?? "uncategorized";
        byCategory.set(cid, (byCategory.get(cid) ?? 0) + row.total);
      }
    }
    results.push({ period, byCategory, income, expense });
  }

  return results;
}

async function resolveCategories(userId: string) {
  const categories = await Category.find({
    userId,
    type: "EXPENSE",
    isActive: true,
  }).lean();

  return categories.map((c) => {
    const name = c.name;
    const classification =
      (c.classification as ExpenseClass) ||
      defaultClassification(name);
    const nature =
      (c.nature as ExpenseNature) ||
      defaultNature(name, classification);
    return {
      id: c._id.toString(),
      name,
      classification,
      nature,
    };
  });
}

export async function buildCategorySpendingSeries(
  userId: string,
  current: Period,
  historyMonths = 3
) {
  const history = completedHistoryPeriods(current, historyMonths);
  const allPeriods = [...history, current];
  const aggregates = await aggregateCategoryMonthly(userId, allPeriods);
  const categories = await resolveCategories(userId);
  const currentAgg = aggregates[aggregates.length - 1];
  const historyAggs = aggregates.slice(0, -1);

  // Prefer user's most common currency among accounts
  const account = await Account.findOne({ userId, isActive: true }).lean();
  const currency = (account?.currency as Currency) ?? "IDR";

  const series: CategoryMonthlySpend[] = categories.map((cat) => {
    const amounts = historyAggs.map((a) => a.byCategory.get(cat.id) ?? 0);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      amounts,
      currentAmount: currentAgg.byCategory.get(cat.id) ?? 0,
      currency,
      classification: cat.classification,
      nature: cat.nature,
    };
  });

  const incomeHistory = historyAggs.map((a) => a.income);
  const expenseHistory = historyAggs.map((a) => a.expense);

  return {
    currency,
    series: series.filter(
      (s) => s.currentAmount > 0 || s.amounts.some((a) => a > 0)
    ),
    incomeHistory,
    expenseHistory,
    currentIncome: currentAgg.income,
    currentExpense: currentAgg.expense,
    historicalMonthsAvailable: historyAggs.filter(
      (a) => a.income > 0 || a.expense > 0
    ).length,
  };
}

export async function getFinancialProfile(userId: string, current: Period) {
  const data = await buildCategorySpendingSeries(userId, current, 3);
  const avgIncome = Math.round(mean(data.incomeHistory));
  const avgExpense = Math.round(mean(data.expenseHistory));
  const avgSavings = avgIncome - avgExpense;

  const fixed = data.series
    .filter((s) => s.nature === "FIXED")
    .reduce((sum, s) => sum + mean(s.amounts), 0);
  const variable = data.series
    .filter((s) => s.nature === "VARIABLE")
    .reduce((sum, s) => sum + mean(s.amounts), 0);

  const debts = await Debt.find({ userId, status: "ACTIVE" }).lean();
  const avgDebtPayment = debts.reduce(
    (sum, d) => sum + (d.plannedPayment ?? d.minimumPayment ?? 0),
    0
  );

  const topExpenseCategories = [...data.series]
    .map((s) => ({
      categoryId: s.categoryId,
      name: s.categoryName,
      average: Math.round(mean(s.amounts)),
    }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 5);

  const recurringExpenses = data.series
    .filter((s) => s.nature === "FIXED" || s.amounts.filter((a) => a > 0).length >= 2)
    .map((s) => ({
      categoryId: s.categoryId,
      name: s.categoryName,
      average: Math.round(mean(s.amounts.filter((a) => a > 0))),
    }));

  const incomeStability =
    data.incomeHistory.length >= 2 &&
    stdStable(data.incomeHistory);
  const expenseStability =
    data.expenseHistory.length >= 2 &&
    stdStable(data.expenseHistory);

  return {
    userId,
    period: current,
    averageMonthlyIncome: avgIncome,
    averageMonthlyExpense: avgExpense,
    averageMonthlySavings: avgSavings,
    averageFixedExpense: Math.round(fixed),
    averageVariableExpense: Math.round(variable),
    averageDebtPayment: avgDebtPayment,
    averageSavingsRate: percent(avgSavings, avgIncome),
    incomeStability: incomeStability ? "STABLE" : "VOLATILE",
    expenseStability: expenseStability ? "STABLE" : "VOLATILE",
    topExpenseCategories,
    recurringExpenses,
    currency: data.currency,
    createdAt: new Date().toISOString(),
  };
}

function stdStable(values: number[]): boolean {
  const m = mean(values);
  if (m === 0) return true;
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / m <= 0.15;
}

export async function getSpendingAnalytics(
  userId: string,
  current: Period,
  historyMonths = 6
) {
  const months = Math.min(Math.max(historyMonths, 3), 12);
  const data = await buildCategorySpendingSeries(userId, current, months);
  const paydayDay = await getUserPaydayDay(userId);
  const cycle = getPayCycleForPeriod(paydayDay, current);
  const { elapsedDays, totalDays } = getCycleProgress(cycle, new Date());

  return data.series.map((s) => {
    const trend = detectSpendingTrend(s.currentAmount, s.amounts);
    const anomaly = detectAnomaly(s.currentAmount, s.amounts);
    const projected = projectCategorySpend(
      s.currentAmount,
      elapsedDays,
      totalDays
    );
    return {
      categoryId: s.categoryId,
      categoryName: s.categoryName,
      currentAmount: s.currentAmount,
      previousAmount: s.amounts[s.amounts.length - 1] ?? 0,
      average3m: Math.round(mean(s.amounts.slice(-3))),
      average6m: Math.round(mean(s.amounts)),
      percentageChange: trend.percentageChange,
      trend: trend.trend,
      confidence: trend.confidence,
      projectedMonthly: projected,
      anomaly: anomaly.isAnomaly
        ? { threshold: anomaly.threshold, reason: anomaly.reason }
        : null,
      classification: s.classification,
      nature: s.nature,
      currency: s.currency,
    };
  });
}

export async function getSmartBudgetRecommendation(
  userId: string,
  current: Period
) {
  const data = await buildCategorySpendingSeries(userId, current, 3);
  const profile = await getFinancialProfile(userId, current);
  const goals = await SavingsGoal.find({ userId, status: "ACTIVE" }).lean();
  const baselines = await getPlanningBaselines(userId, current);

  const historyIncome = Math.round(
    weightedAverage3([...data.incomeHistory].reverse())
  );
  const expectedIncome = resolveExpectedIncome(
    baselines,
    historyIncome,
    data.currentIncome
  );

  const fallbackDebt = (
    await Debt.find({ userId, status: "ACTIVE" }).lean()
  ).reduce((sum, d) => sum + (d.minimumPayment ?? d.plannedPayment ?? 0), 0);
  const minimumDebtPayment =
    baselines.debtDueTotal > 0 ? baselines.debtDueTotal : fallbackDebt;

  // Goal-based monthly savings requirement (simple remaining / months left)
  let targetSavings = 0;
  for (const goal of goals) {
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    if (goal.targetDate) {
      const monthsLeft = Math.max(
        1,
        Math.ceil(
          (new Date(goal.targetDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24 * 30)
        )
      );
      targetSavings += Math.ceil(remaining / monthsLeft);
    } else {
      targetSavings += Math.ceil(remaining / 12);
    }
  }
  if (targetSavings === 0 && profile.averageMonthlySavings > 0) {
    targetSavings = profile.averageMonthlySavings;
  }

  return {
    ...generateBudgetRecommendation({
      year: current.year,
      month: current.month,
      currency: data.currency,
      expectedIncome,
      categories: data.series,
      minimumDebtPayment,
      fixedObligations: baselines.fixedCostsTotal,
      incomeSource: baselines.incomeSource,
      targetSavings,
      historicalMonthsAvailable: data.historicalMonthsAvailable,
    }),
    cycleLabel: baselines.cycleLabel,
    periodStart: baselines.periodStart,
    periodEnd: baselines.periodEnd,
  };
}

export async function acceptBudgetRecommendation(
  userId: string,
  period: Period,
  categories: Array<{ categoryId: string; amount: number }>,
  currency: Currency
) {
  const ops = categories.map((c) =>
    Budget.findOneAndUpdate(
      {
        userId,
        year: period.year,
        month: period.month,
        categoryId: c.categoryId,
      },
      {
        $set: {
          amount: c.amount,
          currency,
        },
      },
      { upsert: true, new: true }
    )
  );
  return Promise.all(ops);
}

export async function generatePhase2Insights(
  userId: string,
  period: Period
): Promise<InsightRecommendation[]> {
  const insights: InsightRecommendation[] = [];
  const [analytics, budgets, summary, profile, debts, goals] =
    await Promise.all([
      getSpendingAnalytics(userId, period),
      getBudgetOverview(userId, period),
      getFinancialSummary(userId, period),
      getFinancialProfile(userId, period),
      Debt.find({ userId, status: "ACTIVE" }).lean(),
      SavingsGoal.find({ userId, status: "ACTIVE" }).lean(),
    ]);
  const currency = summary.currency ?? profile.currency;
  const now = new Date();
  const paydayDay = await getUserPaydayDay(userId);
  const cycle = getPayCycleForPeriod(paydayDay, period);
  const { elapsedDays, totalDays } = getCycleProgress(cycle, now);
  const elapsed = elapsedDays;
  const dim = totalDays;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const row of analytics) {
    const trendInsight = buildInsightFromTrend(
      row.categoryId,
      row.categoryName,
      row.currentAmount,
      row.average3m,
      row.percentageChange,
      period
    );
    if (trendInsight) insights.push(trendInsight);

    if (row.anomaly) {
      insights.push({
        type: "UNUSUAL_CATEGORY_SPENDING",
        priority: "HIGH",
        title: `Belanja ${row.categoryName} tidak wajar`,
        message: `${row.categoryName} cycle ini ${formatMoney(row.currentAmount, currency)} — di atas batas wajar ${formatMoney(row.anomaly.threshold, currency)} (rata-rata ${formatMoney(row.average3m, currency)}).`,
        categoryId: row.categoryId,
        currentValue: row.currentAmount,
        evidence: [
          {
            metric: "anomaly",
            current: row.currentAmount,
            average3m: row.average3m,
            threshold: row.anomaly.threshold,
          },
        ],
        actionType: "VIEW_SPENDING",
        period,
      });
    }
  }

  for (const b of budgets) {
    if (b.overBudget) {
      insights.push({
        type: "BUDGET_OVERFLOW",
        priority: "HIGH",
        title: `${b.categoryName} melebihi budget`,
        message: `Pengeluaran ${b.categoryName} sudah melewati budget ${formatMoney(b.budgetAmount, currency)}.`,
        categoryId: b.categoryId,
        currentValue: b.actualAmount,
        recommendedValue: b.budgetAmount,
        difference: b.actualAmount - b.budgetAmount,
        evidence: [
          {
            metric: "budget_utilization",
            current: b.actualAmount,
            budget: b.budgetAmount,
            changePercent: b.utilizationPercentage,
          },
        ],
        actionType: "VIEW_BUDGET_REC",
        period,
      });
    } else if (b.utilizationPercentage >= 80) {
      insights.push({
        type: "BUDGET_WARNING",
        priority: "MEDIUM",
        title: `Peringatan budget ${b.categoryName}`,
        message: `${b.categoryName} sudah memakai ${b.utilizationPercentage}% dari budget.`,
        categoryId: b.categoryId,
        currentValue: b.actualAmount,
        recommendedValue: b.budgetAmount,
        evidence: [
          {
            metric: "budget_utilization",
            current: b.actualAmount,
            budget: b.budgetAmount,
            changePercent: b.utilizationPercentage,
          },
        ],
        actionType: "VIEW_BUDGET_REC",
        period,
      });
    } else {
      const projected = projectCategorySpend(b.actualAmount, elapsed, dim);
      if (projected > b.budgetAmount) {
        const overBy = projected - b.budgetAmount;
        insights.push({
          type: "PROJECTED_BUDGET_OVERFLOW",
          priority: "HIGH",
          title: `Proyeksi ${b.categoryName} overflow`,
          message: `Dengan laju sekarang, ${b.categoryName} diproyeksikan ~${formatMoney(overBy, currency)} di atas budget di akhir bulan.`,
          categoryId: b.categoryId,
          currentValue: b.actualAmount,
          recommendedValue: b.budgetAmount,
          difference: overBy,
          evidence: [
            {
              metric: "projected_spend",
              current: b.actualAmount,
              projected,
              budget: b.budgetAmount,
            },
          ],
          actionType: "VIEW_BUDGET_REC",
          period,
        });
      }
    }
  }

  if (summary.savingsRate < 10 && summary.income > 0) {
    insights.push({
      type: "SAVINGS_TARGET_RISK",
      priority: "MEDIUM",
      title: "Rasio tabungan rendah",
      message: `Rasio tabungan cycle ini ${summary.savingsRate}% — di bawah ambang 10%.`,
      currentValue: summary.savings,
      evidence: [{ metric: "savings_rate", current: summary.savingsRate }],
      actionType: "SIMULATE",
      period,
    });
  }

  const spare = profile.averageMonthlyIncome - profile.averageMonthlyExpense - profile.averageDebtPayment;
  if (spare > 0) {
    insights.push({
      type: "SAVINGS_OPPORTUNITY",
      priority: "LOW",
      title: "Peluang menabung",
      message: `Arus kas rata-rata menyisakan kapasitas tabungan sekitar ${formatMoney(spare, currency)}.`,
      recommendedValue: spare,
      evidence: [
        {
          metric: "spare_capacity",
          current: spare,
          average3m: profile.averageMonthlySavings,
        },
      ],
      actionType: "SIMULATE",
      period,
    });
  }

  if (summary.netCashFlow < 0) {
    insights.push({
      type: "CASHFLOW_RISK",
      priority: "HIGH",
      title: "Arus kas negatif",
      message: "Pengeluaran melebihi pemasukan cycle ini.",
      currentValue: summary.netCashFlow,
      evidence: [
        {
          metric: "net_cash_flow",
          current: summary.netCashFlow,
          income: summary.income,
          expense: summary.expense,
        },
      ],
      actionType: "VIEW_BUDGET_REC",
      period,
    });
  }

  // —— Debt payment risk ——
  const incomeBase =
    summary.income > 0 ? summary.income : profile.averageMonthlyIncome;
  const totalDebtObligation = debts.reduce(
    (sum, d) => sum + (d.plannedPayment ?? d.minimumPayment ?? 0),
    0
  );

  for (const debt of debts) {
    const debtId = debt._id.toString();
    const obligation = debt.plannedPayment ?? debt.minimumPayment ?? 0;

    if (debt.dueDate && new Date(debt.dueDate) < todayStart) {
      insights.push({
        type: "DEBT_PAYMENT_RISK",
        priority: "HIGH",
        title: `Cicilan ${debt.name} terlambat`,
        message: `Tanggal jatuh tempo ${debt.name} sudah lewat dan hutang masih aktif.`,
        debtId,
        currentValue: debt.remainingAmount,
        evidence: [
          {
            metric: "debt_due_date",
            current: debt.remainingAmount,
            dueDate: debt.dueDate,
          },
        ],
        actionType: "VIEW_DEBT",
        period,
      });
    }

    if (debt.remainingAmount > 0 && obligation <= 0) {
      insights.push({
        type: "DEBT_PAYMENT_RISK",
        priority: "MEDIUM",
        title: `${debt.name} belum ada rencana cicilan`,
        message: `${debt.name} masih punya sisa saldonya, tapi minimum/rencana cicilan belum diisi.`,
        debtId,
        currentValue: debt.remainingAmount,
        evidence: [
          {
            metric: "debt_payment_missing",
            current: debt.remainingAmount,
          },
        ],
        actionType: "VIEW_DEBT",
        period,
      });
    }
  }

  if (incomeBase > 0 && totalDebtObligation > 0) {
    const burden = percent(totalDebtObligation, incomeBase);
    if (burden >= DEBT_BURDEN_WARNING) {
      insights.push({
        type: "DEBT_PAYMENT_RISK",
        priority: burden >= DEBT_BURDEN_CRITICAL ? "HIGH" : "MEDIUM",
        title: "Beban cicilan tinggi",
        message: `Rencana cicilan hutang ${burden}% dari income (${formatMoney(totalDebtObligation, currency)} / bulan).`,
        currentValue: totalDebtObligation,
        recommendedValue: Math.round(incomeBase * (DEBT_BURDEN_WARNING / 100)),
        difference: totalDebtObligation - Math.round(incomeBase * (DEBT_BURDEN_WARNING / 100)),
        evidence: [
          {
            metric: "debt_payment_ratio",
            current: totalDebtObligation,
            income: incomeBase,
            changePercent: burden,
          },
        ],
        actionType: "VIEW_DEBT",
        period,
      });
    }
  }

  if (
    profile.averageMonthlyIncome > 0 &&
    totalDebtObligation >
      profile.averageMonthlyIncome - profile.averageMonthlyExpense
  ) {
    const available =
      profile.averageMonthlyIncome - profile.averageMonthlyExpense;
    insights.push({
      type: "DEBT_PAYMENT_RISK",
      priority: "HIGH",
      title: "Cicilan melebihi sisa arus kas",
      message: `Kewajiban rata-rata (${formatMoney(totalDebtObligation, currency)}) di atas sisa arus kas (${formatMoney(available, currency)}).`,
      currentValue: totalDebtObligation,
      recommendedValue: Math.max(0, available),
      difference: totalDebtObligation - available,
      evidence: [
        {
          metric: "debt_vs_spare_cashflow",
          current: totalDebtObligation,
          average3m: available,
          income: profile.averageMonthlyIncome,
          expense: profile.averageMonthlyExpense,
        },
      ],
      actionType: "SIMULATE",
      period,
    });
  }

  // —— Debt payoff scenarios (informative) ——
  const payoffCandidates = debts
    .filter((d) => d.remainingAmount > 0)
    .sort((a, b) => b.remainingAmount - a.remainingAmount)
    .slice(0, 2);

  for (const debt of payoffCandidates) {
    const base =
      debt.plannedPayment ??
      debt.minimumPayment ??
      Math.ceil(debt.remainingAmount / 12);
    if (base <= 0) continue;

    const current = calculateDebtScenario(
      debt.remainingAmount,
      base,
      debt.interestRate ?? null
    );
    const boosted = calculateDebtScenario(
      debt.remainingAmount,
      Math.round(base * 1.15),
      debt.interestRate ?? null
    );
    if (
      current.estimatedMonths != null &&
      boosted.estimatedMonths != null &&
      current.estimatedMonths - boosted.estimatedMonths >= 2
    ) {
      const monthsSaved = current.estimatedMonths - boosted.estimatedMonths;
      insights.push({
        type: "DEBT_PAYOFF_SCENARIO",
        priority: "LOW",
        title: `${debt.name}: opsi lunas lebih cepat`,
        message: `Naikkan cicilan ~15% (${formatMoney(Math.round(base * 1.15), currency)}/bln) bisa mempercepat pelunasan ~${monthsSaved} bulan.`,
        debtId: debt._id.toString(),
        currentValue: base,
        recommendedValue: Math.round(base * 1.15),
        difference: monthsSaved,
        evidence: [
          {
            metric: "debt_payoff_scenario",
            currentMonths: current.estimatedMonths,
            boostedMonths: boosted.estimatedMonths,
            currentPayment: base,
            boostedPayment: Math.round(base * 1.15),
          },
        ],
        actionType: "SIMULATE",
        period,
      });
    }
  }

  // —— Emergency fund gap ——
  const emergencyGoal = goals.find((g) =>
    g.name.toLowerCase().includes("emergency")
  );
  const essentialMonthly =
    profile.averageFixedExpense || profile.averageMonthlyExpense;

  if (!emergencyGoal && essentialMonthly > 0) {
    insights.push({
      type: "EMERGENCY_FUND_GAP",
      priority: "MEDIUM",
      title: "Belum ada tujuan dana darurat",
      message: `Buat goal dana darurat setara ~${TARGET_EMERGENCY_MONTHS} bulan essentials (${formatMoney(essentialMonthly * TARGET_EMERGENCY_MONTHS, currency)}).`,
      recommendedValue: essentialMonthly * TARGET_EMERGENCY_MONTHS,
      evidence: [
        {
          metric: "emergency_fund_missing",
          essentialMonthly,
          targetMonths: TARGET_EMERGENCY_MONTHS,
        },
      ],
      actionType: "VIEW_GOALS",
      period,
    });
  } else if (emergencyGoal && essentialMonthly > 0) {
    const coverage = calculateEmergencyCoverage(
      emergencyGoal.currentAmount,
      essentialMonthly
    );
    if (coverage != null && coverage < TARGET_EMERGENCY_MONTHS) {
      const gap = Math.max(
        0,
        essentialMonthly * TARGET_EMERGENCY_MONTHS - emergencyGoal.currentAmount
      );
      insights.push({
        type: "EMERGENCY_FUND_GAP",
        priority: coverage < 1 ? "HIGH" : "MEDIUM",
        title: "Dana darurat di bawah target",
        message: `${emergencyGoal.name} menutup ~${coverage} bulan essentials; target ${TARGET_EMERGENCY_MONTHS}+ bulan (selisih ${formatMoney(gap, currency)}).`,
        goalId: emergencyGoal._id.toString(),
        currentValue: emergencyGoal.currentAmount,
        recommendedValue: essentialMonthly * TARGET_EMERGENCY_MONTHS,
        difference: gap,
        evidence: [
          {
            metric: "emergency_coverage_months",
            current: coverage,
            essentialMonthly,
            targetMonths: TARGET_EMERGENCY_MONTHS,
            fund: emergencyGoal.currentAmount,
          },
        ],
        actionType: "VIEW_GOALS",
        period,
      });
    }
  }

  // —— Income change vs 3-month average ——
  if (profile.averageMonthlyIncome > 0 && summary.income > 0) {
    const incomeChange = percent(
      summary.income - profile.averageMonthlyIncome,
      profile.averageMonthlyIncome
    );
    if (Math.abs(incomeChange) >= INCOME_CHANGE_THRESHOLD) {
      const up = incomeChange > 0;
      insights.push({
        type: "INCOME_CHANGE",
        priority: up ? "LOW" : "MEDIUM",
        title: up ? "Income di atas biasanya" : "Income di bawah biasanya",
        message: `Income ${Math.abs(incomeChange)}% ${up ? "di atas" : "di bawah"} rata-rata 3 bulan (${formatMoney(summary.income, currency)} vs ${formatMoney(profile.averageMonthlyIncome, currency)}).`,
        currentValue: summary.income,
        recommendedValue: profile.averageMonthlyIncome,
        difference: summary.income - profile.averageMonthlyIncome,
        evidence: [
          {
            metric: "income_change",
            current: summary.income,
            average3m: profile.averageMonthlyIncome,
            changePercent: incomeChange,
          },
        ],
        actionType: "VIEW_FORECAST",
        period,
      });
    }
  }

  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  insights.sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority]
  );
  return insights;
}

export async function persistInsights(
  userId: string,
  period: Period,
  insights: InsightRecommendation[]
) {
  await FinancialRecommendation.deleteMany({
    userId,
    "period.year": period.year,
    "period.month": period.month,
    status: { $in: ["NEW", "VIEWED"] },
  });

  if (insights.length === 0) return [];

  const docs = await FinancialRecommendation.insertMany(
    insights.map((i) => ({
      userId,
      type: i.type,
      priority: i.priority,
      title: i.title,
      message: i.message,
      categoryId: i.categoryId,
      debtId: i.debtId,
      goalId: i.goalId,
      currentValue: i.currentValue,
      recommendedValue: i.recommendedValue,
      difference: i.difference,
      evidence: i.evidence,
      actionType: i.actionType,
      status: "NEW",
      period,
    }))
  );
  return docs;
}

export async function getCashFlowForecastForUser(
  userId: string,
  period: Period
) {
  const data = await buildCategorySpendingSeries(userId, period, 3);
  const profile = await getFinancialProfile(userId, period);
  const baselines = await getPlanningBaselines(userId, period);
  const accounts = await Account.find({ userId, isActive: true }).lean();

  const historyIncome = Math.round(
    weightedAverage3([...data.incomeHistory].reverse())
  );
  const projectedIncome = resolveExpectedIncome(
    baselines,
    historyIncome,
    data.currentIncome
  );

  const useFixedModel = baselines.fixedCostsTotal > 0;
  const weightedSeriesTotal = (rows: typeof data.series) =>
    Math.round(
      rows.reduce((sum, s) => {
        const newestFirst = [...s.amounts].reverse();
        return sum + weightedAverage3(newestFirst);
      }, 0)
    );

  let projectedFixedCosts: number;
  let projectedExpenses: number;
  if (useFixedModel) {
    projectedFixedCosts = baselines.fixedCostsTotal;
    const variableProjected = weightedSeriesTotal(
      data.series.filter((s) => s.nature !== "FIXED")
    );
    projectedExpenses = variableProjected + projectedFixedCosts;
  } else {
    projectedExpenses = weightedSeriesTotal(data.series);
    projectedFixedCosts = weightedSeriesTotal(
      data.series.filter((s) => s.nature === "FIXED")
    );
  }

  const fallbackDebt = (
    await Debt.find({ userId, status: "ACTIVE" }).lean()
  ).reduce((sum, d) => sum + (d.plannedPayment ?? d.minimumPayment ?? 0), 0);
  const projectedDebtPayment =
    baselines.debtDueTotal > 0 ? baselines.debtDueTotal : fallbackDebt;

  const startingBalance = accounts
    .filter((a) => a.type !== "CREDIT_CARD")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  const assumptions = [
    baselines.incomeSource === "SALARY"
      ? "Income uses Settings monthly salary (max with history / month-to-date)."
      : "Income from weighted transaction history (set monthly salary in Settings for a stable baseline).",
    useFixedModel
      ? "Fixed costs come from Fixed costs planning; variable spend from weighted 3-month history."
      : "Spending assumed similar to the previous 3 months (weighted).",
    baselines.debtDueTotal > 0
      ? `Debt uses obligations due in this pay cycle (${baselines.cycleLabel}).`
      : "Debt payment uses planned/minimum obligation on active debts.",
    "Transfers are excluded from expenses.",
    `Window is the pay cycle ${baselines.cycleLabel} (payday → day before next payday).`,
  ];

  return {
    ...forecastMonthlyCashflow({
      projectedIncome,
      projectedExpenses,
      projectedFixedCosts,
      projectedDebtPayment,
      startingBalance,
      currency: data.currency,
      historicalMonthsAvailable: data.historicalMonthsAvailable,
      incomeStable:
        profile.incomeStability === "STABLE" ||
        baselines.incomeSource === "SALARY",
      incomeSource: baselines.incomeSource,
      assumptions,
    }),
    period,
    cycleLabel: baselines.cycleLabel,
    periodStart: baselines.periodStart,
    periodEnd: baselines.periodEnd,
  };
}

export async function getDebtScenarios(userId: string) {
  const debts = await Debt.find({ userId, status: "ACTIVE" }).lean();
  return debts.map((debt) => {
    const base =
      debt.plannedPayment ??
      debt.minimumPayment ??
      Math.ceil(debt.remainingAmount / 12);
    const rates = debt.interestRate ?? null;
    const scenarios = [1, 1.15, 1.3].map((mult, idx) => {
      const payment = Math.round(base * mult);
      const scenario = calculateDebtScenario(
        debt.remainingAmount,
        payment,
        rates
      );
      return {
        ...scenario,
        label: ["Current", "Scenario B", "Scenario C"][idx],
      };
    });
    return {
      debtId: debt._id.toString(),
      name: debt.name,
      remainingAmount: debt.remainingAmount,
      currency: debt.currency,
      interestRate: debt.interestRate ?? null,
      scenarios,
    };
  });
}

export async function getEmergencyFundAnalysis(userId: string, period: Period) {
  const profile = await getFinancialProfile(userId, period);
  const goals = await SavingsGoal.find({ userId, status: "ACTIVE" }).lean();
  const emergency = goals.find((g) =>
    g.name.toLowerCase().includes("emergency")
  );
  const coverage = emergency
    ? calculateEmergencyCoverage(
        emergency.currentAmount,
        profile.averageFixedExpense || profile.averageMonthlyExpense
      )
    : null;

  return {
    emergencyFund: emergency
      ? {
          goalId: emergency._id.toString(),
          name: emergency.name,
          currentAmount: emergency.currentAmount,
          targetAmount: emergency.targetAmount,
          currency: emergency.currency,
        }
      : null,
    essentialMonthlyExpenses:
      profile.averageFixedExpense || profile.averageMonthlyExpense,
    coverageMonths: coverage,
  };
}

export async function getMonthlyReview(userId: string, period: Period) {
  const paydayDay = await getUserPaydayDay(userId);
  const cycle = getPayCycleForPeriod(paydayDay, period);
  const summary = await getFinancialSummary(userId, period);
  const analytics = await getSpendingAnalytics(userId, period);
  const budgets = await getBudgetOverview(userId, period);
  const prev = shiftPeriod(period, 1);
  const prevSummary = await getFinancialSummary(userId, prev);
  const goals = await SavingsGoal.find({ userId }).lean();

  return {
    period,
    label: cycle.label,
    cycleLabel: cycle.label,
    cycleStart: cycle.start.toISOString(),
    cycleEnd: cycle.end.toISOString(),
    income: summary.income,
    expenses: summary.expense,
    savings: summary.savings,
    debtPayment: summary.debtPayment,
    netCashFlow: summary.netCashFlow,
    topCategories: analytics
      .sort((a, b) => b.currentAmount - a.currentAmount)
      .slice(0, 5),
    biggestChanges: analytics
      .filter((a) => a.trend !== "INSUFFICIENT_DATA")
      .sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange))
      .slice(0, 5)
      .map((a) => ({
        categoryName: a.categoryName,
        percentageChange: a.percentageChange,
        trend: a.trend,
      })),
    budgetPerformance: {
      within: budgets.filter((b) => !b.overBudget).length,
      over: budgets.filter((b) => b.overBudget).length,
      items: budgets,
    },
    comparison: {
      previous: prev,
      incomeChange: percent(
        summary.income - prevSummary.income,
        prevSummary.income
      ),
      expenseChange: percent(
        summary.expense - prevSummary.expense,
        prevSummary.expense
      ),
      savingsChange: percent(
        summary.savings - prevSummary.savings,
        prevSummary.savings
      ),
      debtChange: percent(
        summary.debtPayment - prevSummary.debtPayment,
        prevSummary.debtPayment
      ),
      netCashFlowChange: percent(
        summary.netCashFlow - prevSummary.netCashFlow,
        Math.abs(prevSummary.netCashFlow) || 1
      ),
    },
    goals: goals.map((g) => ({
      name: g.name,
      currentAmount: g.currentAmount,
      targetAmount: g.targetAmount,
      status: g.status,
      currency: g.currency,
    })),
    currency: summary.currency,
  };
}

export async function simulateWhatIf(userId: string, period: Period, input: WhatIfInput) {
  const summary = await getFinancialSummary(userId, period);
  const debts = await Debt.find({ userId, status: "ACTIVE" }).lean();
  const totalDebt = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const interest =
    debts.length === 1 ? (debts[0].interestRate ?? null) : null;

  return runWhatIf(
    {
      income: summary.income,
      expenses: summary.expense,
      debtPayment: summary.debtPayment,
      savings: summary.savings,
      debtBalance: totalDebt,
      debtInterestRate: interest,
    },
    input
  );
}

export async function buildPhase2FinancialContext(
  userId: string,
  period: Period
) {
  const [summary, profile, analytics, budgets, forecast, insights, debts, emergency] =
    await Promise.all([
      getFinancialSummary(userId, period),
      getFinancialProfile(userId, period),
      getSpendingAnalytics(userId, period),
      getBudgetOverview(userId, period),
      getCashFlowForecastForUser(userId, period),
      generatePhase2Insights(userId, period),
      Debt.find({ userId, status: "ACTIVE" }).lean(),
      getEmergencyFundAnalysis(userId, period),
    ]);

  const utilization =
    budgets.length === 0
      ? 0
      : mean(budgets.map((b) => b.utilizationPercentage)) / 100;

  return {
    period: periodKey(period),
    baseCurrency: summary.currency,
    income: {
      current: summary.income,
      average3m: profile.averageMonthlyIncome,
    },
    expenses: {
      current: summary.expense,
      average3m: profile.averageMonthlyExpense,
    },
    savings: {
      current: summary.savings,
      average3m: profile.averageMonthlySavings,
    },
    debts: {
      total: debts.reduce((sum, d) => sum + d.remainingAmount, 0),
      monthlyPayment: profile.averageDebtPayment,
    },
    budget: {
      utilization,
    },
    topCategories: analytics.slice(0, 5).map((a) => ({
      name: a.categoryName,
      current: a.currentAmount,
      average3m: a.average3m,
      trend: a.trend,
    })),
    forecast: {
      projectedSavings: forecast.projectedSavings,
      confidence: forecast.confidence,
      assumptions: forecast.assumptions,
    },
    emergencyFund: emergency,
    recommendations: insights.slice(0, 10).map((i) => ({
      type: i.type,
      priority: i.priority,
      title: i.title,
      message: i.message,
      evidence: i.evidence,
    })),
  };
}

/**
 * Resolve period from query. Missing year/month → current pay cycle
 * (payday month), not calendar month.
 */
export async function parsePeriod(
  searchParams: URLSearchParams,
  userId: string
): Promise<Period> {
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  if (yearParam && monthParam) {
    return {
      year: Number(yearParam),
      month: Number(monthParam),
    };
  }
  const paydayDay = await getUserPaydayDay(userId);
  return periodFromDate(paydayDay, new Date());
}
