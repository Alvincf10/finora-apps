import { FinancialRecommendation } from "@/models/FinancialRecommendation";
import type { InsightRecommendation } from "@/lib/financial/phase2-types";
import type { Period } from "@/lib/financial/phase2-types";
import { buildIssueKey } from "@/lib/financial/recommendations/issue-key";

export const RECOMMENDATION_RULES_VERSION = "phase5-fr05-1";

/**
 * Upsert insights by stable issueKey.
 * Preserves ACCEPTED / DISMISSED / EXPIRED — does not recreate those issues.
 * Refreshes NEW / VIEWED content in place.
 */
export async function persistInsightsUpsert(
  userId: string,
  period: Period,
  insights: InsightRecommendation[]
) {
  const evaluatedAt = new Date();
  const keptKeys = new Set<string>();
  const results = [];

  for (const insight of insights) {
    const issueKey = buildIssueKey({
      type: insight.type,
      categoryId: insight.categoryId,
      debtId: insight.debtId,
      goalId: insight.goalId,
      period,
    });
    keptKeys.add(issueKey);

    const existing = await FinancialRecommendation.findOne({
      userId,
      issueKey,
    });

    if (existing) {
      if (
        existing.status === "ACCEPTED" ||
        existing.status === "DISMISSED" ||
        existing.status === "EXPIRED"
      ) {
        // Do not resurrect dismissed/accepted issues on refresh
        results.push(existing);
        continue;
      }

      existing.type = insight.type;
      existing.priority = insight.priority;
      existing.title = insight.title;
      existing.message = insight.message;
      existing.categoryId = insight.categoryId as never;
      existing.debtId = insight.debtId as never;
      existing.goalId = insight.goalId as never;
      existing.currentValue = insight.currentValue;
      existing.recommendedValue = insight.recommendedValue;
      existing.difference = insight.difference;
      existing.evidence = insight.evidence as never;
      existing.actionType = insight.actionType;
      existing.period = period;
      existing.ruleVersion = RECOMMENDATION_RULES_VERSION;
      existing.evaluatedAt = evaluatedAt;
      existing.provenance = {
        sources: ["phase2-insights", insight.type],
        evidence: insight.evidence,
      };
      if (existing.status === "NEW" || existing.status === "VIEWED") {
        // keep status
      }
      await existing.save();
      results.push(existing);
      continue;
    }

    const created = await FinancialRecommendation.create({
      userId,
      issueKey,
      type: insight.type,
      priority: insight.priority,
      title: insight.title,
      message: insight.message,
      categoryId: insight.categoryId,
      debtId: insight.debtId,
      goalId: insight.goalId,
      currentValue: insight.currentValue,
      recommendedValue: insight.recommendedValue,
      difference: insight.difference,
      evidence: insight.evidence,
      actionType: insight.actionType,
      status: "NEW",
      period,
      ruleVersion: RECOMMENDATION_RULES_VERSION,
      evaluatedAt,
      provenance: {
        sources: ["phase2-insights", insight.type],
        evidence: insight.evidence,
      },
    });
    results.push(created);
  }

  // Expire stale NEW/VIEWED for this period that were not regenerated
  await FinancialRecommendation.updateMany(
    {
      userId,
      "period.year": period.year,
      "period.month": period.month,
      status: { $in: ["NEW", "VIEWED"] },
      issueKey: { $nin: [...keptKeys] },
    },
    {
      $set: {
        status: "EXPIRED",
        evaluatedAt,
      },
    }
  );

  return results;
}
