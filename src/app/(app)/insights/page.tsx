"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Insight = {
  _id: string;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  message: string;
  evidence?: Array<Record<string, unknown>>;
  actionType?: string;
  status: string;
  currentValue?: number;
  recommendedValue?: number;
  difference?: number;
};

type LadderStepStatus =
  | "COMPLETED"
  | "FOCUS"
  | "LOCKED"
  | "NOT_APPLICABLE"
  | "UNKNOWN"
  | "DONE"
  | "CURRENT"
  | "UPCOMING";

type LadderStep = {
  id: number;
  title: string;
  description: string;
  status: LadderStepStatus;
  reason?: string;
  progress?: number;
  detail?: string;
  actionType: string;
};

type WealthLadder = {
  currentStep: number | null;
  completedCount: number;
  totalSteps: number;
  applicableSteps?: number;
  progressPercent?: number;
  currency: Currency;
  steps: LadderStep[];
};

function isLadderFocus(status: LadderStepStatus) {
  return status === "FOCUS" || status === "CURRENT" || status === "UNKNOWN";
}

function isLadderDone(status: LadderStepStatus) {
  return status === "COMPLETED" || status === "DONE";
}

function isLadderLocked(status: LadderStepStatus) {
  return (
    status === "LOCKED" ||
    status === "UPCOMING" ||
    status === "NOT_APPLICABLE"
  );
}

type InsightsPayload = {
  insights: Insight[];
  ladder: WealthLadder;
};

type InsightGroup = "spending" | "cashflow" | "debt" | "protection" | "other";

function ladderHref(actionType: string) {
  if (actionType === "VIEW_ACCOUNTS") return "/accounts";
  if (actionType === "VIEW_DEBT") return "/debts";
  if (actionType === "VIEW_GOALS") return "/goals";
  if (actionType === "VIEW_BUDGET_REC") return "/budget/recommendation";
  if (actionType === "VIEW_SPENDING") return "/transactions";
  return "/insights";
}

const MONEY_KEYS = new Set([
  "current",
  "average3m",
  "threshold",
  "budget",
  "projected",
  "income",
  "expense",
  "fund",
  "essentialMonthly",
  "currentPayment",
  "boostedPayment",
]);

const EVIDENCE_KEY_MAP: Record<string, string> = {
  current: "insights.evidenceCurrent",
  average3m: "insights.evidenceAverage3m",
  threshold: "insights.evidenceThreshold",
  budget: "insights.evidenceBudget",
  projected: "insights.evidenceProjected",
  changePercent: "insights.evidenceChangePercent",
  income: "insights.evidenceIncome",
  expense: "insights.evidenceExpense",
  fund: "insights.evidenceFund",
  essentialMonthly: "insights.evidenceEssentialMonthly",
  targetMonths: "insights.evidenceTargetMonths",
  currentMonths: "insights.evidenceCurrentMonths",
  boostedMonths: "insights.evidenceBoostedMonths",
  currentPayment: "insights.evidenceCurrentPayment",
  boostedPayment: "insights.evidenceBoostedPayment",
  metric: "insights.evidenceMetric",
};

const GROUP_TYPES: Record<InsightGroup, Set<string>> = {
  spending: new Set([
    "SPENDING_INCREASE",
    "SPENDING_DECREASE",
    "UNUSUAL_CATEGORY_SPENDING",
    "BUDGET_WARNING",
    "BUDGET_OVERFLOW",
    "PROJECTED_BUDGET_OVERFLOW",
    "BUDGET_CONFLICT",
  ]),
  cashflow: new Set([
    "SAVINGS_OPPORTUNITY",
    "SAVINGS_TARGET_RISK",
    "CASHFLOW_RISK",
    "INCOME_CHANGE",
  ]),
  debt: new Set(["DEBT_PAYMENT_RISK", "DEBT_PAYOFF_SCENARIO"]),
  protection: new Set(["EMERGENCY_FUND_GAP"]),
  other: new Set(),
};

const GROUP_ORDER: InsightGroup[] = [
  "spending",
  "cashflow",
  "debt",
  "protection",
  "other",
];

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

function insightGroup(type: string): InsightGroup {
  for (const group of GROUP_ORDER) {
    if (group === "other") continue;
    if (GROUP_TYPES[group].has(type)) return group;
  }
  return "other";
}

