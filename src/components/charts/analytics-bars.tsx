"use client";

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
import { formatMoney, fromMinorUnits } from "@/lib/money";
import type { Currency } from "@/types";

function moneyTick(value: number, currency: Currency) {
  const major = fromMinorUnits(value, currency);
  if (currency === "IDR") {
    if (Math.abs(major) >= 1_000_000) {
      return `${(major / 1_000_000).toFixed(1)}jt`;
    }
    if (Math.abs(major) >= 1_000) {
      return `${Math.round(major / 1_000)}rb`;
    }
  }
  return String(Math.round(major));
}

type CashFlowRow = {
  short: string;
  label: string;
  income: number;
  expense: number;
};

type CategoryRow = {
  name: string;
  fullName: string;
  current: number;
  average: number;
};

export function AnalyticsCashFlowChart({
  data,
  currency,
  intlLocale,
  incomeLabel,
  expenseLabel,
}: {
  data: CashFlowRow[];
  currency: Currency;
  intlLocale: string;
  incomeLabel: string;
  expenseLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="short" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency)}
          width={48}
        />
        <Tooltip
          formatter={(value) =>
            formatMoney(Number(value ?? 0), currency, intlLocale)
          }
          labelFormatter={(label, payload) =>
            String(payload?.[0]?.payload?.label ?? label)
          }
        />
        <Legend />
        <Bar dataKey="income" name={incomeLabel} fill="#059669" radius={4} />
        <Bar dataKey="expense" name={expenseLabel} fill="#64748b" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsCategoryChart({
  data,
  currency,
  intlLocale,
  currentLabel,
  averageLabel,
}: {
  data: CategoryRow[];
  currency: Currency;
  intlLocale: string;
  currentLabel: string;
  averageLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency)}
        />
        <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value) =>
            formatMoney(Number(value ?? 0), currency, intlLocale)
          }
          labelFormatter={(_, payload) =>
            String(payload?.[0]?.payload?.fullName ?? "")
          }
        />
        <Legend />
        <Bar dataKey="current" name={currentLabel} fill="#059669" radius={4} />
        <Bar dataKey="average" name={averageLabel} fill="#94a3b8" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}
