"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Envelope = {
  key: string;
  label: string;
  amount: number;
  source: "AUTO" | "MANUAL";
  kind: string;
  linkedDebtId?: string;
  linkedAccountId?: string;
  linkedFixedCostId?: string;
  paid?: boolean;
  paymentTransactionId?: string;
};

type Allocation = {
  cycle: { start: string; end: string; paydayDay: number; label: string };
  currency: Currency;
  salary: number;
  baseSalary: number;
  startingCash: number;
  suggestedStartingCash?: number;
  totalIn: number;
  envelopes: Envelope[];
  allocated: number;
  remaining: number;
  configured: boolean;
  existingId: string | null;
  existingStatus: string | null;
  goalAdvice?: {
    goalId: string;
    goalName: string;
    reason: string;
    suggestedAmount: number;
  } | null;
};

type StepId = "debts" | "fixed" | "buffer" | "fun" | "goals" | "other";

const STEP_KINDS: Record<StepId, string[]> = {
  debts: ["CC_STATEMENT", "DEBT"],
  fixed: ["FIXED"],
  buffer: ["CASH_BUFFER"],
  fun: ["CC_SPEND_CAP", "LIVING"],
  goals: ["GOALS"],
  other: ["OTHER"],
};

const STEP_ORDER: StepId[] = [
  "debts",
  "fixed",
  "goals",
  "buffer",
  "fun",
  "other",
];

const STEP_ACCENT: Record<StepId, string> = {
  debts: "border-l-amber-600 bg-amber-50/40 dark:bg-amber-950/20",
  fixed: "border-l-sky-600 bg-sky-50/40 dark:bg-sky-950/20",
  goals: "border-l-teal-600 bg-teal-50/40 dark:bg-teal-950/20",
  buffer: "border-l-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20",
  fun: "border-l-violet-600 bg-violet-50/40 dark:bg-violet-950/20",
  other: "border-l-muted-foreground/40",
};

const STEP_NUM: Record<StepId, number> = {
  debts: 1,
  fixed: 2,
  goals: 3,
  buffer: 4,
  fun: 5,
  other: 6,
};

function stepOf(kind: string): StepId {
  for (const id of STEP_ORDER) {
    if (STEP_KINDS[id].includes(kind)) return id;
  }
  return "other";
}

function kindLabel(kind: string) {
  switch (kind) {
    case "CC_STATEMENT":
      return "CC";
    case "DEBT":
      return "Utang";
    case "FIXED":
      return "Fixed";
    case "CASH_BUFFER":
      return "Pegangan";
    case "CC_SPEND_CAP":
      return "Cap CC";
    case "LIVING":
      return "Hepi";
    case "GOALS":
      return "Goal";
    default:
      return kind;
  }
}

