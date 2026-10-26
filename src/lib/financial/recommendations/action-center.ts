import { FinancialRecommendation } from "@/models/FinancialRecommendation";
import { getAlertsForUser, type AppAlert } from "@/lib/financial/alerts";
import {
  ALERT_INSIGHT_OVERLAP,
  alertKindToIssueType,
  buildIssueKey,
  extractEntityFromAlertId,
} from "@/lib/financial/recommendations/issue-key";
import {
  alertSeverityToPriority,
  insightPriorityToAction,
  sortActionItems,
  type ActionPriority,
} from "@/lib/financial/recommendations/priority";
import { parsePeriod } from "@/lib/financial/phase2-service";
import {
  generatePhase2Insights,
} from "@/lib/financial/phase2-service";
import { persistInsightsUpsert } from "@/lib/financial/recommendations/persist";
import type { Period } from "@/lib/financial/phase2-types";

export type ActionItem = {
  id: string;
  issueKey: string;
  source: "ALERT" | "RECOMMENDATION";
  type: string;
  priority: ActionPriority;
  title: string;
  message: string;
  href?: string;
  status?: string;
  dueDate?: string | null;
  evaluatedAt?: string | null;
  ruleVersion?: string | null;
  provenance?: unknown;
  period?: Period | null;
  actionType?: string | null;
};

function alertToAction(alert: AppAlert, period: Period): ActionItem {
  const { entityId } = extractEntityFromAlertId(alert.id);
  const type = alertKindToIssueType(alert.kind);
  const issueKey = buildIssueKey({
    type,
    debtId: alert.kind.startsWith("DEBT") ? entityId : null,
    categoryId: alert.kind.startsWith("BUDGET") ? entityId : null,
    goalId: null,
    period: alert.kind.startsWith("BUDGET") ? period : null,
    suffix: alert.dueDate?.slice(0, 10) ?? null,
  });

  return {
    id: alert.id,
    issueKey,
    source: "ALERT",
    type,
    priority: alertSeverityToPriority(alert.severity),
    title: alert.title,
    message: alert.message,
    href: alert.href,
    dueDate: alert.dueDate ?? null,
    evaluatedAt: new Date().toISOString(),
    provenance: {
      sources: ["live-alerts", alert.kind],
      alertId: alert.id,
    },
    period: alert.kind.startsWith("BUDGET") ? period : null,
  };
}

function recommendationHref(actionType?: string | null): string {
  switch (actionType) {
    case "VIEW_DEBT":
      return "/debts";
    case "VIEW_BUDGET":
    case "VIEW_BUDGET_REC":
      return "/budget";
    case "VIEW_GOALS":
      return "/goals";
    case "VIEW_SPENDING":
      return "/transactions";
    case "SIMULATE":
      return "/simulator";
    default:
      return "/insights";
  }
}

/**
 * Cross-engine dedup: drop recommendation if a live alert already covers
 * the same entity with an overlapping type family.
 */
export function dedupeActions(items: ActionItem[]): ActionItem[] {
  const alertEntities = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.source !== "ALERT") continue;
    const kind = item.type.replace(/^ALERT_/, "");
    const entity =
      item.issueKey.split(":")[1] ?? "global";
    const set = alertEntities.get(entity) ?? new Set();
    set.add(kind);
    alertEntities.set(entity, set);
  }

  return items.filter((item) => {
    if (item.source !== "RECOMMENDATION") return true;
    const entity = item.issueKey.split(":")[1] ?? "global";
    const alertKinds = alertEntities.get(entity);
    if (!alertKinds) return true;
    for (const alertKind of alertKinds) {
      const overlap = ALERT_INSIGHT_OVERLAP[alertKind] ?? [];
      if (overlap.includes(item.type)) return false;
    }
    return true;
  });
}

export async function getActionCenter(
  userId: string,
  opts?: { refresh?: boolean; searchParams?: URLSearchParams }
) {
  const params = opts?.searchParams ?? new URLSearchParams();
  const period = await parsePeriod(params, userId);

  if (opts?.refresh) {
    const insights = await generatePhase2Insights(userId, period);
    await persistInsightsUpsert(userId, period, insights);
  } else {
    const activeCount = await FinancialRecommendation.countDocuments({
      userId,
      "period.year": period.year,
      "period.month": period.month,
      status: { $in: ["NEW", "VIEWED"] },
      issueKey: { $exists: true, $ne: null },
    });
    if (activeCount === 0) {
      const insights = await generatePhase2Insights(userId, period);
      await persistInsightsUpsert(userId, period, insights);
    }
  }

  const [alerts, recommendations] = await Promise.all([
    getAlertsForUser(userId),
    FinancialRecommendation.find({
      userId,
      status: { $in: ["NEW", "VIEWED", "ACCEPTED"] },
    })
      .sort({ priority: 1, updatedAt: -1 })
      .limit(100)
      .lean(),
  ]);

  const alertActions = alerts.map((a) => alertToAction(a, period));
  const recActions: ActionItem[] = recommendations.map((r) => ({
    id: r._id.toString(),
    issueKey:
      r.issueKey ??
      buildIssueKey({
        type: r.type,
        categoryId: r.categoryId?.toString(),
        debtId: r.debtId?.toString(),
        goalId: r.goalId?.toString(),
        period: r.period as Period | undefined,
      }),
    source: "RECOMMENDATION",
    type: r.type,
    priority: insightPriorityToAction(
      (r.priority as "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM"
    ),
    title: r.title,
    message: r.message,
    href: recommendationHref(r.actionType),
    status: r.status,
    dueDate: null,
    evaluatedAt: r.evaluatedAt
      ? new Date(r.evaluatedAt).toISOString()
      : r.updatedAt
        ? new Date(r.updatedAt).toISOString()
        : null,
    ruleVersion: r.ruleVersion ?? null,
    provenance: r.provenance ?? { sources: ["financial-recommendation"] },
    period: (r.period as Period) ?? null,
    actionType: r.actionType ?? null,
  }));

  // Hide ACCEPTED from default "needs attention" list but keep count
  const actionableRecs = recActions.filter((r) => r.status !== "ACCEPTED");
  const merged = dedupeActions([...alertActions, ...actionableRecs]);
  const actions = sortActionItems(merged);

  return {
    period,
    actions,
    counts: {
      total: actions.length,
      critical: actions.filter((a) => a.priority === "CRITICAL").length,
      high: actions.filter((a) => a.priority === "HIGH").length,
      alerts: alertActions.length,
      recommendations: actionableRecs.length,
      accepted: recActions.filter((r) => r.status === "ACCEPTED").length,
    },
  };
}
