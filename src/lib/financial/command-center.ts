import { PaydayAllocation } from "@/models/PaydayAllocation";
import { getFinancialHealth } from "@/lib/financial/metrics/financial-health";
import { getHorizonCashFlowForecast } from "@/lib/financial/forecast/cash-flow-forecast-service";
import { getActionCenter } from "@/lib/financial/recommendations/action-center";
import { evaluateWealthLadder } from "@/lib/financial/wealth-ladder";
import { getCashFlowSeries } from "@/lib/financial/summary";
import { getUserPaydayDay, periodFromDate } from "@/lib/financial/pay-cycle";
import type { Period } from "@/lib/financial/phase2-types";

/**
 * Financial Command Center composition (FR-07).
 * Read-mostly: action center may generate insights if none exist for the period.
 */
export async function getCommandCenter(userId: string, period?: Period) {
  const paydayDay = await getUserPaydayDay(userId);
  const resolvedPeriod = period ?? periodFromDate(paydayDay, new Date());

  const [health, forecast, actions, roadmap, series, allocation] =
    await Promise.all([
      getFinancialHealth(userId, resolvedPeriod),
      getHorizonCashFlowForecast(userId, 30),
      getActionCenter(userId, {
        searchParams: new URLSearchParams({
          year: String(resolvedPeriod.year),
          month: String(resolvedPeriod.month),
        }),
      }),
      evaluateWealthLadder(userId, resolvedPeriod),
      getCashFlowSeries(userId, 2),
      PaydayAllocation.findOne({
        userId,
        status: "ACTIVE",
      })
        .sort({ cycleStart: -1 })
        .lean(),
    ]);

  const prev = series.length >= 2 ? series[0] : null;
  const curr = series.length >= 1 ? series[series.length - 1] : null;
  const periodChange =
    prev && curr
      ? {
          previousLabel: prev.label,
          currentLabel: curr.label,
          incomeDelta: curr.income - prev.income,
          expenseDelta: curr.expense - prev.expense,
          netDelta: curr.net - prev.net,
          currency: curr.currency ?? health.currency,
        }
      : null;

  const allocated =
    allocation != null
      ? (allocation.envelopes ?? []).reduce(
          (sum: number, e: { amount?: number }) => sum + (e.amount ?? 0),
          0
        )
      : null;

  const topActions = actions.actions.slice(0, 5);

  return {
    period: resolvedPeriod,
    health: {
      currency: health.currency,
      income: health.income.value,
      expense: health.expense.value,
      netCashFlow: health.netCashFlow.value,
      savingsRate: health.savingsRate.value,
      savingsRateAvailable: health.savingsRate.available,
      liquidAssets: health.liquidAssets.value,
      netWorth: health.netWorth.value,
      totalLiabilities: health.totalLiabilities.value,
      emergencyCoverageMonths: health.emergencyCoverageMonths.value,
      quality: health.quality,
      rulesVersion: health.rulesVersion,
      cycleLabel: health.period.label,
    },
    forecast: {
      horizonDays: forecast.horizonDays,
      startingBalance: forecast.startingBalance,
      endingBalance: forecast.endingBalance,
      lowestBalance: forecast.lowestBalance,
      shortfallCount: forecast.shortfalls.length,
      nextShortfall: forecast.shortfalls[0] ?? null,
      incomeClass: forecast.incomeClass,
      assumptions: forecast.assumptions.slice(0, 3),
      rulesVersion: forecast.rulesVersion,
    },
    actions: {
      counts: actions.counts,
      top: topActions.map((a) => ({
        id: a.id,
        issueKey: a.issueKey,
        source: a.source,
        type: a.type,
        priority: a.priority,
        title: a.title,
        message: a.message,
        href: a.href,
      })),
    },
    roadmap: {
      currentStep: roadmap.currentStep,
      progressPercent: roadmap.progressPercent,
      completedCount: roadmap.completedCount,
      applicableSteps: roadmap.applicableSteps,
      focusTitle:
        roadmap.steps.find((s) => s.status === "FOCUS" || s.status === "UNKNOWN")
          ?.title ?? null,
      starterGoalMissing: roadmap.starterGoalMissing,
      ruleVersion: roadmap.ruleVersion,
    },
    payday: allocation
      ? {
          status: allocation.status,
          currency: allocation.currency,
          salary: allocation.salary,
          startingCash: allocation.startingCash,
          allocated,
          remaining:
            (allocation.salary ?? 0) +
            (allocation.startingCash ?? 0) -
            (allocated ?? 0),
          envelopeCount: allocation.envelopes?.length ?? 0,
          cycleStart: allocation.cycleStart,
          cycleEnd: allocation.cycleEnd,
        }
      : null,
    periodChange,
  };
}