function formatEvidenceValue(
  key: string,
  value: unknown,
  currency: Currency,
  intlLocale: string
): string | null {
  if (value == null) return null;
  if (key === "metric") return null;
  if (key === "dueDate" && (typeof value === "string" || value instanceof Date)) {
    return new Date(value).toLocaleDateString(intlLocale);
  }
  if (typeof value === "number") {
    if (key === "changePercent") return `${value}%`;
    if (MONEY_KEYS.has(key) || key.toLowerCase().includes("amount")) {
      return formatMoney(value, currency, intlLocale);
    }
    if (
      key.includes("Months") ||
      key === "targetMonths" ||
      key === "coverage"
    ) {
      return String(value);
    }
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return formatMoney(value, currency, intlLocale);
    }
    return String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function EvidenceList({
  evidence,
  currency = "IDR",
}: {
  evidence: Array<Record<string, unknown>>;
  currency?: Currency;
}) {
  const { t, intlLocale } = useI18n();
  const rows = evidence.flatMap((item) =>
    Object.entries(item)
      .map(([key, value]) => {
        const formatted = formatEvidenceValue(
          key,
          value,
          currency,
          intlLocale
        );
        if (formatted == null) return null;
        const labelKey = EVIDENCE_KEY_MAP[key];
        return {
          key,
          label: labelKey ? t(labelKey) : key,
          value: formatted,
        };
      })
      .filter((r): r is { key: string; label: string; value: string } => r != null)
  );

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm sm:grid-cols-3">
      {rows.map((row) => (
        <div key={`${row.key}-${row.value}`} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="truncate font-mono tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InsightCard({
  item,
  emphasize,
  onAccept,
  onDismiss,
}: {
  item: Insight;
  emphasize?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();

  function actionLabel(actionType?: string) {
    if (actionType === "VIEW_BUDGET") return t("insights.actionBudget");
    if (actionType === "VIEW_BUDGET_REC") return t("insights.actionBudgetRec");
    if (actionType === "SIMULATE") return t("insights.actionSimulate");
    if (actionType === "VIEW_SPENDING") return t("insights.actionSpending");
    if (actionType === "VIEW_DEBT") return t("insights.actionDebt");
    if (actionType === "VIEW_GOALS") return t("insights.actionGoals");
    if (actionType === "VIEW_FORECAST") return t("insights.actionForecast");
    return t("insights.actionDefault");
  }

  function actionHref(actionType?: string) {
    if (actionType === "VIEW_BUDGET") return "/budget";
    if (actionType === "VIEW_BUDGET_REC") return "/budget/recommendation";
    if (actionType === "SIMULATE") return "/simulator";
    if (actionType === "VIEW_SPENDING") return "/transactions";
    if (actionType === "VIEW_DEBT") return "/debts";
    if (actionType === "VIEW_GOALS") return "/goals";
    if (actionType === "VIEW_FORECAST") return "/forecast";
    return "/budget/recommendation";
  }

  function priorityLabel(priority: Insight["priority"]) {
    if (priority === "HIGH") return t("insights.priorityHigh");
    if (priority === "MEDIUM") return t("insights.priorityMedium");
    return t("insights.priorityLow");
  }

  return (
    <Card className={cn(emphasize && "border-destructive/40 bg-destructive/5")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              item.priority === "HIGH"
                ? "destructive"
                : item.priority === "MEDIUM"
                  ? "secondary"
                  : "outline"
            }
          >
            {priorityLabel(item.priority)}
          </Badge>
          <CardTitle className="text-lg">{item.title}</CardTitle>
        </div>
        <CardDescription className="text-sm leading-relaxed">
          {item.message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.evidence?.length ? (
          <EvidenceList evidence={item.evidence} />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link
            href={actionHref(item.actionType)}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            {actionLabel(item.actionType)}
          </Link>
          <Button size="sm" variant="secondary" onClick={onAccept}>
            {t("insights.accept")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            {t("insights.dismiss")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LadderPanel({ ladder }: { ladder: WealthLadder }) {
  const { t } = useI18n();
  const current = ladder.steps.find((s) => isLadderFocus(s.status));
  const progressPct =
    typeof ladder.progressPercent === "number"
      ? ladder.progressPercent
      : Math.floor(
          (ladder.completedCount /
            Math.max(1, ladder.applicableSteps ?? ladder.totalSteps)) *
            100
        );

  function actionLabel(actionType: string) {
    if (actionType === "VIEW_ACCOUNTS") return t("insights.ladderActionAccounts");
    if (actionType === "VIEW_DEBT") return t("insights.ladderActionDebt");
    if (actionType === "VIEW_GOALS") return t("insights.ladderActionGoals");
    if (actionType === "VIEW_BUDGET_REC")
      return t("insights.ladderActionBudgetRec");
    if (actionType === "VIEW_SPENDING")
      return t("insights.ladderActionSpending");
    return t("insights.actionDefault");
  }

  function statusLabel(status: LadderStepStatus) {
    if (isLadderDone(status)) return t("insights.ladderDone");
    if (status === "UNKNOWN") return t("insights.ladderUnknown");
    if (status === "NOT_APPLICABLE") return t("insights.ladderNotApplicable");
    if (isLadderFocus(status)) return t("insights.ladderCurrent");
    return t("insights.ladderLocked");
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-800/15 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-100 via-card to-amber-50/40 shadow-[0_20px_50px_-28px_rgba(6,78,59,0.45)] dark:border-emerald-400/20 dark:from-emerald-950/80 dark:via-card dark:to-slate-950">
      <div className="relative border-b border-emerald-900/10 px-5 py-5 sm:px-7 sm:py-6 dark:border-emerald-400/10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/15 bg-emerald-900/5 px-3 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <TrendingUp className="size-3.5" />
              {t("insights.ladderTitle")}
            </div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-emerald-950 sm:text-3xl dark:text-emerald-50">
              {t("insights.ladderProgress", {
                current: ladder.currentStep ?? "—",
                total: ladder.applicableSteps ?? ladder.totalSteps,
                done: ladder.completedCount,
              })}
            </h2>
            <p className="text-sm leading-relaxed text-emerald-900/70 dark:text-emerald-100/65">
              {t("insights.ladderSubtitle")}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-900/10 bg-white/70 px-4 py-3 text-center backdrop-blur-sm dark:border-emerald-400/15 dark:bg-emerald-950/50">
            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-800/60 dark:text-emerald-200/55">
              {t("insights.ladderOverallLabel")}
            </p>
            <p className="font-heading text-3xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
              {progressPct}
              <span className="text-lg text-emerald-700/70 dark:text-emerald-300/70">
                %
              </span>
            </p>
          </div>
        </div>

        {/* Ascending staircase visual */}
        <div className="relative mt-6 flex h-28 items-end gap-1.5 sm:h-36 sm:gap-2">
          {ladder.steps.map((step, index) => {
            const height = 28 + index * 10;
            return (
              <div
                key={step.id}
                className="group relative flex flex-1 flex-col items-center justify-end"
                style={{ height: "100%" }}
                title={`${step.id}. ${step.title}`}
              >
                <div
                  className={cn(
                    "relative w-full origin-bottom rounded-t-md transition-all duration-500",
                    isLadderDone(step.status) &&
                      "bg-gradient-to-t from-emerald-800 to-emerald-500 shadow-[0_0_24px_-8px_rgba(16,185,129,0.7)]",
                    isLadderFocus(step.status) &&
                      "bg-gradient-to-t from-emerald-950 to-emerald-600 ring-2 ring-emerald-300/80 ring-offset-2 ring-offset-emerald-50 dark:ring-emerald-400/60 dark:ring-offset-emerald-950",
                    step.status === "NOT_APPLICABLE" &&
                      "bg-emerald-900/5 opacity-50 dark:bg-emerald-100/5",
                    isLadderLocked(step.status) &&
                      step.status !== "NOT_APPLICABLE" &&
                      "bg-emerald-900/10 dark:bg-emerald-100/10"
                  )}
                  style={{
                    height: `${height}%`,
                    animationDelay: `${index * 60}ms`,
                  }}
                >
                  {isLadderFocus(step.status) ? (
                    <span className="absolute inset-x-0 -top-1 mx-auto h-1 w-2/3 animate-pulse rounded-full bg-amber-300/90" />
                  ) : null}
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-[10px] font-semibold tabular-nums sm:text-xs",
                    isLadderFocus(step.status) &&
                      "text-emerald-900 dark:text-emerald-100",
                    isLadderDone(step.status) &&
                      "text-emerald-700 dark:text-emerald-300",
                    isLadderLocked(step.status) && "text-muted-foreground"
                  )}
                >
                  {step.id}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Current focus hero */}
        <div className="border-b border-emerald-900/10 p-5 sm:p-7 lg:border-b-0 lg:border-r dark:border-emerald-400/10">
          {current ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-900 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-50 dark:bg-emerald-400 dark:text-emerald-950">
                  {t("insights.ladderCurrent")}
                </span>
                <span className="text-xs font-medium text-emerald-800/60 dark:text-emerald-200/55">
                  {t("insights.ladderStepOf", {
                    current: current.id,
                    total: ladder.totalSteps,
                  })}
                </span>
              </div>
              <div>
                <p className="font-heading text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl dark:text-emerald-50">
                  {current.title}
                </p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-emerald-900/70 dark:text-emerald-100/65">
                  {current.description}
                </p>
              </div>
              {current.reason ? (
                <p className="max-w-md text-sm text-emerald-900/80 dark:text-emerald-100/75">
                  {current.reason}
                </p>
              ) : null}
              {current.detail ? (
                <p className="inline-flex rounded-xl border border-emerald-900/10 bg-white/60 px-3 py-2 font-mono text-sm tabular-nums text-emerald-950 backdrop-blur-sm dark:border-emerald-400/15 dark:bg-emerald-950/40 dark:text-emerald-100">
                  {current.detail}
                </p>
              ) : null}
              {typeof current.progress === "number" ? (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-800/55 dark:text-emerald-200/50">
                      {t("insights.ladderProgressLabel")}
                    </span>
                    <span className="font-heading text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                      {current.progress}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-emerald-900/10 dark:bg-emerald-100/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-800 via-emerald-600 to-lime-500 transition-all duration-700"
                      style={{ width: `${Math.max(current.progress, 2)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {current.actionType !== "NONE" ? (
                <Link
                  href={ladderHref(current.actionType)}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "gap-2 bg-emerald-900 text-emerald-50 hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
                  )}
                >
                  {actionLabel(current.actionType)}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("insights.summaryEmpty")}
            </p>
          )}
        </div>

        {/* Timeline steps */}
        <ol className="relative space-y-0 p-4 sm:p-5">
          <div
            aria-hidden
            className="absolute bottom-6 left-[1.85rem] top-6 w-px bg-gradient-to-b from-emerald-600 via-emerald-400/40 to-transparent sm:left-[2.1rem]"
          />
          {ladder.steps.map((step) => (
            <li
              key={step.id}
              className={cn(
                "relative flex gap-3 rounded-xl px-2 py-2.5 transition-colors sm:gap-3.5",
                isLadderFocus(step.status) &&
                  "bg-emerald-900/[0.06] dark:bg-emerald-400/10"
              )}
            >
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:size-9",
                  isLadderDone(step.status) &&
                    "bg-emerald-700 text-white shadow-md shadow-emerald-700/30",
                  isLadderFocus(step.status) &&
                    "bg-emerald-950 text-emerald-50 ring-4 ring-emerald-400/35 dark:bg-emerald-300 dark:text-emerald-950",
                  isLadderLocked(step.status) &&
                    "border border-emerald-900/15 bg-card text-muted-foreground dark:border-emerald-400/20"
                )}
              >
                {isLadderDone(step.status) ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  step.id
                )}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold leading-snug",
                      isLadderFocus(step.status) &&
                        "text-emerald-950 dark:text-emerald-50",
                      isLadderDone(step.status) &&
                        "text-emerald-800 dark:text-emerald-200",
                      isLadderLocked(step.status) && "text-foreground/80"
                    )}
                  >
                    {step.title}
                  </span>
                  {isLadderFocus(step.status) ? (
                    <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                      {statusLabel(step.status)}
                    </span>
                  ) : isLadderDone(step.status) ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      {statusLabel(step.status)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {statusLabel(step.status)}
                    </span>
                  )}
                </div>
                {step.reason ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {step.reason}
                  </p>
                ) : null}
                {step.detail ? (
                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      isLadderFocus(step.status)
                        ? "text-emerald-900/65 dark:text-emerald-100/60"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.detail}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function InsightsPage() {
  const { t, intlLocale } = useI18n();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<Insight[]>([]);
  const [ladder, setLadder] = useState<WealthLadder | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (refresh) params.set("refresh", "1");
      const data = await api<InsightsPayload>(`/api/insights?${params}`);
      setItems(data.insights);
      setLadder(data.ladder);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when period changes
  }, [year, month]);

  async function setStatus(id: string, status: "VIEWED" | "ACCEPTED" | "DISMISSED") {
    try {
      await api("/api/insights", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      ),
    [items]
  );

  const focusItems = useMemo(() => {
    const high = sorted.filter((i) => i.priority === "HIGH");
    if (high.length > 0) return high.slice(0, 3);
    return sorted.slice(0, 3);
  }, [sorted]);

  const focusIds = useMemo(
    () => new Set(focusItems.map((i) => i._id)),
    [focusItems]
  );

  const restItems = useMemo(
    () => sorted.filter((i) => !focusIds.has(i._id)),
    [sorted, focusIds]
  );

  const grouped = useMemo(() => {
    const map: Record<InsightGroup, Insight[]> = {
      spending: [],
      cashflow: [],
      debt: [],
      protection: [],
      other: [],
    };
    for (const item of restItems) {
      map[insightGroup(item.type)].push(item);
    }
    return map;
  }, [restItems]);

  const counts = useMemo(() => {
    let focus = 0;
    let watch = 0;
    let info = 0;
    for (const item of items) {
      if (item.priority === "HIGH") focus += 1;
      else if (item.priority === "MEDIUM") watch += 1;
      else info += 1;
    }
    return { focus, watch, info };
  }, [items]);

  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString(
    intlLocale,
    { month: "long", year: "numeric" }
  );

  function groupTitle(group: InsightGroup) {
    if (group === "spending") return t("insights.groupSpending");
    if (group === "cashflow") return t("insights.groupCashflow");
    if (group === "debt") return t("insights.groupDebt");
    if (group === "protection") return t("insights.groupProtection");
    return t("insights.groupOther");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("insights.title")}
          </h1>
          <p className="text-muted-foreground">{t("insights.subtitle")}</p>
          <p className="mt-1 text-sm font-medium">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            className="w-20"
            value={month}
            min={1}
            max={12}
            aria-label={t("common.month")}
            onChange={(e) => setMonth(Number(e.target.value))}
          />
          <Input
            type="number"
            className="w-28"
            value={year}
            aria-label={t("common.year")}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <Button variant="outline" onClick={() => load(true)} disabled={loading}>
            {loading ? t("insights.refreshing") : t("insights.refresh")}
          </Button>
        </div>
      </div>

      {ladder ? <LadderPanel ladder={ladder} /> : null}

      <Card>
        <CardContent className="flex flex-wrap gap-x-4 gap-y-1 pt-6 text-sm">
          {items.length === 0 ? (
            <span className="text-muted-foreground">
              {t("insights.summaryEmpty")}
            </span>
          ) : (
            <>
              <span>
                {t("insights.summaryFocus", { count: counts.focus })}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                {t("insights.summaryWatch", { count: counts.watch })}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                {t("insights.summaryInfo", { count: counts.info })}
              </span>
            </>
          )}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t("insights.empty")}
          </CardContent>
        </Card>
      ) : (
        <>
          {focusItems.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h2 className="font-heading text-xl font-semibold">
                  {t("insights.focusTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("insights.focusSubtitle")}
                </p>
              </div>
              <div className="space-y-3">
                {focusItems.map((item) => (
                  <InsightCard
                    key={item._id}
                    item={item}
                    emphasize={item.priority === "HIGH"}
                    onAccept={() => setStatus(item._id, "ACCEPTED")}
                    onDismiss={() => setStatus(item._id, "DISMISSED")}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {GROUP_ORDER.map((group) => {
            const list = grouped[group];
            if (list.length === 0) return null;
            return (
              <section key={group} className="space-y-3">
                <h2 className="font-heading text-lg font-semibold">
                  {groupTitle(group)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({list.length})
                  </span>
                </h2>
                <div className="space-y-3">
                  {list.map((item) => (
                    <InsightCard
                      key={item._id}
                      item={item}
                      onAccept={() => setStatus(item._id, "ACCEPTED")}
                      onDismiss={() => setStatus(item._id, "DISMISSED")}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
