import mongoose from "mongoose";
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";

export type TotalsQuery =
  | { kind: "expense"; range: "month" | "today" }
  | { kind: "income"; range: "month" | "today" }
  | { kind: "both"; range: "month" | "today" };

/** Detect summary queries like "total pengeluaran", "pengeluaran hari ini". */
export function parseTotalsQuery(text: string): TotalsQuery | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;

  const today =
    /\bhari ini\b/.test(t) || /\btoday\b/.test(t) || /\bharian\b/.test(t);
  const range: "month" | "today" = today ? "today" : "month";

  const isExpense =
    /\bpengeluaran\b/.test(t) ||
    /\bexpense\b/.test(t) ||
    /\bspending\b/.test(t);

  const isIncome =
    /\bpemasukan\b/.test(t) ||
    /\bincome\b/.test(t) ||
    /\bpendapatan\b/.test(t);

  const isSummary =
    /\bringkas\b/.test(t) ||
    /\brekap\b/.test(t) ||
    /\bringkasan\b/.test(t) ||
    t === "total" ||
    t === "total bulan ini";

  if (isExpense && isIncome) return { kind: "both", range };
  if (isExpense) return { kind: "expense", range };
  if (isIncome) return { kind: "income", range };
  if (isSummary || (/\btotal\b/.test(t) && !/\d/.test(t))) {
    // "total" alone / "total bulan ini" → both; avoid eating "total xxx 50rb"
    if (/\d/.test(t)) return null;
    return { kind: "both", range };
  }

  return null;
}

function bounds(range: "month" | "today", now = new Date()) {
  if (range === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

async function sumType(
  userId: string,
  type: "EXPENSE" | "INCOME",
  start: Date,
  end: Date
): Promise<number> {
  const rows = await Transaction.aggregate<{ total: number }>([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type,
        date: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return rows[0]?.total ?? 0;
}

export async function buildTotalsReply(
  userId: string,
  query: TotalsQuery
): Promise<string> {
  const user = await User.findById(userId).lean();
  const currency = (user?.baseCurrency ?? "IDR") as Currency;
  const { start, end } = bounds(query.range);
  const label =
    query.range === "today"
      ? "hari ini"
      : start.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  if (query.kind === "expense") {
    const total = await sumType(userId, "EXPENSE", start, end);
    return `Vira · total pengeluaran ${label}\n${formatMoney(total, currency)}`;
  }

  if (query.kind === "income") {
    const total = await sumType(userId, "INCOME", start, end);
    return `Vira · total pemasukan ${label}\n${formatMoney(total, currency)}`;
  }

  const [expense, income] = await Promise.all([
    sumType(userId, "EXPENSE", start, end),
    sumType(userId, "INCOME", start, end),
  ]);
  return (
    `Vira · ringkasan ${label}\n` +
    `Pengeluaran: ${formatMoney(expense, currency)}\n` +
    `Pemasukan: ${formatMoney(income, currency)}`
  );
}
