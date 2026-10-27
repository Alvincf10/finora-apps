import { AIError } from "@/lib/ai/errors";
import { getCommandCenter } from "@/lib/financial/command-center";
import { getScenario } from "@/lib/financial/decision/scenario-service";
import { getHorizonCashFlowForecast } from "@/lib/financial/forecast/cash-flow-forecast-service";
import { getFinancialHealth } from "@/lib/financial/metrics/financial-health";
import { getUserPaydayDay, periodFromDate } from "@/lib/financial/pay-cycle";
import { getActionCenter } from "@/lib/financial/recommendations/action-center";
import { evaluateWealthLadder } from "@/lib/financial/wealth-ladder";
import type { Period } from "@/lib/financial/phase2-types";

export const AI_CONTEXT_TYPES = [
  "financial_health",
  "cash_flow_forecast",
  "scenario",
  "action_center",
  "roadmap",
  "general_summary",
] as const;

export type AIContextType = (typeof AI_CONTEXT_TYPES)[number];

export type AIContextRef = {
  periodDays?: number;
  scenarioId?: string;
  year?: number;
  month?: number;
};

export type AIExplainContext = {
  currency: string;
  period: { year: number; month: number; label?: string };
  contextType: AIContextType;
  dataLimitations: string[];
  /** Slim payload — never full transaction history */
  payload: Record<string, unknown>;
};

function resolvePeriod(
  paydayDay: number,
  ref?: AIContextRef
): Period {
  if (ref?.year && ref?.month) {
    return { year: ref.year, month: ref.month };
  }
  return periodFromDate(paydayDay, new Date());
}

/**
 * Build a minimized, engine-sourced context for AI explain.
 * Numbers come only from Finora financial engine — never from the browser.
 */
