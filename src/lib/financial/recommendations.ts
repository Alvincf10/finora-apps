import { subMonths } from "date-fns";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Category } from "@/models/Category";
import {
  getBudgetOverview,
  getExpenseBreakdown,
  getFinancialSummary,
  type Period,
} from "@/lib/financial/summary";
import type { RecommendationSeverity, RecommendationType } from "@/types";

export interface Recommendation {
  type: RecommendationType;
  severity: RecommendationSeverity;
  title: string;
  message: string;
  relatedCategoryId?: string;
  relatedDebtId?: string;
  relatedGoalId?: string;
  metadata?: Record<string, unknown>;
  period: Period;
}

export async function generateRecommendations(
  userId: string,
  period: Period
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];
  const [budgets, summary, goals, debts] = await Promise.all([
    getBudgetOverview(userId, period),
    getFinancialSummary(userId, period),
    SavingsGoal.find({ userId, status: "ACTIVE" }).lean(),
    Debt.find({ userId, status: "ACTIVE" }).lean(),
  ]);

  for (const budget of budgets) {
    if (budget.overBudget) {
      recommendations.push({
        type: "OVER_BUDGET",
        severity: "CRITICAL",
        title: `${budget.categoryName} over budget`,
        message: `Spending exceeded the ${budget.categoryName} budget this month.`,
        relatedCategoryId: budget.categoryId,
        metadata: {
          budgetAmount: budget.budgetAmount,
          actualAmount: budget.actualAmount,
        },
        period,
      });
    } else if (budget.utilizationPercentage >= 80) {
      recommendations.push({
        type: "BUDGET_WARNING",
        severity: "WARNING",
        title: `${budget.categoryName} budget warning`,
        message: `${budget.categoryName} is at ${budget.utilizationPercentage}% of budget.`,
        relatedCategoryId: budget.categoryId,
        metadata: { utilizationPercentage: budget.utilizationPercentage },
        period,
      });
    }
  }

  const spendingAlerts = await detectSpendingIncreases(userId, period);
  recommendations.push(...spendingAlerts);

  if (summary.income > 0 && summary.savingsRate < 10) {
    recommendations.push({
      type: "SAVING_TARGET_RISK",
      severity: "WARNING",
      title: "Low savings rate",
      message: `Savings rate is ${summary.savingsRate}% this month. Aim for at least 10%.`,
      metadata: { savingsRate: summary.savingsRate },
      period,
    });
  }

  for (const goal of goals) {
    if (goal.targetDate && goal.currentAmount < goal.targetAmount) {
      const remaining = goal.targetAmount - goal.currentAmount;
      const daysLeft =
        (new Date(goal.targetDate).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      if (daysLeft < 30 && remaining > 0) {
        recommendations.push({
          type: "SAVING_TARGET_RISK",
          severity: "WARNING",
          title: `${goal.name} at risk`,
          message: `${goal.name} is behind schedule with less than 30 days remaining.`,
          relatedGoalId: goal._id.toString(),
          period,
        });
      }
    }
  }

  const today = new Date();
  for (const debt of debts) {
    if (debt.dueDate && new Date(debt.dueDate) < today) {
      recommendations.push({
        type: "DEBT_PAYMENT_OVERDUE",
        severity: "CRITICAL",
        title: `${debt.name} payment overdue`,
        message: `A payment for ${debt.name} appears overdue.`,
        relatedDebtId: debt._id.toString(),
        period,
      });
    }
  }

  return recommendations;
}

async function detectSpendingIncreases(
  userId: string,
  period: Period
): Promise<Recommendation[]> {
  const current = await getExpenseBreakdown(userId, period);
  const averages = new Map<string, number>();

  for (let i = 1; i <= 3; i++) {
    const date = subMonths(
      new Date(period.year, period.month - 1, 1),
      i
    );
    const past = await getExpenseBreakdown(userId, {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
    for (const row of past) {
      averages.set(
        row.categoryId,
        (averages.get(row.categoryId) ?? 0) + row.amount
      );
    }
  }

  for (const [categoryId, total] of averages) {
    averages.set(categoryId, total / 3);
  }

  const results: Recommendation[] = [];
  for (const row of current) {
    const avg = averages.get(row.categoryId) ?? 0;
    if (avg > 0 && row.amount > avg * 1.2) {
      const category = await Category.findById(row.categoryId).lean();
      results.push({
        type: "CATEGORY_SPENDING_INCREASE",
        severity: "INFO",
        title: `${category?.name ?? row.name} spending up`,
        message: `${category?.name ?? row.name} spending is more than 20% above the 3-month average.`,
        relatedCategoryId: row.categoryId,
        metadata: {
          current: row.amount,
          average: Math.round(avg),
        },
        period,
      });
    }
  }

  return results;
}

export async function buildFinancialContext(userId: string, period: Period) {
  const [summary, breakdown, budgets, recommendations] = await Promise.all([
    getFinancialSummary(userId, period),
    getExpenseBreakdown(userId, period),
    getBudgetOverview(userId, period),
    generateRecommendations(userId, period),
  ]);

  return {
    period,
    summary,
    topCategories: breakdown.slice(0, 5),
    budgetExceeded: budgets
      .filter((b) => b.overBudget)
      .map((b) => b.categoryName),
    recommendations: recommendations.map((r) => ({
      type: r.type,
      severity: r.severity,
      title: r.title,
      message: r.message,
    })),
  };
}
