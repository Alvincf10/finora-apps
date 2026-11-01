"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  label: string;
  income: number;
  expense: number;
};

export function CashFlowBars({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="income" fill="#059669" radius={4} />
        <Bar dataKey="expense" fill="#64748b" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}
