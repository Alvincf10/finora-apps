"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits, fromMinorUnits, percent } from "@/lib/money";
import {
  idealSavingsToTarget,
  simulateDailySavings,
} from "@/lib/financial/goal-simulation";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Goal = {
  _id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: Currency;
  status: string;
  targetDate?: string;
};

type Account = {
  _id: string;
  name: string;
  currency: Currency;
  isActive: boolean;
};

function formatDuration(
  days: number,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  if (days <= 0) return t("goals.alreadyReached");
  if (days === 1) return t("goals.durationDay");
  if (days < 14) return t("goals.durationDays", { days });
  if (days < 60) {
    return t("goals.durationWeeks", {
      weeks: Math.ceil(days / 7),
      days,
    });
  }
  const months = Math.ceil(days / 30);
  return months === 1
    ? t("goals.durationMonth", { months, days })
    : t("goals.durationMonths", { months, days });
}

function GoalSimulator({ goal }: { goal: Goal }) {
  const { t, intlLocale } = useI18n();
  const [dailyMajor, setDailyMajor] = useState(0);
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const sim = simulateDailySavings(
    goal.targetAmount,
    goal.currentAmount,
    toMinorUnits(dailyMajor, goal.currency)
  );
  const ideal = idealSavingsToTarget(
    goal.targetAmount,
    goal.currentAmount,
    goal.targetDate
  );

  const dateOpts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-medium">{t("goals.simulatorTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("goals.remainingLabel")}{" "}
          <span className="font-mono">
            {formatMoney(remaining, goal.currency, intlLocale)}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t("goals.dailySaveLabel")}</Label>
        <CurrencyAmountInput
          currency={goal.currency}
          value={dailyMajor}
          onValueChange={setDailyMajor}
          allowEmpty
          placeholder={t("goals.dailyPlaceholder")}
        />
      </div>

      {dailyMajor > 0 && remaining > 0 ? (
        <div className="space-y-1 text-sm">
          <p>
            {t("goals.reachIn", {
              duration: formatDuration(sim.daysNeeded, t),
            })}
          </p>
          {sim.reachDate ? (
            <p className="text-xs text-muted-foreground">
              {t("goals.estimatedDate", {
                date: new Date(sim.reachDate).toLocaleDateString(
                  intlLocale,
                  dateOpts
                ),
              })}
            </p>
          ) : null}
        </div>
      ) : remaining <= 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("goals.alreadyCompleted")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("goals.enterDaily")}</p>
      )}

      <div className="border-t pt-3">
        <p className="mb-2 text-sm font-medium">{t("goals.idealPace")}</p>
        {ideal.isOverdue ? (
          <p className="mb-3 text-xs text-rose-700 dark:text-rose-400">
            {t("goals.overdueHint")}
          </p>
        ) : ideal.hasTargetDate && ideal.idealDaily != null ? (
          <div className="mb-3 space-y-1 text-sm">
            <p className="text-xs text-muted-foreground">
              {t("goals.hitBy", {
                date: goal.targetDate
                  ? new Date(goal.targetDate).toLocaleDateString(
                      intlLocale,
                      dateOpts
                    )
                  : "—",
                days:
                  ideal.daysLeft === 1
                    ? t("goals.daysLeftOne")
                    : t("goals.daysLeftMany", {
                        days: ideal.daysLeft ?? 0,
                      }),
              })}
            </p>
            <div className="flex justify-between">
              <span>{t("goals.perDay")}</span>
              <span className="font-mono">
                {formatMoney(ideal.idealDaily, goal.currency, intlLocale)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("goals.perWeek")}</span>
              <span className="font-mono">
                {formatMoney(ideal.idealWeekly ?? 0, goal.currency, intlLocale)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("goals.perMonth")}</span>
              <span className="font-mono">
                {formatMoney(ideal.idealMonthly ?? 0, goal.currency, intlLocale)}
              </span>
            </div>
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            {t("goals.noTargetDateHint")}
          </p>
        )}
        <div className="space-y-2">
          {ideal.horizons.map((h) => (
            <div
              key={h.months}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-muted-foreground">{h.label}</span>
              <span className="font-mono">
                {formatMoney(h.daily, goal.currency, intlLocale)}
                {t("common.perDay")} ·{" "}
                {formatMoney(h.monthly, goal.currency, intlLocale)}
                {t("common.perMonth")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function toDateInput(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function GoalsPage() {
  const { t, intlLocale } = useI18n();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [contributeOpen, setContributeOpen] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  async function load() {
    const [goalList, accountList] = await Promise.all([
      api<Goal[]>("/api/goals"),
      api<Account[]>("/api/accounts"),
    ]);
    setGoals(goalList);
    setAccounts(accountList.filter((a) => a.isActive));
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    try {
      await api("/api/goals", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          targetAmount: toMinorUnits(Number(form.get("targetAmount")), currency),
          currency,
          targetDate: form.get("targetDate") || undefined,
        }),
      });
      toast.success(t("goals.created"));
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, goal: Goal) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api(`/api/goals/${goal._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          targetAmount: toMinorUnits(
            Number(form.get("targetAmount")),
            goal.currency
          ),
          targetDate: form.get("targetDate") || undefined,
        }),
      });
      toast.success(t("goals.updated"));
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onContribute(e: React.FormEvent<HTMLFormElement>, goalId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const goal = goals.find((g) => g._id === goalId);
    if (!goal) return;
    try {
      await api(`/api/goals/${goalId}`, {
        method: "POST",
        body: JSON.stringify({
          accountId: form.get("accountId"),
          amount: toMinorUnits(Number(form.get("amount")), goal.currency),
          date: form.get("date") || undefined,
        }),
      });
      toast.success(t("goals.contributionAdded"));
      setContributeOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("goals.title")}
          </h1>
          <p className="text-muted-foreground">{t("goals.subtitle")}</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) setFormCurrency("IDR");
          }}
        >
          <DialogTrigger render={<Button />}>{t("goals.add")}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("goals.newGoal")}</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input
                  name="name"
                  required
                  placeholder={t("goals.namePlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("goals.target")}</Label>
                  <CurrencyAmountInput
                    name="targetAmount"
                    currency={formCurrency}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.currency")}</Label>
                  <select
                    name="currency"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    value={formCurrency}
                    onChange={(e) =>
                      setFormCurrency(e.target.value as Currency)
                    }
                  >
                    <option value="IDR">IDR</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("goals.targetDate")}</Label>
                <Input name="targetDate" type="date" />
              </div>
              <Button type="submit" className="w-full">
                {t("common.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((goal) => {
          const progress = percent(goal.currentAmount, goal.targetAmount);
          return (
            <Card key={goal._id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{goal.name}</span>
                  <Badge variant="secondary">{goal.status}</Badge>
                </CardTitle>
                {goal.targetDate ? (
                  <CardDescription>
                    {t("goals.targetPrefix", {
                      date: new Date(goal.targetDate).toLocaleDateString(
                        intlLocale,
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }
                      ),
                    })}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={Math.min(progress, 100)} />
                <div className="flex justify-between text-sm">
                  <span className="font-mono">
                    {formatMoney(goal.currentAmount, goal.currency, intlLocale)}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {formatMoney(goal.targetAmount, goal.currency, intlLocale)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Dialog
                    open={editOpen === goal._id}
                    onOpenChange={(v) => setEditOpen(v ? goal._id : null)}
                  >
                    <DialogTrigger
                      render={<Button variant="outline" className="flex-1" />}
                    >
                      {t("common.edit")}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t("common.editNamed", { name: goal.name })}
                        </DialogTitle>
                      </DialogHeader>
                      <form
                        key={
                          goal._id +
                          String(goal.targetAmount) +
                          String(goal.targetDate ?? "") +
                          goal.name
                        }
                        className="space-y-3"
                        onSubmit={(e) => onEdit(e, goal)}
                      >
                        <div className="space-y-2">
                          <Label>{t("common.name")}</Label>
                          <Input
                            name="name"
                            required
                            defaultValue={goal.name}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("goals.targetAmount")}</Label>
                          <CurrencyAmountInput
                            name="targetAmount"
                            currency={goal.currency}
                            required
                            defaultValue={fromMinorUnits(
                              goal.targetAmount,
                              goal.currency
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("goals.targetDate")}</Label>
                          <Input
                            name="targetDate"
                            type="date"
                            defaultValue={toDateInput(goal.targetDate)}
                          />
                        </div>
                        <Button type="submit" className="w-full">
                          {t("common.saveChanges")}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  {goal.status === "ACTIVE" ? (
                    <Dialog
                      open={contributeOpen === goal._id}
                      onOpenChange={(v) =>
                        setContributeOpen(v ? goal._id : null)
                      }
                    >
                      <DialogTrigger
                        render={
                          <Button variant="outline" className="flex-1" />
                        }
                      >
                        {t("goals.contribute")}
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            {t("goals.contributeTo", { name: goal.name })}
                          </DialogTitle>
                        </DialogHeader>
                        <form
                          className="space-y-3"
                          onSubmit={(e) => onContribute(e, goal._id)}
                        >
                          <div className="space-y-2">
                            <Label>{t("goals.fromAccount")}</Label>
                            <select
                              name="accountId"
                              className="flex h-9 w-full rounded-md border px-3 text-sm"
                              required
                            >
                              {accounts
                                .filter((a) => a.currency === goal.currency)
                                .map((a) => (
                                  <option key={a._id} value={a._id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("common.amount")}</Label>
                            <CurrencyAmountInput
                              name="amount"
                              currency={goal.currency}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("common.date")}</Label>
                            <Input
                              name="date"
                              type="date"
                              defaultValue={new Date()
                                .toISOString()
                                .slice(0, 10)}
                            />
                          </div>
                          <Button type="submit" className="w-full">
                            {t("common.save")}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>

                {goal.status === "ACTIVE" ? (
                  <GoalSimulator goal={goal} />
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
