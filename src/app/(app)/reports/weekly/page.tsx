"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { formatChangePct } from "@/lib/financial/change-pct";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OverSignal = "PACE_OVER" | "PACE_WARN" | "WOW";

type WeeklyReview = {
  offset: number;
  label: string;
  expenses: number;
  prevExpenses: number;
  expenseChangePercent: number | null;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    topItems: Array<{ label: string; amount: number }>;
  }>;
  overCategories: Array<{
    categoryId: string;
    categoryName: string;
    weekAmount: number;
    prevWeekAmount: number;
    wowChangePercent: number | null;
    weeklyAllotment: number | null;
    paceUtilization: number | null;
    signals: OverSignal[];
    cuttable: boolean;
    topItems: Array<{ label: string; amount: number }>;
  }>;
  advice: Array<{
    categoryId: string | null;
    categoryName: string;
    message: string;
    dailyCap: number | null;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }>;
  currency: Currency;
  daysLeftInMonth: number;
};

function signalLabel(
  signal: OverSignal,
  t: (key: string) => string
): { label: string; variant: "destructive" | "secondary" | "outline" } {
  if (signal === "PACE_OVER") {
    return { label: t("reports.weeklySignalPaceOver"), variant: "destructive" };
  }
  if (signal === "PACE_WARN") {
    return { label: t("reports.weeklySignalPaceWarn"), variant: "secondary" };
  }
  return { label: t("reports.weeklySignalWow"), variant: "outline" };
}

export default function WeeklyReviewPage() {
  const { t, intlLocale } = useI18n();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WeeklyReview | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setData(null);
    api<WeeklyReview>(`/api/reports/weekly?offset=${offset}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [offset]);

  async function sendToWhatsApp() {
    setSending(true);
    try {
      await api("/api/reports/weekly/send", {
        method: "POST",
        body: JSON.stringify({ offset }),
      });
      toast.success(t("reports.weeklySentWa"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.failed")
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {t("reports.weeklyTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {t("reports.weeklySubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl bg-card/80 p-1.5 ring-1 ring-border/70">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              disabled={offset <= -52}
              onClick={() => setOffset((o) => o - 1)}
              aria-label={t("reports.weeklyPrev")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="min-w-[9rem] text-center font-mono text-sm">
              {data?.label ?? "…"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              disabled={offset >= 0}
              onClick={() => setOffset((o) => Math.min(0, o + 1))}
              aria-label={t("reports.weeklyNext")}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={sending || !data}
            onClick={sendToWhatsApp}
          >
            <MessageCircle className="size-4" />
            {sending ? t("reports.weeklySending") : t("reports.weeklySendWa")}
          </Button>
        </div>
      </div>

      {!data ? (
        <p className="text-muted-foreground">{t("reports.weeklyLoading")}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="ring-1 ring-rose-500/20">
              <CardHeader className="pb-2">
                <CardDescription>{t("reports.weeklyExpenses")}</CardDescription>
                <CardTitle className="font-mono text-2xl text-rose-800 dark:text-rose-300">
                  {formatMoney(data.expenses, data.currency, intlLocale)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {data.expenseChangePercent == null
                  ? t("reports.weeklyVsLastNew")
                  : t("reports.weeklyVsLast", {
                      change: formatChangePct(data.expenseChangePercent),
                    })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("reports.weeklyOverCount")}</CardDescription>
                <CardTitle className="font-mono text-2xl">
                  {data.overCategories.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t("reports.weeklyDaysLeft", { days: data.daysLeftInMonth })}
              </CardContent>
            </Card>
            <Card className="sm:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardDescription>{t("reports.weeklyTop")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {data.topCategories.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("reports.weeklyNoSpend")}
                  </p>
                ) : (
                  data.topCategories.map((row) => (
                    <div key={row.categoryId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {row.categoryName}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {formatMoney(row.amount, data.currency, intlLocale)}
                        </span>
                      </div>
                      {row.topItems.length > 0 && (
                        <ul className="space-y-0.5 border-l border-border/60 pl-2 text-xs text-muted-foreground">
                          {row.topItems.map((item, i) => (
                            <li
                              key={`${row.categoryId}-${i}`}
                              className="flex items-start justify-between gap-2"
                            >
                              <span className="min-w-0 truncate">
                                {item.label}
                              </span>
                              <span className="shrink-0 font-mono tabular-nums">
                                {formatMoney(
                                  item.amount,
                                  data.currency,
                                  intlLocale
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-5" />
                {t("reports.weeklyOverTitle")}
              </CardTitle>
              <CardDescription>{t("reports.weeklyOverDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.overCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("reports.weeklyOverEmpty")}
                </p>
              ) : (
                data.overCategories.map((row) => (
                  <div
                    key={row.categoryId}
                    className={cn(
                      "rounded-xl bg-muted/40 px-3 py-2.5",
                      row.signals.includes("PACE_OVER") &&
                        "ring-1 ring-rose-500/30"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{row.categoryName}</p>
                        <p className="mt-0.5 font-mono text-sm tabular-nums">
                          {formatMoney(row.weekAmount, data.currency, intlLocale)}
                          {row.weeklyAllotment != null && (
                            <span className="text-muted-foreground">
                              {" "}
                              /{" "}
                              {formatMoney(
                                row.weeklyAllotment,
                                data.currency,
                                intlLocale
                              )}{" "}
                              {t("reports.weeklyAllotment")}
                            </span>
                          )}
                        </p>
                        {(row.paceUtilization != null ||
                          row.wowChangePercent != null ||
                          row.prevWeekAmount <= 0) && (
                          <p className="text-xs text-muted-foreground">
                            {row.paceUtilization != null &&
                              t("reports.weeklyPace", {
                                pct: Math.round(row.paceUtilization),
                              })}
                            {row.paceUtilization != null && " · "}
                            {t("reports.weeklyWow", {
                              pct: formatChangePct(row.wowChangePercent),
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {row.signals.map((s) => {
                          const meta = signalLabel(s, t);
                          return (
                            <Badge key={s} variant={meta.variant}>
                              {meta.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                    {row.topItems.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("reports.weeklyTopItems")}
                        </p>
                        <ul className="space-y-1 text-sm">
                          {row.topItems.map((item, i) => (
                            <li
                              key={`${row.categoryId}-item-${i}`}
                              className="flex items-start justify-between gap-2"
                            >
                              <span className="min-w-0 truncate text-muted-foreground">
                                {item.label}
                              </span>
                              <span className="shrink-0 font-mono text-xs tabular-nums">
                                {formatMoney(
                                  item.amount,
                                  data.currency,
                                  intlLocale
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("reports.weeklyAdviceTitle")}</CardTitle>
              <CardDescription>{t("reports.weeklyAdviceDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.advice.map((a, i) => (
                <div
                  key={`${a.categoryId ?? "gen"}-${i}`}
                  className="rounded-xl bg-muted/40 px-3 py-2.5 text-sm"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      variant={
                        a.priority === "HIGH"
                          ? "destructive"
                          : a.priority === "MEDIUM"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {a.priority}
                    </Badge>
                    {a.dailyCap != null && a.dailyCap > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatMoney(a.dailyCap, data.currency, intlLocale)}
                        /hari
                      </span>
                    )}
                  </div>
                  <p>{a.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
