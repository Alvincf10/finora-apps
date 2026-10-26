import type { Period } from "@/lib/financial/phase2-types";

/** Stable problem identity for deduplication (FR-05.3). */
export function buildIssueKey(input: {
  type: string;
  categoryId?: string | null;
  debtId?: string | null;
  goalId?: string | null;
  period?: Period | null;
  /** Extra discriminator (e.g. due date for recurring alerts). */
  suffix?: string | null;
}): string {
  const entity =
    input.debtId ?? input.categoryId ?? input.goalId ?? "global";
  const periodKey =
    input.period != null
      ? `${input.period.year}-${String(input.period.month).padStart(2, "0")}`
      : "rolling";
  const suffix = input.suffix ? `:${input.suffix}` : "";
  return `${input.type}:${entity}:${periodKey}${suffix}`;
}

/** Map overlapping alert kinds ↔ insight types for cross-engine dedup. */
export const ALERT_INSIGHT_OVERLAP: Record<string, string[]> = {
  DEBT_OVERDUE: ["DEBT_PAYMENT_RISK", "DEBT_PAYMENT_OVERDUE"],
  DEBT_DUE_SOON: ["DEBT_PAYMENT_RISK"],
  BUDGET_OVERFLOW: ["BUDGET_OVERFLOW", "OVER_BUDGET"],
  BUDGET_WARNING: ["BUDGET_WARNING"],
};

export function extractEntityFromAlertId(alertId: string): {
  kind: string;
  entityId: string | null;
} {
  // debt-overdue:{id} | debt-due:{id}:{date} | fixed:{id}:{date} | budget-over:{cat}:{y-m}
  const parts = alertId.split(":");
  if (parts[0] === "debt-overdue" || parts[0] === "debt-due") {
    return { kind: parts[0], entityId: parts[1] ?? null };
  }
  if (parts[0] === "budget-over" || parts[0] === "budget-warn") {
    return { kind: parts[0], entityId: parts[1] ?? null };
  }
  if (parts[0] === "fixed") {
    return { kind: parts[0], entityId: parts[1] ?? null };
  }
  return { kind: parts[0] ?? "unknown", entityId: null };
}

export function alertKindToIssueType(kind: string): string {
  return `ALERT_${kind}`;
}
