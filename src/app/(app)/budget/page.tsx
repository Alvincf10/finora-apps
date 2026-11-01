"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "@/lib/client-api";
import { formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type BudgetRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  actualAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  currency: Currency;
  overBudget: boolean;
  warnBudget: boolean;
};

type Category = { _id: string; name: string; type: string };

type BudgetResponse = {
  items: BudgetRow[];
  weekKey: string;
  label: string;
  offset: number;
};

type SyncResponse = {
  applied: Array<{
    categoryId: string;
    categoryName: string;
    weeklyAmount: number;
    currency: Currency;
  }>;
  weekKey: string;
  weekLabel: string;
  targetOffset: number;
};

export default function BudgetPage() {
  const { t, intlLocale } = useI18n();
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BudgetRow | null>(null);
  const [offset, setOffset] = useState(0);
  const [weekLabel, setWeekLabel] = useState<string | null>(null);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");
  const [syncing, setSyncing] = useState(false);

  async function load(options?: { autoSyncMissing?: boolean }) {
    const [budget, cats] = await Promise.all([
      api<BudgetResponse>(`/api/weekly-budgets?offset=${offset}`),
      api<Category[]>("/api/categories"),
    ]);
    setWeekLabel(budget.label);
    setWeekKey(budget.weekKey);
    setCategories(cats.filter((c) => c.type === "EXPENSE"));

    // Current week empty → fill from last week's "minggu depan" advice.
    if (options?.autoSyncMissing && offset === 0 && budget.items.length === 0) {
      try {
        const synced = await api<SyncResponse>("/api/budgets/sync-from-weekly", {
          method: "POST",
          body: JSON.stringify({ offset: -1, onlyMissing: true }),
        });
        if (synced.applied.length > 0 && synced.targetOffset === 0) {
          toast.success(
            t("budget.syncedFromWeekly", {
              count: String(synced.applied.length),
            })
          );
          const refreshed = await api<BudgetResponse>(
            `/api/weekly-budgets?offset=0`
          );
          setRows(refreshed.items);
          setWeekLabel(refreshed.label);
          setWeekKey(refreshed.weekKey);
          return;
        }
      } catch {
        // Keep empty state if sync fails; user can retry manually.
      }
    }

    setRows(budget.items);
  }

  useEffect(() => {
    load({ autoSyncMissing: true }).catch((e) => toast.error(e.message));
  }, [offset]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    try {
      await api("/api/weekly-budgets", {
        method: "POST",
        body: JSON.stringify({
          offset,
          weekKey,
          categoryId: form.get("categoryId"),
          amount: toMinorUnits(Number(form.get("amount")), currency),
          currency,
        }),
      });
      toast.success(t("budget.saved"));
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>, row: BudgetRow) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency") ?? row.currency) as Currency;
    try {
      await api(`/api/weekly-budgets/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          categoryId: String(form.get("categoryId") || row.categoryId),
          amount: toMinorUnits(Number(form.get("amount")), currency),
          currency,
        }),
      });
      toast.success(t("budget.updated"));
      setEditOpen(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/weekly-budgets/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(t("budget.deleted"));
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function syncFromWeekly() {
    setSyncing(true);
    try {
      // Current report advice → next week caps (or force refresh viewed week via -1 when on current)
      const adviceOffset = offset === 0 ? -1 : offset - 1;
      const result = await api<SyncResponse>("/api/budgets/sync-from-weekly", {
        method: "POST",
        body: JSON.stringify({ offset: adviceOffset }),
      });
      toast.success(
        t("budget.syncedFromWeekly", {
          count: String(result.applied.length),
        })
      );
      if (result.targetOffset !== offset) {
        setOffset(result.targetOffset);
      } else {
        await load();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            {t("budget.title")}
          </h1>
          <p className="text-muted-foreground">{t("budget.subtitle")}</p>
          {weekLabel ? (
            <p className="mt-1 text-sm font-medium">
              {t("budget.weekLabel", { label: weekLabel })}
            </p>
          ) : null}
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
              aria-label={t("budget.prevWeek")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="min-w-[9rem] text-center font-mono text-sm">
              {weekLabel ?? "…"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              disabled={offset >= 1}
              onClick={() => setOffset((o) => Math.min(1, o + 1))}
              aria-label={t("budget.nextWeek")}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={syncing}
            onClick={() => void syncFromWeekly()}
          >
            {syncing ? t("budget.syncing") : t("budget.syncFromWeekly")}
          </Button>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (v) setFormCurrency("IDR");
            }}
          >
            <DialogTrigger render={<Button />}>
              {t("budget.setBudget")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t("budget.forWeek", { label: weekLabel ?? "—" })}
                </DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={onCreate}>
                <div className="space-y-2">
                  <Label>{t("common.category")}</Label>
                  <select
                    name="categoryId"
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("common.amount")}</Label>
                    <CurrencyAmountInput
                      name="amount"
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
                <Button type="submit" className="w-full">
                  {t("common.save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {t("budget.empty")}
            </CardContent>
          </Card>
        ) : (
          rows.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>{row.categoryName}</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {row.utilizationPercentage}%
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={Math.min(row.utilizationPercentage, 100)} />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t("budget.title")}</p>
                    <p className="font-mono">
                      {formatMoney(row.budgetAmount, row.currency, intlLocale)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("budget.spent")}</p>
                    <p className="font-mono">
                      {formatMoney(row.actualAmount, row.currency, intlLocale)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("budget.left")}</p>
                    <p className="font-mono">
                      {formatMoney(
                        row.remainingAmount,
                        row.currency,
                        intlLocale
                      )}
                    </p>
                  </div>
                </div>
                {row.overBudget ? (
                  <p className="text-sm text-destructive">
                    {t("budget.overBudget")}
                  </p>
                ) : row.warnBudget ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {t("budget.warnBudget")}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Dialog
                    open={editOpen === row.id}
                    onOpenChange={(v) => setEditOpen(v ? row.id : null)}
                  >
                    <DialogTrigger
                      render={<Button variant="outline" className="flex-1" />}
                    >
                      {t("common.edit")}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t("budget.editTitle", { name: row.categoryName })}
                        </DialogTitle>
                      </DialogHeader>
                      <form
                        className="space-y-3"
                        onSubmit={(e) => onEdit(e, row)}
                      >
                        <div className="space-y-2">
                          <Label>{t("common.category")}</Label>
                          <select
                            name="categoryId"
                            className="flex h-9 w-full rounded-md border px-3 text-sm"
                            defaultValue={row.categoryId}
                            required
                          >
                            {categories.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>{t("common.amount")}</Label>
                            <CurrencyAmountInput
                              name="amount"
                              currency={row.currency}
                              defaultValue={fromMinorUnits(
                                row.budgetAmount,
                                row.currency
                              )}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("common.currency")}</Label>
                            <select
                              name="currency"
                              className="flex h-9 w-full rounded-md border px-3 text-sm"
                              defaultValue={row.currency}
                            >
                              <option value="IDR">IDR</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                        </div>
                        <Button type="submit" className="w-full">
                          {t("common.save")}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 text-destructive"
                    onClick={() => setDeleteTarget(row)}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("budget.deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("budget.deleteConfirm", {
              name: deleteTarget?.categoryName ?? "",
            })}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onDelete()}
            >
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
