import { addDays, format, startOfDay } from "date-fns";
import type {
  CashShortfall,
  ForecastBalancePoint,
  ForecastEvent,
  ForecastHorizonDays,
  HorizonCashFlowForecast,
} from "@/lib/financial/forecast/types";
import type { Currency } from "@/types";

export const FORECAST_RULES_VERSION = "phase2-fr02-1";

export function toDateKey(d: Date): string {
  return format(startOfDay(d), "yyyy-MM-dd");
}

export function signedAmount(event: ForecastEvent): number {
  return event.direction === "IN" ? event.amount : -event.amount;
}

/**
 * Project cash balance over a horizon from dated events + optional daily variable burn.
 * Deterministic: same inputs → same outputs. Does not write ledger data.
 */
export function projectHorizonCashFlow(input: {
  currency: Currency;
  horizonDays: ForecastHorizonDays;
  asOf: Date;
  startingBalance: number;
  events: ForecastEvent[];
  /** Assumed discretionary spend applied at end of each day (OUT). */
  dailyVariableSpend?: number;
  incomeClass: HorizonCashFlowForecast["incomeClass"];
  assumptions: string[];
  limitations: string[];
  cycleComparison?: HorizonCashFlowForecast["cycleComparison"];
  allocatedCash?: number | null;
  unallocatedHint?: number | null;
}): Omit<HorizonCashFlowForecast, "evaluatedAt"> {
  const asOf = startOfDay(input.asOf);
  const horizonEnd = startOfDay(addDays(asOf, input.horizonDays - 1));
  const startKey = toDateKey(asOf);
  const endKey = toDateKey(horizonEnd);

  const inWindow = input.events.filter(
    (e) => e.date >= startKey && e.date <= endKey && e.amount > 0
  );

  const byDate = new Map<string, ForecastEvent[]>();
  for (const e of inWindow) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  // Stable order within a day: inflows first, then fixed, debt, variable
  const kindOrder: Record<ForecastEvent["kind"], number> = {
    INCOME: 0,
    FIXED_COST: 1,
    DEBT: 2,
    VARIABLE_SPEND: 3,
  };

  let balance = input.startingBalance;
  let totalInflows = 0;
  let totalOutflows = 0;
  let lowestBalance = balance;
  let lowestBalanceDate: string | null = toDateKey(asOf);
  const series: ForecastBalancePoint[] = [];
  const shortfalls: CashShortfall[] = [];
  const appliedEvents: ForecastEvent[] = [...inWindow];
  const dailyVariable = Math.max(0, input.dailyVariableSpend ?? 0);

  for (let i = 0; i < input.horizonDays; i++) {
    const day = addDays(asOf, i);
    const date = toDateKey(day);
    const dayEvents = [...(byDate.get(date) ?? [])].sort((a, b) => {
      const k = kindOrder[a.kind] - kindOrder[b.kind];
      if (k !== 0) return k;
      return a.id.localeCompare(b.id);
    });

    if (dailyVariable > 0) {
      const variableEvent: ForecastEvent = {
        id: `var:${date}`,
        date,
        kind: "VARIABLE_SPEND",
        amount: dailyVariable,
        direction: "OUT",
        label: "Assumed daily variable spend",
        source: "historical_variable_average",
      };
      dayEvents.push(variableEvent);
      appliedEvents.push(variableEvent);
    }

    const eventIds: string[] = [];
    for (const event of dayEvents) {
      const delta = signedAmount(event);
      balance += delta;
      eventIds.push(event.id);
      if (delta >= 0) totalInflows += delta;
      else totalOutflows += -delta;

      if (balance < 0) {
        shortfalls.push({
          date,
          balanceAfter: balance,
          causingEventId: event.id,
          causingLabel: event.label,
          causingKind: event.kind,
          amount: event.amount,
        });
      }
    }

    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestBalanceDate = date;
    }

    series.push({ date, balance, eventIds });
  }

  // Deduplicate shortfall spam: keep first shortfall per causingEventId+date
  const seen = new Set<string>();
  const uniqueShortfalls = shortfalls.filter((s) => {
    const key = `${s.date}:${s.causingEventId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    currency: input.currency,
    horizonDays: input.horizonDays,
    asOf: startKey,
    horizonEnd: endKey,
    startingBalance: input.startingBalance,
    endingBalance: balance,
    lowestBalance,
    lowestBalanceDate,
    totalInflows,
    totalOutflows,
    netCashFlow: totalInflows - totalOutflows,
    incomeClass: input.incomeClass,
    events: appliedEvents,
    series,
    shortfalls: uniqueShortfalls,
    assumptions: input.assumptions,
    limitations: input.limitations,
    cycleComparison: input.cycleComparison ?? null,
    allocatedCash: input.allocatedCash ?? null,
    unallocatedHint: input.unallocatedHint ?? null,
    rulesVersion: FORECAST_RULES_VERSION,
  };
}