export default function PaydayAllocationPage() {
  const { t, intlLocale } = useI18n();
  const [data, setData] = useState<Allocation | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [salary, setSalary] = useState(0);
  const [startingCash, setStartingCash] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [confirmEnv, setConfirmEnv] = useState<Envelope | null>(null);
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({
    debts: true,
    fixed: true,
    buffer: true,
    fun: true,
    goals: true,
    other: false,
  });
  const [fixedReserveBalance, setFixedReserveBalance] = useState(0);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const [rec, accounts] = await Promise.all([
          api<Allocation>(
            `/api/payday-allocation${refresh ? "?refresh=1" : ""}`
          ),
          api<
            Array<{
              name: string;
              type: string;
              currentBalance: number;
              isActive: boolean;
            }>
          >("/api/accounts"),
        ]);
        setData(rec);
        setEnvelopes(rec.envelopes);
        setSalary(rec.salary);
        setStartingCash(rec.startingCash);
        setFixedReserveBalance(
          accounts
            .filter(
              (a) =>
                a.isActive &&
                a.type !== "CREDIT_CARD" &&
                /fixed/i.test(a.name)
            )
            .reduce((s, a) => s + (a.currentBalance ?? 0), 0)
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("paydayAllocation.loadFailed")
        );
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const currency = data?.currency ?? "IDR";
  const money = (n: number) => formatMoney(n, currency, intlLocale);
  const totalIn = salary + startingCash;
  const allocated = useMemo(
    () => envelopes.reduce((s, e) => s + e.amount, 0),
    [envelopes]
  );
  const paidAllocated = useMemo(
    () =>
      envelopes
        .filter((e) => e.paid || e.paymentTransactionId)
        .reduce((s, e) => s + e.amount, 0),
    [envelopes]
  );
  const remaining = totalIn - allocated;
  const usedPct =
    totalIn > 0
      ? Math.min(100, Math.round((allocated / totalIn) * 100))
      : 0;

  const steps = useMemo(() => {
    const grouped: Record<StepId, Envelope[]> = {
      debts: [],
      fixed: [],
      buffer: [],
      fun: [],
      goals: [],
      other: [],
    };
    for (const env of envelopes) {
      grouped[stepOf(env.kind)].push(env);
    }

    let running = totalIn;
    return STEP_ORDER.map((id) => {
      const items = grouped[id];
      const total = items.reduce((s, e) => s + e.amount, 0);
      const before = running;
      running -= total;
      // Only lock when prior steps already used up all available cash.
      // Goals/buffer/fun stay open whenever there is cash entering the step.
      const locked =
        id !== "debts" &&
        id !== "fixed" &&
        id !== "goals" &&
        before <= 0;
      const share =
        totalIn > 0 ? Math.min(100, Math.round((total / totalIn) * 100)) : 0;
      return { id, items, total, before, after: running, locked, share };
    }).filter((s) => s.id !== "other" || s.items.length > 0);
  }, [envelopes, totalIn]);

  function updateAmount(key: string, major: number) {
    const amount = toMinorUnits(major, currency);
    setEnvelopes((prev) =>
      prev.map((e) => (e.key === key ? { ...e, amount, source: "MANUAL" } : e))
    );
  }

  function isPayableEnvelope(env: Envelope) {
    return (
      env.kind === "DEBT" ||
      env.kind === "CC_STATEMENT" ||
      env.kind === "FIXED" ||
      env.kind === "GOALS"
    );
  }

  function requestSettle(env: Envelope) {
    if (!isPayableEnvelope(env)) {
      toast.message(t("paydayAllocation.settleOnlyDebt"));
      return;
    }
    if (env.paymentTransactionId || env.paid) {
      toast.message(t("paydayAllocation.settleAlready"));
      return;
    }
    if (env.kind === "CC_STATEMENT") {
      if (!env.linkedAccountId && !env.linkedDebtId) {
        toast.error(t("paydayAllocation.settleOnlyDebt"));
        return;
      }
    } else if (env.kind === "FIXED") {
      if (!env.linkedFixedCostId && !env.key.startsWith("fixed:")) {
        toast.error(t("paydayAllocation.settleOnlyDebt"));
        return;
      }
    } else if (env.kind === "GOALS") {
      const goalId = env.key.startsWith("goals:")
        ? env.key.slice("goals:".length)
        : "";
      if (!goalId) {
        toast.error(t("paydayAllocation.settleGoalMissing"));
        return;
      }
    } else if (!env.linkedDebtId) {
      toast.error(t("paydayAllocation.settleOnlyDebt"));
      return;
    }
    setConfirmEnv(env);
  }

  async function settleEnvelope(env: Envelope) {
    setSettlingKey(env.key);
    try {
      await api("/api/payday-allocation/settle", {
        method: "POST",
        body: JSON.stringify({
          envelopeKey: env.key,
          amount: env.amount,
          kind: env.kind,
          label: env.label,
          linkedDebtId: env.linkedDebtId,
          linkedAccountId: env.linkedAccountId,
          linkedFixedCostId: env.linkedFixedCostId,
          salary,
          startingCash,
          envelopes,
        }),
      });
      setConfirmEnv(null);
      toast.success(t("paydayAllocation.settleDone"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSettlingKey(null);
    }
  }

  function addEnvelope(kind: Envelope["kind"], label: string, key: string) {
    if (envelopes.some((e) => e.key === key)) return;
    setEnvelopes((prev) => [
      ...prev,
      {
        key,
        label,
        amount: Math.max(0, remaining),
        source: "MANUAL",
        kind,
      },
    ]);
  }

  function toggleStep(id: string) {
    setOpenSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function onSave() {
    setSaving(true);
    try {
      await api("/api/payday-allocation", {
        method: "POST",
        body: JSON.stringify({
          salary,
          startingCash,
          envelopes,
          status: "ACTIVE",
        }),
      });
      toast.success(t("paydayAllocation.saved"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setSaving(true);
    try {
      await api("/api/payday-allocation", {
        method: "POST",
        body: JSON.stringify({ resetToSuggestion: true }),
      });
      toast.success(t("paydayAllocation.resetDone"));
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  function stepTitle(id: StepId) {
    switch (id) {
      case "debts":
        return t("paydayAllocation.stepDebts");
      case "fixed":
        return t("paydayAllocation.stepFixed");
      case "buffer":
        return t("paydayAllocation.stepBuffer");
      case "fun":
        return t("paydayAllocation.stepFun");
      case "goals":
        return t("paydayAllocation.stepGoals");
      default:
        return t("paydayAllocation.stepOther");
    }
  }

  function stepDesc(id: StepId) {
    switch (id) {
      case "debts":
        return t("paydayAllocation.stepDebtsDesc");
      case "fixed":
        return t("paydayAllocation.stepFixedDesc");
      case "buffer":
        return t("paydayAllocation.stepBufferDesc");
      case "fun":
        return t("paydayAllocation.stepFunDesc");
      case "goals":
        return t("paydayAllocation.stepGoalsDesc");
      default:
        return "";
    }
  }

  if (loading && !data) {
    return (
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-36 sm:pb-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("paydayAllocation.title")}
            </h1>
            {data ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.cycle.label}
                {data.existingStatus ? (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">
                      {data.existingStatus}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="hidden gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              className="touch-manipulation"
              disabled={saving}
              onClick={() => onReset()}
            >
              <RotateCcw className="size-3.5" />
              {t("paydayAllocation.reset")}
            </Button>
            <Button
              size="sm"
              className="touch-manipulation"
              disabled={saving || envelopes.length === 0}
              onClick={() => onSave()}
            >
              <Save className="size-3.5" />
              {t("paydayAllocation.save")}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("paydayAllocation.waterfallSubtitle")}
        </p>
      </div>

      {!data?.configured ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm">{t("paydayAllocation.notConfigured")}</p>
            <Button render={<Link href="/settings" />}>
              {t("nav.settings")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Hero status */}
      <Card
        className={cn(
          "overflow-hidden border-0 shadow-sm",
          remaining < 0
            ? "bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/20"
            : remaining === 0
              ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20"
              : "bg-gradient-to-br from-primary/10 to-emerald-50 dark:from-primary/20 dark:to-emerald-950/20"
        )}
      >
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("paydayAllocation.totalIn")}
              </p>
              <p className="font-heading mt-0.5 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {money(totalIn)}
              </p>
            </div>
            <Badge
              variant={remaining < 0 ? "destructive" : "secondary"}
              className="shrink-0 text-xs"
            >
              {remaining < 0
                ? t("paydayAllocation.overAllocated")
                : remaining === 0
                  ? "Pass · 0 sisa"
                  : t("paydayAllocation.remaining")}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {t("paydayAllocation.allocated")}: {money(allocated)}
              </span>
              <span
                className={cn(
                  "font-mono font-medium",
                  remaining < 0
                    ? "text-red-700 dark:text-red-400"
                    : "text-emerald-800 dark:text-emerald-300"
                )}
              >
                {money(remaining)}
              </span>
            </div>
            <Progress value={Math.min(usedPct, 100)} />
            <p className="text-[11px] text-muted-foreground">
              {usedPct}% terpakai
              {paidAllocated > 0
                ? ` · ${t("paydayAllocation.allocatedPaidHint", {
                    amount: money(paidAllocated),
                  })}`
                : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inputs: salary + cash */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              {t("paydayAllocation.salary")}
            </CardDescription>
            <CardTitle className="font-mono text-xl tabular-nums">
              {money(salary)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <CurrencyAmountInput
              currency={currency}
              value={fromMinorUnits(salary, currency)}
              onValueChange={(v) =>
                setSalary(toMinorUnits(Number(v) || 0, currency))
              }
            />
            {data?.baseSalary != null ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  {t("paydayAllocation.baseSalary", {
                    amount: money(data.baseSalary),
                  })}
                </span>
                {salary !== data.baseSalary ? (
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setSalary(data.baseSalary)}
                  >
                    {t("paydayAllocation.useBaseSalary")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardDescription>{t("paydayAllocation.startingCash")}</CardDescription>
            <CardTitle className="font-mono text-xl tabular-nums">
              {money(startingCash)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <CurrencyAmountInput
              currency={currency}
              value={fromMinorUnits(startingCash, currency)}
              onValueChange={(v) =>
                setStartingCash(toMinorUnits(Number(v) || 0, currency))
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Waterfall */}
      <div className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">
          {t("paydayAllocation.waterfallTitle")}
        </h2>
      </div>

      {envelopes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("paydayAllocation.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="relative space-y-3">
          {steps.map((step, idx) => {
            const open = openSteps[step.id] !== false;
            const paidCount = step.items.filter((i) => i.paid).length;
            return (
              <div key={step.id} className="relative">
                {idx < steps.length - 1 ? (
                  <div
                    aria-hidden
                    className="absolute top-12 bottom-[-12px] left-[1.15rem] w-px bg-border sm:left-[1.35rem]"
                  />
                ) : null}

                <Card
                  className={cn(
                    "relative border-l-4 shadow-sm transition-opacity",
                    STEP_ACCENT[step.id],
                    step.locked && "opacity-60"
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 p-3 text-left touch-manipulation sm:p-4"
                    onClick={() => toggleStep(step.id)}
                  >
                    <span
                      className={cn(
                        "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:size-9 sm:text-sm",
                        step.locked
                          ? "bg-muted text-muted-foreground"
                          : step.after < 0
                            ? "bg-red-600 text-white"
                            : paidCount === step.items.length &&
                                step.items.length > 0
                              ? "bg-emerald-600 text-white"
                              : "bg-foreground text-background"
                      )}
                    >
                      {step.locked ? (
                        <Lock className="size-3.5" />
                      ) : paidCount === step.items.length &&
                        step.items.length > 0 ? (
                        <Check className="size-4" />
                      ) : (
                        STEP_NUM[step.id]
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold sm:text-base">
                            {stepTitle(step.id)}
                          </p>
                          <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                            {stepDesc(step.id)}
                          </p>
                          {step.id === "fixed" && fixedReserveBalance > 0 ? (
                            <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                              {t("paydayAllocation.stepFixedReserveHint", {
                                amount: money(fixedReserveBalance),
                              })}
                            </p>
                          ) : null}
                          {step.id === "goals" && data?.goalAdvice ? (
                            <p className="mt-1 text-[11px] text-teal-800 dark:text-teal-300">
                              <span className="font-medium">
                                {t("paydayAllocation.goalAdviceTitle")}:{" "}
                                {data.goalAdvice.goalName}.{" "}
                              </span>
                              {t("paydayAllocation.goalAdviceBody", {
                                reason: data.goalAdvice.reason,
                                amount: money(data.goalAdvice.suggestedAmount),
                              })}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums sm:text-base">
                            {money(step.total)}
                          </p>
                          <p className="text-[10px] text-muted-foreground sm:text-xs">
                            {step.share}% · sisa {money(step.after)}
                          </p>
                        </div>
                      </div>
                      {step.total > 0 ? (
                        <div className="mt-2">
                          <Progress value={step.share} />
                        </div>
                      ) : null}
                    </div>

                    <ChevronDown
                      className={cn(
                        "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>

                  {open ? (
                    <CardContent className="space-y-2 border-t bg-background/60 px-3 pt-3 pb-3 sm:px-4">
                      {step.locked ? (
                        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                          {t("paydayAllocation.stepLocked")}
                        </p>
                      ) : null}

                      {step.items.length === 0 ? (
                        <p className="px-1 py-2 text-xs text-muted-foreground">
                          {t("paydayAllocation.stepEmpty")}
                        </p>
                      ) : (
                        step.items.map((env) => (
                          <div
                            key={env.key}
                            className={cn(
                              "rounded-xl border bg-card p-3",
                              env.paid && "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                            )}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {env.label}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <Badge variant="outline" className="h-5 text-[10px]">
                                    {kindLabel(env.kind)}
                                  </Badge>
                                  {env.paid ? (
                                    <Badge
                                      variant="secondary"
                                      className="h-5 text-[10px]"
                                    >
                                      {t("paydayAllocation.paid")}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                              {isPayableEnvelope(env) ? (
                                <Button
                                  type="button"
                                  variant={env.paid ? "secondary" : "default"}
                                  size="sm"
                                  className="h-8 shrink-0 touch-manipulation gap-1 px-2.5 text-xs"
                                  disabled={
                                    step.locked ||
                                    settlingKey === env.key ||
                                    Boolean(env.paid || env.paymentTransactionId)
                                  }
                                  onClick={() => requestSettle(env)}
                                >
                                  <Check className="size-3.5" />
                                  {env.paid || env.paymentTransactionId
                                    ? t("paydayAllocation.paid")
                                    : env.kind === "GOALS"
                                      ? t("paydayAllocation.settleGoalPay")
                                      : t("paydayAllocation.settlePay")}
                                </Button>
                              ) : null}
                            </div>
                            <CurrencyAmountInput
                              currency={currency}
                              value={fromMinorUnits(env.amount, currency)}
                              onValueChange={(v) =>
                                updateAmount(env.key, Number(v) || 0)
                              }
                              disabled={step.locked}
                            />
                          </div>
                        ))
                      )}

                      {!step.locked &&
                      step.id === "buffer" &&
                      step.items.length === 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full touch-manipulation"
                          onClick={() =>
                            addEnvelope(
                              "CASH_BUFFER",
                              "Cash pegangan",
                              "cash_buffer"
                            )
                          }
                        >
                          <Plus className="size-3.5" />
                          {t("paydayAllocation.addBuffer")}
                        </Button>
                      ) : null}

                      {!step.locked &&
                      step.id === "fun" &&
                      step.items.length === 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full touch-manipulation"
                          onClick={() =>
                            addEnvelope("LIVING", "Makan & hepi", "living")
                          }
                        >
                          <Plus className="size-3.5" />
                          {t("paydayAllocation.addFun")}
                        </Button>
                      ) : null}

                      {!step.locked && step.id === "goals" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full touch-manipulation"
                          disabled={remaining <= 0}
                          onClick={() =>
                            addEnvelope("GOALS", "Goals / tabungan", "goals")
                          }
                        >
                          <Plus className="size-3.5" />
                          {t("paydayAllocation.addGoal")}
                        </Button>
                      ) : null}
                    </CardContent>
                  ) : null}
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile sticky actions — above bottom tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:hidden">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1 touch-manipulation"
            disabled={saving}
            onClick={() => onReset()}
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button
            className="h-11 flex-[1.4] touch-manipulation"
            disabled={saving || envelopes.length === 0}
            onClick={() => onSave()}
          >
            <Save className="size-4" />
            {t("paydayAllocation.save")}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmEnv != null}
        onOpenChange={(open) => {
          if (!open && settlingKey == null) setConfirmEnv(null);
        }}
      >
        <DialogContent showCloseButton={settlingKey == null}>
          <DialogHeader>
            <DialogTitle>
              {confirmEnv?.kind === "GOALS"
                ? t("paydayAllocation.settleGoalConfirmTitle")
                : t("paydayAllocation.settleConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirmEnv ? (
                <>
                  <span className="font-medium text-foreground">
                    {confirmEnv.label}
                  </span>
                  {" · "}
                  <span className="font-mono tabular-nums">
                    {money(confirmEnv.amount)}
                  </span>
                  <br />
                  {confirmEnv.kind === "GOALS"
                    ? t("paydayAllocation.settleGoalConfirm")
                    : t("paydayAllocation.settleConfirm")}
                </>
              ) : (
                t("paydayAllocation.settleConfirm")
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="touch-manipulation"
              disabled={settlingKey != null}
              onClick={() => setConfirmEnv(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="touch-manipulation"
              disabled={confirmEnv == null || settlingKey != null}
              onClick={() => {
                if (confirmEnv) {
                  settleEnvelope(confirmEnv).catch(() => undefined);
                }
              }}
            >
              <Check className="size-3.5" />
              {settlingKey != null
                ? t("common.saving")
                : t("paydayAllocation.settleConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
