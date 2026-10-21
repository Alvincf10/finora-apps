"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type LadderStep = {
  id: number;
  title: string;
  description: string;
  status: "DONE" | "CURRENT" | "UPCOMING";
  progress?: number;
  detail?: string;
  actionType: string;
};

type WealthLadder = {
  currentStep: number;
  completedCount: number;
  totalSteps: number;
  currency: Currency;
  steps: LadderStep[];
};

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
  const current = ladder.steps.find((s) => s.status === "CURRENT");

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

  function statusLabel(status: LadderStep["status"]) {
    if (status === "DONE") return t("insights.ladderDone");
    if (status === "CURRENT") return t("insights.ladderCurrent");
    return t("insights.ladderUpcoming");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-xl">
          {t("insights.ladderTitle")}
        </CardTitle>
        <CardDescription>{t("insights.ladderSubtitle")}</CardDescription>
        <p className="text-sm font-medium">
          {t("insights.ladderProgress", {
            current: ladder.currentStep,
            total: ladder.totalSteps,
            done: ladder.completedCount,
          })}
        </p>
        <div className="flex gap-1 pt-1">
          {ladder.steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                "h-2 flex-1 rounded-full",
                step.status === "DONE" && "bg-emerald-600",
                step.status === "CURRENT" && "bg-primary",
                step.status === "UPCOMING" && "bg-muted"
              )}
              title={`${step.id}. ${step.title}`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {current ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t("insights.ladderCurrent")}</Badge>
              <span className="font-medium">
                {current.id}. {current.title}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {current.description}
            </p>
            {current.detail ? (
              <p className="font-mono text-sm tabular-nums">{current.detail}</p>
            ) : null}
            {typeof current.progress === "number" ? (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${current.progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {current.progress}%
                </p>
              </div>
            ) : null}
            {current.actionType !== "NONE" ? (
              <Link
                href={ladderHref(current.actionType)}
                className={cn(
                  buttonVariants({ size: "sm", variant: "default" })
                )}
              >
                {actionLabel(current.actionType)}
              </Link>
            ) : null}
          </div>
        ) : null}

        <ol className="space-y-2">
          {ladder.steps.map((step) => (
            <li
              key={step.id}
              className={cn(
                "flex gap-3 rounded-md border px-3 py-2 text-sm",
                step.status === "CURRENT" && "border-primary/40 bg-primary/5",
                step.status === "DONE" && "opacity-70"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.status === "DONE" &&
                    "bg-emerald-600 text-white",
                  step.status === "CURRENT" && "bg-primary text-primary-foreground",
                  step.status === "UPCOMING" && "bg-muted text-muted-foreground"
                )}
              >
                {step.status === "DONE" ? "✓" : step.id}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{step.title}</span>
                  <Badge
                    variant={
                      step.status === "DONE"
                        ? "secondary"
                        : step.status === "CURRENT"
                          ? "default"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {statusLabel(step.status)}
                  </Badge>
                </div>
                {step.detail ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {step.detail}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
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
