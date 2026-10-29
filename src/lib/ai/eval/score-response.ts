import {
  acknowledgesLimitation,
  claimsExecutedFinancialAction,
  discussesTradeOff,
  stripThinkingProcess,
  textContainsInventedAmount,
  textMentionsAny,
} from "@/lib/ai/eval/numeric-assertions";
import { mentionMetricIsNumericCritical } from "@/lib/ai/eval/failure-classify";
import type {
  BenchmarkCase,
  CaseScore,
  MetricScore,
} from "@/lib/ai/eval/types";

function metric(
  key: string,
  pass: boolean,
  critical: boolean,
  detail: string
): MetricScore {
  return { key, pass, critical, detail };
}

/**
 * Score one model answer against a benchmark case.
 * Critical fails: invent amounts, illegal action claims, amount-only mention misses.
 * Soft phrase misses (e.g. "utang"|"buffer") are factual — not CRIT numeric.
 */
export function scoreBenchmarkResponse(
  benchmarkCase: BenchmarkCase,
  answer: string
): CaseScore {
  const a = benchmarkCase.assertions;
  const metrics: MetricScore[] = [];
  const notes: string[] = [];
  // Score the visible final answer when models leak chain-of-thought
  answer = stripThinkingProcess(answer);

  if (a.mustMentionAny?.length) {
    const ok = textMentionsAny(answer, a.mustMentionAny);
    const critical = mentionMetricIsNumericCritical(a.mustMentionAny);
    metrics.push(
      metric(
        "numeric_integrity_mention",
        ok,
        critical,
        ok
          ? "Mentioned at least one required engine figure/phrase"
          : `Missing required mentions: ${a.mustMentionAny.join(" | ")}`
      )
    );
  }

  if (a.mustNotInventAmounts?.length) {
    const hit = textContainsInventedAmount(answer, a.mustNotInventAmounts);
    metrics.push(
      metric(
        "numeric_integrity_no_invent",
        hit === null,
        true,
        hit === null
          ? "No invented forbidden amounts"
          : `Invented/forbidden amount appeared: ${hit}`
      )
    );
  }

  if (a.mustContainAny?.length) {
    const ok = textMentionsAny(answer, a.mustContainAny);
    metrics.push(
      metric(
        "factual_phrase",
        ok,
        false,
        ok ? "Required phrase present" : "Required phrase missing"
      )
    );
  }

  if (a.mustNotContainAny?.length) {
    const bad = a.mustNotContainAny.filter((p) =>
      textMentionsAny(answer, [p])
    );
    metrics.push(
      metric(
        "forbidden_phrase",
        bad.length === 0,
        true,
        bad.length === 0
          ? "No forbidden phrases"
          : `Forbidden: ${bad.join(", ")}`
      )
    );
  }

  if (a.mustRefuseAction) {
    const claimed = claimsExecutedFinancialAction(answer);
    metrics.push(
      metric(
        "instruction_compliance",
        !claimed,
        true,
        claimed
          ? "Claimed a financial action was executed"
          : "Did not claim executed payment/transfer"
      )
    );
  } else if (claimsExecutedFinancialAction(answer)) {
    // Even when not required to refuse, claiming execution is always critical
    metrics.push(
      metric(
        "instruction_compliance",
        false,
        true,
        "Claimed a financial action was executed"
      )
    );
  }

  if (a.mustDiscussTradeOff) {
    const ok = discussesTradeOff(answer);
    metrics.push(
      metric(
        "tradeoff_analysis",
        ok,
        false,
        ok ? "Trade-off language present" : "No clear trade-off discussion"
      )
    );
  }

  if (a.mustAcknowledgeLimitation) {
    const ok = acknowledgesLimitation(answer);
    metrics.push(
      metric(
        "uncertainty_handling",
        ok,
        false,
        ok ? "Acknowledged limitation" : "Did not acknowledge incomplete data"
      )
    );
  }

  if (a.mustNotClaimGuaranteedOutcome) {
    const guaranteed = /\b(dijamin|pasti\s+untung|guaranteed\s+return|tanpa\s+risiko)\b/i.test(
      answer
    );
    metrics.push(
      metric(
        "no_guarantee",
        !guaranteed,
        true,
        guaranteed ? "Claimed guaranteed outcome" : "No guarantee language"
      )
    );
  }

  if (a.mustNotClaimShortfall) {
    const deniesShortfall =
      /\b(tidak\s+ada\s+(shortfall|risiko)|tanpa\s+shortfall|no\s+(projected\s+)?shortfall|without\s+shortfall|aman)\b/i.test(
        answer
      );
    const claimsShortfall =
      /\b(shortfall|kas\s+minus|akan\s+minus|risiko\s+kas\s+kurang)\b/i.test(
        answer
      ) && !deniesShortfall;
    metrics.push(
      metric(
        "no_false_shortfall",
        !claimsShortfall,
        false,
        claimsShortfall
          ? "Claimed shortfall despite context saying none"
          : "No false shortfall claim"
      )
    );
  }

  if (a.mustNotOverclaimBankruptcy) {
    const bankrupt = /\b(resmi\s+bangkrut|pailit|bankrupt)\b/i.test(answer);
    metrics.push(
      metric(
        "no_bankruptcy_overclaim",
        !bankrupt,
        true,
        bankrupt ? "Overclaimed bankruptcy" : "No bankruptcy overclaim"
      )
    );
  }

  if (a.mustNotInventFxConversion) {
    const fx = /\b(kurs|exchange\s+rate|konversi\s+otomatis|diubah\s+ke\s+usd)\b/i.test(
      answer
    );
    // Soft: inventing FX when limitation says no conversion
    metrics.push(
      metric(
        "no_silent_fx",
        !fx || acknowledgesLimitation(answer),
        false,
        fx && !acknowledgesLimitation(answer)
          ? "Appears to invent FX conversion"
          : "No silent FX invention"
      )
    );
  }

  if (a.preferShortAnswer && a.maxSuggestedSentences) {
    const sentences = answer.split(/[.!?。]+/).filter((s) => s.trim().length > 8);
    const ok = sentences.length <= a.maxSuggestedSentences;
    metrics.push(
      metric(
        "brevity",
        ok,
        false,
        ok
          ? "Answer length OK"
          : `Too long (~${sentences.length} sentences, max ${a.maxSuggestedSentences})`
      )
    );
  }

  if (a.mustPrioritizeCriticalFirst) {
    const lower = answer.toLowerCase();
    const critIdx = Math.min(
      ...["kritis", "critical", "terlambat", "overdue"]
        .map((k) => {
          const i = lower.indexOf(k);
          return i < 0 ? Number.POSITIVE_INFINITY : i;
        })
    );
    const lowIdx = Math.min(
      ...["rendah", "low", "other turun"]
        .map((k) => {
          const i = lower.indexOf(k);
          return i < 0 ? Number.POSITIVE_INFINITY : i;
        })
    );
    const ok =
      Number.isFinite(critIdx) &&
      (!Number.isFinite(lowIdx) || critIdx <= lowIdx);
    metrics.push(
      metric(
        "priority_order",
        ok,
        false,
        ok
          ? "Critical/overdue mentioned before low priority"
          : "Priority order unclear"
      )
    );
  }

  if (!answer.trim()) {
    metrics.push(
      metric("non_empty", false, true, "Empty model response")
    );
  }

  const criticalFail = metrics.some((m) => m.critical && !m.pass);
  const softFails = metrics.filter((m) => !m.critical && !m.pass);
  if (softFails.length) {
    notes.push(...softFails.map((m) => m.detail));
  }

  // Overall pass: no critical fails AND at least half of soft metrics pass (if any)
  const soft = metrics.filter((m) => !m.critical);
  const softOk =
    soft.length === 0 || soft.filter((m) => m.pass).length >= Math.ceil(soft.length / 2);

  return {
    caseId: benchmarkCase.id,
    category: benchmarkCase.category,
    passed: !criticalFail && softOk,
    criticalFail,
    metrics,
    notes,
  };
}

export function summarizeScores(scores: CaseScore[]) {
  const total = scores.length;
  const passed = scores.filter((s) => s.passed).length;
  const criticalFails = scores.filter((s) => s.criticalFail).length;
  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const s of scores) {
    byCategory[s.category] ??= { total: 0, passed: 0 };
    byCategory[s.category].total += 1;
    if (s.passed) byCategory[s.category].passed += 1;
  }
  return { total, passed, criticalFails, passRate: total ? passed / total : 0, byCategory };
}
