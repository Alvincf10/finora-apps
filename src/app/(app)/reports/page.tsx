"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DashboardData = {
  summary: {
    income: number;
    expense: number;
    netCashFlow: number;
    savingsRate: number;
    currency: Currency;
  };
  cashFlow: Array<{ label: string; income: number; expense: number; net: number }>;
  breakdown: Array<{ name: string; amount: number }>;
  budgets: Array<{
    categoryName: string;
    budgetAmount: number;
    actualAmount: number;
    currency: Currency;
  }>;
  debts: Array<{ name: string; remainingAmount: number; currency: Currency }>;
  goals: Array<{
    name: string;
    currentAmount: number;
    targetAmount: number;
    currency: Currency;
  }>;
};

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, []);

  if (!data) {
    return <p className="text-muted-foreground">Loading reports...</p>;
  }

  const c = data.summary.currency;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Reports</h1>
        <p className="text-muted-foreground">
          Monthly income vs expense, category spend, and progress.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Income</CardDescription>
            <CardTitle className="font-mono">
              {formatMoney(data.summary.income, c)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Expense</CardDescription>
            <CardTitle className="font-mono">
              {formatMoney(data.summary.expense, c)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Savings rate</CardDescription>
            <CardTitle className="font-mono">{data.summary.savingsRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.cashFlow}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="income" fill="#059669" radius={4} />
              <Bar dataKey="expense" fill="#64748b" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expense by category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.breakdown.map((row) => (
              <div key={row.name} className="flex justify-between text-sm">
                <span>{row.name}</span>
                <span className="font-mono">{formatMoney(row.amount, c)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Budget vs actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.budgets.map((b) => (
              <div key={b.categoryName} className="flex justify-between text-sm">
                <span>{b.categoryName}</span>
                <span className="font-mono">
                  {formatMoney(b.actualAmount, b.currency)} /{" "}
                  {formatMoney(b.budgetAmount, b.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
