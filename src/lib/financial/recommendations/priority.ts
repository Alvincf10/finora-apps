export type ActionPriority =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO";

const RANK: Record<ActionPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export function priorityRank(p: ActionPriority): number {
  return RANK[p] ?? 99;
}

export function compareActionPriority(a: ActionPriority, b: ActionPriority) {
  return priorityRank(a) - priorityRank(b);
}

/** Documented mapping: alert severity → action priority. */
export function alertSeverityToPriority(
  severity: "CRITICAL" | "WARNING" | "INFO"
): ActionPriority {
  if (severity === "CRITICAL") return "CRITICAL";
  if (severity === "WARNING") return "HIGH";
  return "INFO";
}

/** Insight HIGH/MEDIUM/LOW → action priority (HIGH stays HIGH, not CRITICAL). */
export function insightPriorityToAction(
  priority: "HIGH" | "MEDIUM" | "LOW"
): ActionPriority {
  return priority;
}

/**
 * Explicit composite sort key components (FR-05.2 — no mystery score).
 * Order: priority rank → due soonest → newer evaluation.
 */
export function sortActionItems<
  T extends {
    priority: ActionPriority;
    dueDate?: string | null;
    evaluatedAt?: string | null;
  },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pr = compareActionPriority(a.priority, b.priority);
    if (pr !== 0) return pr;
    const ad = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    const ae = a.evaluatedAt ? Date.parse(a.evaluatedAt) : 0;
    const be = b.evaluatedAt ? Date.parse(b.evaluatedAt) : 0;
    return be - ae;
  });
}
