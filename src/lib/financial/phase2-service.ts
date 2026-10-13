import { subMonths, startOfMonth, endOfMonth } from "date-fns";
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
  daysInMonth,
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
import { percent } from "@/lib/money";
import type {
  CategoryMonthlySpend,
  ExpenseClass,
  ExpenseNature,
  InsightRecommendation,
  Period,
  WhatIfInput,
} from "@/lib/financial/phase2-types";
import type { Currency } from "@/types";

function periodKey(p: Period) {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function shiftPeriod(period: Period, monthsBack: number): Period {
  const d = subMonths(new Date(period.year, period.month - 1, 1), monthsBack);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
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

  for (const period of periods) {
    const start = startOfMonth(new Date(period.year, period.month - 1, 1));
    const end = endOfMonth(start);
    const match: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      date: { $gte: start, $lte: end },
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

export async function getSpendingAnalytics(userId: string, current: Period) {
  const data = await buildCategorySpendingSeries(userId, current, 6);
  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === current.year && now.getMonth() + 1 === current.month;
  const elapsed = isCurrentMonth ? now.getDate() : daysInMonth(current.year, current.month);
  const dim = daysInMonth(current.year, current.month);

  return data.series.map((s) => {
    const trend = detectSpendingTrend(s.currentAmount, s.amounts);
    const anomaly = detectAnomaly(s.currentAmount, s.amounts);
    const projected = projectCategorySpend(s.currentAmount, elapsed, dim);
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
  const debts = await Debt.find({ userId, status: "ACTIVE" }).lean();
  const goals = await SavingsGoal.find({ userId, status: "ACTIVE" }).lean();

  const expectedIncome =
    data.currentIncome > 0
      ? data.currentIncome
      : Math.round(weightedAverage3([...data.incomeHistory].reverse()));

  const minimumDebtPayment = debts.reduce(
    (sum, d) => sum + (d.minimumPayment ?? d.plannedPayment ?? 0),
    0
  );

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

  return generateBudgetRecommendation({
    year: current.year,
    month: current.month,
    currency: data.currency,
    expectedIncome,
    categories: data.series,
    minimumDebtPayment,
    targetSavings,
    historicalMonthsAvailable: data.historicalMonthsAvailable,
  });
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
  const analytics = await getSpendingAnalytics(userId, period);
  const budgets = await getBudgetOverview(userId, period);
  const summary = await getFinancialSummary(userId, period);
  const profile = await getFinancialProfile(userId, period);
  const now = new Date();
  const elapsed = now.getDate();
  const dim = daysInMonth(period.year, period.month);

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
        title: `Unusual ${row.categoryName} spending`,
        message: `${row.categoryName} is above the anomaly threshold (${row.anomaly.threshold}).`,
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
        title: `${b.categoryName} over budget`,
        message: `Spending exceeded the ${b.categoryName} budget.`,
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
        actionType: "VIEW_BUDGET",
        period,
      });
    } else if (b.utilizationPercentage >= 80) {
      insights.push({
        type: "BUDGET_WARNING",
        priority: "MEDIUM",
        title: `${b.categoryName} budget warning`,
        message: `${b.categoryName} is at ${b.utilizationPercentage}% of budget.`,
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
        actionType: "VIEW_BUDGET",
        period,
      });
    } else {
      const projected = projectCategorySpend(b.actualAmount, elapsed, dim);
      if (projected > b.budgetAmount) {
        insights.push({
          type: "PROJECTED_BUDGET_OVERFLOW",
          priority: "HIGH",
          title: `Projected ${b.categoryName} overflow`,
          message: `Current pace projects ~${projected - b.budgetAmount} over budget by month end.`,
          categoryId: b.categoryId,
          currentValue: b.actualAmount,
          recommendedValue: b.budgetAmount,
          difference: projected - b.budgetAmount,
          evidence: [
            {
              metric: "projected_spend",
              current: b.actualAmount,
              projected,
              budget: b.budgetAmount,
            },
          ],
          actionType: "VIEW_BUDGET",
          period,
        });
      }
    }
  }

  if (summary.savingsRate < 10 && summary.income > 0) {
    insights.push({
      type: "SAVINGS_TARGET_RISK",
      priority: "MEDIUM",
      title: "Low savings rate",
      message: `Savings rate is ${summary.savingsRate}% this month.`,
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
      title: "Savings opportunity",
      message: `Average cash flow suggests approximately ${spare} additional savings capacity.`,
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
      title: "Negative cash flow",
      message: "Expenses exceed income this month.",
      currentValue: summary.netCashFlow,
      evidence: [
        {
          metric: "net_cash_flow",
          current: summary.netCashFlow,
          income: summary.income,
          expense: summary.expense,
        },
      ],
      actionType: "VIEW_BUDGET",
      period,
    });
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
  const debts = await Debt.find({ userId, status: "ACTIVE" }).lean();
  const accounts = await Account.find({ userId, isActive: true }).lean();

  const projectedIncome =
    data.currentIncome > 0
      ? // blend known month-to-date with historical remainder roughly
        Math.max(
          data.currentIncome,
          Math.round(weightedAverage3([...data.incomeHistory].reverse()))
        )
      : Math.round(weightedAverage3([...data.incomeHistory].reverse()));

  const projectedExpenses = data.series.reduce((sum, s) => {
    const newestFirst = [...s.amounts].reverse();
    return sum + weightedAverage3(newestFirst);
  }, 0);

  const projectedDebtPayment = debts.reduce(
    (sum, d) => sum + (d.plannedPayment ?? d.minimumPayment ?? 0),
    0
  );

  const startingBalance = accounts
    .filter((a) => a.type !== "CREDIT_CARD")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  return forecastMonthlyCashflow({
    projectedIncome,
    projectedExpenses: Math.round(projectedExpenses),
    projectedDebtPayment,
    startingBalance,
    currency: data.currency,
    historicalMonthsAvailable: data.historicalMonthsAvailable,
    incomeStable: profile.incomeStability === "STABLE",
  });
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
  const summary = await getFinancialSummary(userId, period);
  const analytics = await getSpendingAnalytics(userId, period);
  const budgets = await getBudgetOverview(userId, period);
  const prev = shiftPeriod(period, 1);
  const prevSummary = await getFinancialSummary(userId, prev);
  const goals = await SavingsGoal.find({ userId }).lean();

  return {
    period,
    label: periodKey(period),
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

export function parsePeriod(searchParams: URLSearchParams): Period {
  const now = new Date();
  return {
    year: Number(searchParams.get("year") ?? now.getFullYear()),
    month: Number(searchParams.get("month") ?? now.getMonth() + 1),
  };
}
