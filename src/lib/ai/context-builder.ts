import { AIError } from "@/lib/ai/errors";
import { getCommandCenter } from "@/lib/financial/command-center";
import {
  compareUserScenarios,
  getScenario,
} from "@/lib/financial/decision/scenario-service";
import { getHorizonCashFlowForecast } from "@/lib/financial/forecast/cash-flow-forecast-service";
import { getFinancialHealth } from "@/lib/financial/metrics/financial-health";
import { getUserPaydayDay, periodFromDate } from "@/lib/financial/pay-cycle";
import { getActionCenter } from "@/lib/financial/recommendations/action-center";
import { evaluateWealthLadder } from "@/lib/financial/wealth-ladder";
import type { Period } from "@/lib/financial/phase2-types";
import {
  DECISION_PREFERENCE_LABELS,
  isDecisionPreference,
  type DecisionPreference,
} from "@/lib/ai/decision-preferences";
import { User } from "@/models/User";

export const AI_CONTEXT_TYPES = [
  "financial_health",
  "cash_flow_forecast",
  "scenario",
  "action_center",
  "roadmap",
  "general_summary",
  "decision_advisor",
] as const;

export type AIContextType = (typeof AI_CONTEXT_TYPES)[number];

export type AIContextRef = {
  periodDays?: number;
  scenarioId?: string;
  /** Compare up to 3 owned scenarios (PRD 5.2-D). Prefer over single id when set. */
  scenarioIds?: string[];
  year?: number;
  month?: number;
  /** Override stored User.decisionPreference for this request only. */
  decisionPreference?: string;
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
      const multi = (contextRef?.scenarioIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 3);
      const single = contextRef?.scenarioId?.trim();
      const ids = multi.length > 0 ? multi : single ? [single] : [];

      if (ids.length === 0) {
        throw new AIError(
          "INSUFFICIENT_CONTEXT",
          "Pilih skenario Decision Lab terlebih dahulu.",
          400
        );
      }

      if (ids.length === 1) {
        const scenario = await getScenario(userId, ids[0]!);
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
                income: (scenario.baselineSnapshot as { income?: number })
                  .income,
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
                endingBalance: (
                  scenario.baselineSnapshot as { endingBalance?: number }
                ).endingBalance,
              },
              rulesVersion: scenario.rulesVersion,
            },
          },
        };
      }

      const loaded = await Promise.all(
        ids.map((id) => getScenario(userId, id))
      );
      if (loaded.some((s) => !s)) {
        throw new AIError(
          "INSUFFICIENT_CONTEXT",
          "Satu atau lebih skenario tidak ditemukan atau bukan milik Anda.",
          404
        );
      }
      const scenarios = loaded as NonNullable<(typeof loaded)[number]>[];
      const currencies = new Set(scenarios.map((s) => s.currency));
      const dataLimitations: string[] = [];
      if (currencies.size > 1) {
        dataLimitations.push(
          "scenarios_mixed_currency — bandingkan hanya dalam mata uang yang sama"
        );
      }

      const comparison = (await compareUserScenarios(userId, ids)) as {
        warning?: string | null;
        bestCashFlowId: string | null;
        bestEndingBalanceId: string | null;
        fastestDebtPayoffId: string | null;
      };
      if (comparison.warning) {
        dataLimitations.push(comparison.warning);
      }

      return {
        currency: scenarios[0]!.currency,
        period: {
          year: period.year,
          month: period.month,
          label: (
            scenarios[0]!.baselineSnapshot as { cycleLabel?: string }
          )?.cycleLabel,
        },
        contextType,
        dataLimitations,
        payload: {
          scenarioCompare: {
            ids,
            warning: comparison.warning ?? null,
            bestCashFlowId: comparison.bestCashFlowId,
            bestEndingBalanceId: comparison.bestEndingBalanceId,
            fastestDebtPayoffId: comparison.fastestDebtPayoffId,
            rows: scenarios.map((s) => ({
              id: s.id,
              name: s.name,
              currency: s.currency,
              assumptions: s.assumptions,
              results: s.results,
              baseline: {
                income: (s.baselineSnapshot as { income?: number }).income,
                expenses: (s.baselineSnapshot as { expenses?: number }).expenses,
                debtPayment: (s.baselineSnapshot as { debtPayment?: number })
                  .debtPayment,
                liquidAssets: (s.baselineSnapshot as { liquidAssets?: number })
                  .liquidAssets,
                debtBalance: (s.baselineSnapshot as { debtBalance?: number })
                  .debtBalance,
              },
              rulesVersion: s.rulesVersion,
            })),
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

    case "decision_advisor": {
      const user = await User.findById(userId)
        .select("decisionPreference")
        .lean();
      let preference: DecisionPreference = "UNSET";
      if (
        contextRef?.decisionPreference &&
        isDecisionPreference(contextRef.decisionPreference)
      ) {
        preference = contextRef.decisionPreference;
      } else if (isDecisionPreference(user?.decisionPreference)) {
        preference = user.decisionPreference;
      }

      const [health, forecast, actions, roadmap] = await Promise.all([
        getFinancialHealth(userId, period),
        getHorizonCashFlowForecast(userId, 30),
        getActionCenter(userId, {
          searchParams: new URLSearchParams({
            year: String(period.year),
            month: String(period.month),
          }),
        }),
        evaluateWealthLadder(userId, period),
      ]);

      if (health.quality?.length) {
        dataLimitations.push(...health.quality);
      }
      if (forecast.limitations?.length) {
        dataLimitations.push(...forecast.limitations.slice(0, 3));
      }
      if (preference === "UNSET") {
        dataLimitations.push(
          "decision_preference_unset — preferensi pengguna belum ditetapkan"
        );
      }
      if (roadmap.starterGoalMissing) {
        dataLimitations.push("starter_goal_missing");
      }

      let scenarioCompare: Record<string, unknown> | null = null;
      const ids = (contextRef?.scenarioIds ?? []).slice(0, 3);
      if (ids.length >= 1) {
        const loaded = await Promise.all(
          ids.map((id) => getScenario(userId, id))
        );
        if (loaded.some((s) => !s)) {
          throw new AIError(
            "INSUFFICIENT_CONTEXT",
            "Satu atau lebih skenario tidak ditemukan atau bukan milik Anda.",
            404
          );
        }
        const scenarios = loaded as NonNullable<(typeof loaded)[number]>[];
        const currencies = new Set(scenarios.map((s) => s.currency));
        if (currencies.size > 1) {
          dataLimitations.push(
            "scenarios_mixed_currency — bandingkan hanya dalam mata uang yang sama"
          );
        }
        const comparison = (await compareUserScenarios(userId, ids)) as {
          warning?: string | null;
          bestCashFlowId: string | null;
          bestEndingBalanceId: string | null;
          fastestDebtPayoffId: string | null;
        };
        if (comparison.warning) {
          dataLimitations.push(comparison.warning);
        }
        scenarioCompare = {
          ids,
          warning: comparison.warning ?? null,
          bestCashFlowId: comparison.bestCashFlowId,
          bestEndingBalanceId: comparison.bestEndingBalanceId,
          fastestDebtPayoffId: comparison.fastestDebtPayoffId,
          rows: scenarios.map((s) => ({
            id: s.id,
            name: s.name,
            currency: s.currency,
            assumptions: s.assumptions,
            results: s.results,
            baseline: {
              income: (s.baselineSnapshot as { income?: number }).income,
              expenses: (s.baselineSnapshot as { expenses?: number }).expenses,
              debtPayment: (s.baselineSnapshot as { debtPayment?: number })
                .debtPayment,
              liquidAssets: (s.baselineSnapshot as { liquidAssets?: number })
                .liquidAssets,
              debtBalance: (s.baselineSnapshot as { debtBalance?: number })
                .debtBalance,
            },
          })),
        };
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
          decisionAdvisor: {
            preference: {
              code: preference,
              labelId: DECISION_PREFERENCE_LABELS[preference].id,
              isSet: preference !== "UNSET",
            },
            financialHealth: {
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
            },
            forecast30d: {
              endingBalance: forecast.endingBalance,
              lowestBalance: forecast.lowestBalance,
              shortfallCount: forecast.shortfalls.length,
              nextShortfall: forecast.shortfalls[0]
                ? {
                    date: forecast.shortfalls[0].date,
                    balanceAfter: forecast.shortfalls[0].balanceAfter,
                    causingLabel: forecast.shortfalls[0].causingLabel,
                  }
                : null,
              assumptions: forecast.assumptions?.slice(0, 4),
              limitations: forecast.limitations?.slice(0, 3),
            },
            actionCenter: {
              counts: actions.counts,
              top: actions.actions.slice(0, 6).map((a) => ({
                issueKey: a.issueKey,
                type: a.type,
                priority: a.priority,
                title: a.title,
                message: a.message,
              })),
            },
            roadmap: {
              currentStep: roadmap.currentStep,
              progressPercent: roadmap.progressPercent,
              focus:
                roadmap.steps.find(
                  (s) => s.status === "FOCUS" || s.status === "UNKNOWN"
                ) ?? null,
              steps: roadmap.steps.map((s) => ({
                id: s.id,
                title: s.title,
                status: s.status,
                reason: s.reason,
              })),
            },
            scenarioCompare,
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
