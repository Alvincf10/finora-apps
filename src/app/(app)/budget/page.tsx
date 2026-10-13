"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney, toMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
};

type Category = { _id: string; name: string; type: string };

export default function BudgetPage() {
  const now = new Date();
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [formCurrency, setFormCurrency] = useState<Currency>("IDR");

  async function load() {
    const [budget, cats] = await Promise.all([
      api<BudgetRow[]>(`/api/budgets?year=${year}&month=${month}`),
      api<Category[]>("/api/categories"),
    ]);
    setRows(budget);
    setCategories(cats.filter((c) => c.type === "EXPENSE"));
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [month, year]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency")) as Currency;
    try {
      await api("/api/budgets", {
        method: "POST",
        body: JSON.stringify({
          month,
          year,
          categoryId: form.get("categoryId"),
          amount: toMinorUnits(Number(form.get("amount")), currency),
          currency,
        }),
      });
      toast.success("Budget saved");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Budget</h1>
          <p className="text-muted-foreground">
            Monthly category budgets vs actual spending.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            value={month}
            min={1}
            max={12}
            onChange={(e) => setMonth(Number(e.target.value))}
          />
          <Input
            type="number"
            className="w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (v) setFormCurrency("IDR");
            }}
          >
            <DialogTrigger render={<Button />}>Set budget</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Budget for {month}/{year}
                </DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={onCreate}>
                <div className="space-y-2">
                  <Label>Category</Label>
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
                    <Label>Amount</Label>
                    <CurrencyAmountInput
                      name="amount"
                      currency={formCurrency}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
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
                  Save
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
              No budgets for this month yet.
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
                    <p className="text-muted-foreground">Budget</p>
                    <p className="font-mono">
                      {formatMoney(row.budgetAmount, row.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Spent</p>
                    <p className="font-mono">
                      {formatMoney(row.actualAmount, row.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Left</p>
                    <p className="font-mono">
                      {formatMoney(row.remainingAmount, row.currency)}
                    </p>
                  </div>
                </div>
                {row.overBudget ? (
                  <p className="text-sm text-destructive">Over budget</p>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