export async function buildAIExplainContext(
  userId: string,
  contextType: AIContextType,
  contextRef?: AIContextRef
): Promise<AIExplainContext> {
  const paydayDay = await getUserPaydayDay(userId);
  const period = resolvePeriod(paydayDay, contextRef);
  const dataLimitations: string[] = [];

  switch (contextType) {
    case "financial_health": {
      const health = await getFinancialHealth(userId, period);
      if (health.quality?.length) {
        dataLimitations.push(...health.quality);
      }
      return {
        currency: health.currency,
        period: {
          year: period.year,
          month: period.month,
          label: health.period.label,
        },
        contextType,
        dataLimitations,
        payload: {
          financialHealth: {
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
          },
        },
      };
    }

    case "cash_flow_forecast": {
      const days =
        contextRef?.periodDays === 60 || contextRef?.periodDays === 90
          ? contextRef.periodDays
          : 30;
      const forecast = await getHorizonCashFlowForecast(userId, days);
      if (forecast.assumptions?.length) {
        dataLimitations.push(...forecast.assumptions.slice(0, 5));
      }
      if (forecast.limitations?.length) {
        dataLimitations.push(...forecast.limitations.slice(0, 5));
      }
      return {
        currency: forecast.currency,
        period: { year: period.year, month: period.month },
        contextType,
        dataLimitations,
        payload: {
          cashFlowForecast: {
            horizonDays: forecast.horizonDays,
            currency: forecast.currency,
            startingBalance: forecast.startingBalance,
            endingBalance: forecast.endingBalance,
            lowestBalance: forecast.lowestBalance,
            shortfallCount: forecast.shortfalls.length,
            nextShortfall: forecast.shortfalls[0]
              ? {
                  date: forecast.shortfalls[0].date,
                  balanceAfter: forecast.shortfalls[0].balanceAfter,
                  causingLabel: forecast.shortfalls[0].causingLabel,
                  causingKind: forecast.shortfalls[0].causingKind,
                }
              : null,
            incomeClass: forecast.incomeClass,
            eventCount: forecast.events.length,
            rulesVersion: forecast.rulesVersion,
          },
        },
      };
    }

    case "scenario": {
      const scenarioId = contextRef?.scenarioId?.trim();
      if (!scenarioId) {
        throw new AIError(
          "INSUFFICIENT_CONTEXT",
          "Pilih skenario Decision Lab terlebih dahulu.",
          400
        );
      }
      const scenario = await getScenario(userId, scenarioId);
      if (!scenario) {
        throw new AIError(
          "INSUFFICIENT_CONTEXT",
          "Skenario tidak ditemukan atau bukan milik Anda.",
          404
        );
      }
      return {
        currency: scenario.currency,
        period: {
          year: period.year,
          month: period.month,
          label: (scenario.baselineSnapshot as { cycleLabel?: string })
            ?.cycleLabel,
        },
        contextType,
        dataLimitations: [],
        payload: {
          scenario: {
            id: scenario.id,
            name: scenario.name,
            currency: scenario.currency,
            assumptions: scenario.assumptions,
            results: scenario.results,
            baseline: {
              income: (scenario.baselineSnapshot as { income?: number }).income,
              expenses: (scenario.baselineSnapshot as { expenses?: number })
                .expenses,
              debtPayment: (
                scenario.baselineSnapshot as { debtPayment?: number }
              ).debtPayment,
              liquidAssets: (
                scenario.baselineSnapshot as { liquidAssets?: number }
              ).liquidAssets,
              netWorth: (scenario.baselineSnapshot as { netWorth?: number })
                .netWorth,
              debtBalance: (
                scenario.baselineSnapshot as { debtBalance?: number }
              ).debtBalance,
            },
            rulesVersion: scenario.rulesVersion,
          },
        },
      };
    }

    case "action_center": {
      const actions = await getActionCenter(userId, {
        searchParams: new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
        }),
      });
      return {
        currency: "IDR",
        period: { year: period.year, month: period.month },
        contextType,
        dataLimitations: [],
        payload: {
          actionCenter: {
            counts: actions.counts,
            top: actions.actions.slice(0, 8).map((a) => ({
              issueKey: a.issueKey,
              type: a.type,
              priority: a.priority,
              title: a.title,
              message: a.message,
              source: a.source,
            })),
          },
        },
      };
    }

    case "roadmap": {
      const roadmap = await evaluateWealthLadder(userId, period);
      return {
        currency: roadmap.currency,
        period: { year: period.year, month: period.month },
        contextType,
        dataLimitations: roadmap.starterGoalMissing
          ? ["starter_goal_missing"]
          : [],
        payload: {
          roadmap: {
            currentStep: roadmap.currentStep,
            progressPercent: roadmap.progressPercent,
            completedCount: roadmap.completedCount,
            applicableSteps: roadmap.applicableSteps,
            focus:
              roadmap.steps.find(
                (s) => s.status === "FOCUS" || s.status === "UNKNOWN"
              ) ?? null,
            steps: roadmap.steps.map((s) => ({
              id: s.id,
              title: s.title,
              status: s.status,
              reason: s.reason,
              progress: s.progress,
            })),
            ruleVersion: roadmap.ruleVersion,
          },
        },
      };
    }

    case "general_summary": {
      const center = await getCommandCenter(userId, period);
      if (center.health.quality?.length) {
        dataLimitations.push(...center.health.quality);
      }
      return {
        currency: center.health.currency,
        period: {
          year: period.year,
          month: period.month,
          label: center.health.cycleLabel,
        },
        contextType,
        dataLimitations,
        payload: {
          commandCenter: {
            health: center.health,
            forecast: center.forecast,
            actions: center.actions,
            roadmap: {
              currentStep: center.roadmap.currentStep,
              progressPercent: center.roadmap.progressPercent,
              focusTitle: center.roadmap.focusTitle,
              completedCount: center.roadmap.completedCount,
            },
            payday: center.payday
              ? {
                  status: center.payday.status,
                  salary: center.payday.salary,
                  allocated: center.payday.allocated,
                  remaining: center.payday.remaining,
                  envelopeCount: center.payday.envelopeCount,
                }
              : null,
            periodChange: center.periodChange,
          },
        },
      };
    }

    default: {
      const _exhaustive: never = contextType;
      throw new AIError(
        "INVALID_REQUEST",
        `contextType tidak dikenal: ${_exhaustive}`,
        400
      );
    }
  }
}
