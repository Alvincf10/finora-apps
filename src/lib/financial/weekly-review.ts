import { Transaction } from "@/models/Transaction";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { Account } from "@/models/Account";
import { formatMoney, percent } from "@/lib/money";
import {
  changePercent,
  formatChangePct,
} from "@/lib/financial/change-pct";
import type { Currency } from "@/types";

export { changePercent, formatChangePct } from "@/lib/financial/change-pct";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const WOW_PCT_THRESHOLD = 20;
const PACE_OVER = 100;
const PACE_WARN = 80;

export type WeeklyOverSignal = "PACE_OVER" | "PACE_WARN" | "WOW";

export type WeeklyTopItem = {
  label: string;
  amount: number;
};

export type WeeklyCategoryRow = {
  categoryId: string;
  categoryName: string;
  weekAmount: number;
  prevWeekAmount: number;
  /** null = no prior-week baseline */
  wowChangePercent: number | null;
  budgetAmount: number | null;
  weeklyAllotment: number | null;
  paceUtilization: number | null;
  signals: WeeklyOverSignal[];
  classification: string;
  nature: string;
  cuttable: boolean;
  /** Top 3 largest transactions in this category this week */
  topItems: WeeklyTopItem[];
};

export type WeeklyAdvice = {
  categoryId: string | null;
  categoryName: string;
  message: string;
  dailyCap: number | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

export type WeeklyReview = {
  offset: number;
  label: string;
  start: string;
  end: string;
  expenses: number;
  prevExpenses: number;
  /** null = no prior-week baseline */
  expenseChangePercent: number | null;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    topItems: WeeklyTopItem[];
  }>;
  overCategories: WeeklyCategoryRow[];
  advice: WeeklyAdvice[];
  currency: Currency;
  daysLeftInMonth: number;
};

export function jakartaParts(date = new Date()) {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Instant corresponding to 00:00:00 Asia/Jakarta on the given calendar day. */
function jakartaMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - WIB_OFFSET_MS);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday–Sunday bounds in Asia/Jakarta. offset 0 = current week, -1 = previous. */
export function getWeekBounds(weekOffset: number, now = new Date()) {
  const p = jakartaParts(now);
  const daysFromMonday = p.weekday === 0 ? 6 : p.weekday - 1;
  const mondayAnchor = new Date(
    Date.UTC(p.year, p.month - 1, p.day - daysFromMonday + weekOffset * 7)
  );
  const y = mondayAnchor.getUTCFullYear();
  const m = mondayAnchor.getUTCMonth() + 1;
  const d = mondayAnchor.getUTCDate();
  const start = jakartaMidnight(y, m, d);
  const sunday = new Date(Date.UTC(y, m - 1, d + 6));
  const end = new Date(
    jakartaMidnight(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth() + 1,
      sunday.getUTCDate()
    ).getTime() +
      24 * 60 * 60 * 1000 -
      1
  );
  const label = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}–${String(
    sunday.getUTCDate()
  ).padStart(2, "0")}/${String(sunday.getUTCMonth() + 1).padStart(2, "0")}/${sunday.getUTCFullYear()}`;
  return { start, end, label, year: y, month: m, mondayDay: d };
}

function isCuttable(name: string, classification: string, nature: string) {
  const n = name.toLowerCase();
  if (nature === "FIXED") return false;
  if (classification === "IMPORTANT") return false;
  if (
    ["debt", "utang", "savings", "tabungan", "rent", "housing", "cicilan"].some(
      (k) => n.includes(k)
    )
  ) {
    return false;
  }
  return classification === "DISCRETIONARY" || classification === "UNKNOWN";
}

function materialFloor(currency: Currency): number {
  return currency === "IDR" ? 50_000 : 500;
}

type WeekExpenseAgg = {
  byCategory: Map<string, number>;
  topByCategory: Map<string, WeeklyTopItem[]>;
};

function txLabel(tx: {
  description?: string | null;
  merchant?: string | null;
}): string {
  const desc = (tx.description ?? "").trim();
  const merchant = (tx.merchant ?? "").trim();
  if (desc && merchant && desc.toLowerCase() !== merchant.toLowerCase()) {
    return `${desc} · ${merchant}`;
  }
  return desc || merchant || "Tanpa deskripsi";
}

async function aggregateWeekExpenses(
  userId: string,
  start: Date,
  end: Date
): Promise<WeekExpenseAgg> {
  const txs = await Transaction.find({
    userId,
    type: "EXPENSE",
    date: { $gte: start, $lte: end },
  }).lean();

  const byCategory = new Map<string, number>();
  const itemsByCategory = new Map<string, WeeklyTopItem[]>();

  for (const tx of txs) {
    const key = tx.categoryId?.toString() ?? "uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + tx.amount);
    const list = itemsByCategory.get(key) ?? [];
    list.push({ label: txLabel(tx), amount: tx.amount });
    itemsByCategory.set(key, list);
  }

  const topByCategory = new Map<string, WeeklyTopItem[]>();
  for (const [key, list] of itemsByCategory) {
    topByCategory.set(
      key,
      [...list].sort((a, b) => b.amount - a.amount).slice(0, 3)
    );
  }

  return { byCategory, topByCategory };
}

async function sumExpensesByCategory(
  userId: string,
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const { byCategory } = await aggregateWeekExpenses(userId, start, end);
  return byCategory;
}

function totalOf(map: Map<string, number>) {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}

export async function getWeeklyReview(
  userId: string,
  weekOffset = 0,
  now = new Date()
): Promise<WeeklyReview> {
  const week = getWeekBounds(weekOffset, now);
  const prev = getWeekBounds(weekOffset - 1, now);

  const [weekAgg, prevByCat, accounts] = await Promise.all([
    aggregateWeekExpenses(userId, week.start, week.end),
    sumExpensesByCategory(userId, prev.start, prev.end),
    Account.find({ userId, isActive: true }).lean(),
  ]);
  const weekByCat = weekAgg.byCategory;
  const weekTopItems = weekAgg.topByCategory;

  const currency = (accounts[0]?.currency as Currency) ?? "IDR";
  const expenses = totalOf(weekByCat);
  const prevExpenses = totalOf(prevByCat);

  // Budgets for the month of this week's Monday
  const budgets = await Budget.find({
    userId,
    year: week.year,
    month: week.month,
  }).lean();
  const budgetByCat = new Map(
    budgets.map((b) => [b.categoryId.toString(), b.amount as number])
  );

  const categoryIds = [
    ...new Set([...weekByCat.keys(), ...prevByCat.keys(), ...budgetByCat.keys()]),
  ].filter((id) => id !== "uncategorized");

  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const catMeta = new Map(
    categories.map((c) => [
      c._id.toString(),
      {
        name: c.name as string,
        classification: (c.classification as string) ?? "UNKNOWN",
        nature: (c.nature as string) ?? "UNKNOWN",
      },
    ])
  );

  const dim = daysInMonth(week.year, week.month);
  // Days of this week that fall in the budget month
  let daysInWeekInMonth = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.UTC(week.year, week.month - 1, week.mondayDay + i));
    if (day.getUTCMonth() + 1 === week.month) daysInWeekInMonth += 1;
  }

  const jakartaNow = jakartaParts(now);
  const daysLeftInMonth = Math.max(
    0,
    daysInMonth(jakartaNow.year, jakartaNow.month) - jakartaNow.day
  );

  const floor = materialFloor(currency);
  const rows: WeeklyCategoryRow[] = [];

  const allIds = new Set([
    ...weekByCat.keys(),
    ...[...budgetByCat.keys()].filter((id) => weekByCat.has(id) || prevByCat.has(id)),
  ]);

  for (const categoryId of allIds) {
    const meta = catMeta.get(categoryId) ?? {
      name: categoryId === "uncategorized" ? "Uncategorized" : "Unknown",
      classification: "UNKNOWN",
      nature: "UNKNOWN",
    };
    const weekAmount = weekByCat.get(categoryId) ?? 0;
    const prevWeekAmount = prevByCat.get(categoryId) ?? 0;
    const wowChangePercent = changePercent(weekAmount, prevWeekAmount);
    const budgetAmount = budgetByCat.get(categoryId) ?? null;
    const weeklyAllotment =
      budgetAmount != null && daysInWeekInMonth > 0
        ? Math.round((budgetAmount * daysInWeekInMonth) / dim)
        : null;
    const paceUtilization =
      weeklyAllotment != null && weeklyAllotment > 0
        ? percent(weekAmount, weeklyAllotment)
        : null;

    const signals: WeeklyOverSignal[] = [];
    if (paceUtilization != null) {
      if (paceUtilization >= PACE_OVER) signals.push("PACE_OVER");
      else if (paceUtilization >= PACE_WARN) signals.push("PACE_WARN");
    }
    if (
      wowChangePercent != null &&
      wowChangePercent >= WOW_PCT_THRESHOLD &&
      weekAmount - prevWeekAmount >= floor
    ) {
      signals.push("WOW");
    } else if (prevWeekAmount <= 0 && weekAmount >= floor * 2) {
      // New material spend with no prior-week baseline
      signals.push("WOW");
    }

    if (weekAmount === 0 && signals.length === 0) continue;

    rows.push({
      categoryId,
      categoryName: meta.name,
      weekAmount,
      prevWeekAmount,
      wowChangePercent,
      budgetAmount,
      weeklyAllotment,
      paceUtilization,
      signals,
      classification: meta.classification,
      nature: meta.nature,
      cuttable: isCuttable(meta.name, meta.classification, meta.nature),
      topItems: weekTopItems.get(categoryId) ?? [],
    });
  }

  rows.sort((a, b) => b.weekAmount - a.weekAmount);

  const overCategories = rows.filter((r) => r.signals.length > 0);

  // Month-to-date spent for daily cap advice
  const monthStart = jakartaMidnight(week.year, week.month, 1);
  const monthEnd = new Date(
    jakartaMidnight(week.year, week.month, dim).getTime() +
      24 * 60 * 60 * 1000 -
      1
  );
  const mtdByCat = await sumExpensesByCategory(userId, monthStart, monthEnd);

  const advice: WeeklyAdvice[] = [];
  const cutTargets = overCategories
    .filter((r) => r.cuttable && r.signals.includes("PACE_OVER"))
    .sort((a, b) => {
      const aDisc = a.classification === "DISCRETIONARY" ? 0 : 1;
      const bDisc = b.classification === "DISCRETIONARY" ? 0 : 1;
      if (aDisc !== bDisc) return aDisc - bDisc;
      return b.weekAmount - a.weekAmount;
    });

  for (const row of cutTargets.slice(0, 4)) {
    if (row.budgetAmount == null) continue;
    const mtd = mtdByCat.get(row.categoryId) ?? 0;
    const remaining = Math.max(0, row.budgetAmount - mtd);
    const days = Math.max(1, daysLeftInMonth || 7);
    const dailyCap = Math.round(remaining / days);
    advice.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      message:
        dailyCap > 0
          ? `Tahan ${row.categoryName}: max ${formatMoney(dailyCap, currency)}/hari sisa bulan (sisa budget ${formatMoney(remaining, currency)}).`
          : `${row.categoryName} sudah habis budget bulan ini — tahan belanja hepi di kategori ini minggu depan.`,
      dailyCap: dailyCap > 0 ? dailyCap : 0,
      priority: row.classification === "DISCRETIONARY" ? "HIGH" : "MEDIUM",
    });
  }

  const wowOnly = overCategories.filter(
    (r) =>
      r.cuttable &&
      r.signals.includes("WOW") &&
      !r.signals.includes("PACE_OVER")
  );
  for (const row of wowOnly.slice(0, 2)) {
    if (advice.some((a) => a.categoryId === row.categoryId)) continue;
    advice.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      message:
        row.wowChangePercent == null
          ? `${row.categoryName} baru muncul minggu ini — pantau, potong hepi dulu sebelum fixed/utang.`
          : `${row.categoryName} naik ${formatChangePct(row.wowChangePercent)} vs minggu lalu — pantau, potong hepi dulu sebelum fixed/utang.`,
      dailyCap: null,
      priority: "MEDIUM",
    });
  }

  if (advice.length === 0) {
    if (overCategories.length === 0) {
      advice.push({
        categoryId: null,
        categoryName: "",
        message:
          "Pace budget oke minggu ini. Tetap urutan: utang → fixed → pegangan → hepi → goals.",
        dailyCap: null,
        priority: "LOW",
      });
    } else {
      advice.push({
        categoryId: null,
        categoryName: "",
        message:
          "Ada kategori over, tapi itu fixed/utang/tabungan — jangan dipotong. Cek hepi (Lifestyle) minggu depan.",
        dailyCap: null,
        priority: "MEDIUM",
      });
    }
  }

  return {
    offset: weekOffset,
    label: week.label,
    start: week.start.toISOString(),
    end: week.end.toISOString(),
    expenses,
    prevExpenses,
    expenseChangePercent: changePercent(expenses, prevExpenses),
    topCategories: rows.slice(0, 5).map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      amount: r.weekAmount,
      topItems: r.topItems,
    })),
    overCategories,
    advice: advice.slice(0, 5),
    currency,
    daysLeftInMonth,
  };
}

/** Compact WhatsApp body (keep under ~1.5k chars). */
export function formatWeeklyReportWaText(review: WeeklyReview): string {
  const c = review.currency;
  const lines: string[] = [];
  // Must NOT start with "Finora " — that is the WA command prefix and
  // fromMe echoes would re-trigger parseWeeklyReportQuery in a loop.
  lines.push(`Vira · Report minggu ${review.label}`);
  lines.push(
    `Pengeluaran: ${formatMoney(review.expenses, c)} (vs minggu lalu ${formatChangePct(review.expenseChangePercent)})`
  );

  const overs = review.overCategories.slice(0, 5);
  if (overs.length === 0) {
    lines.push("");
    lines.push("Tidak ada kategori over pace/WoW.");
  } else {
    lines.push("");
    lines.push("Over / waspada:");
    for (const row of overs) {
      const tags = row.signals
        .map((s) =>
          s === "PACE_OVER" ? "pace!" : s === "PACE_WARN" ? "pace~" : "wow"
        )
        .join(",");
      lines.push(
        `• ${row.categoryName} ${formatMoney(row.weekAmount, c)} [${tags}]`
      );
      for (const item of row.topItems.slice(0, 3)) {
        lines.push(
          `  – ${item.label}: ${formatMoney(item.amount, c)}`
        );
      }
    }
  }

  if (review.advice.length > 0) {
    lines.push("");
    lines.push("Saran minggu depan:");
    for (const a of review.advice.slice(0, 4)) {
      lines.push(`• ${a.message}`);
    }
  }

  let text = lines.join("\n");
  if (text.length > 1500) {
    text = text.slice(0, 1490) + "…";
  }
  return text;
}

/** Detect pull commands like "report minggu", "rekap minggu". */
export function parseWeeklyReportQuery(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return false;
  if (
    /\b(report|rekap|laporan|ringkasan)\b/.test(t) &&
    /\b(minggu|weekly|pekan)\b/.test(t)
  ) {
    return true;
  }
  if (t === "mingguan" || t === "weekly" || t === "weekly report") return true;
  return false;
}

/** True during Sunday 20:00–20:04 Asia/Jakarta — wrap-up before the new week (dedupe via week key). */
export function isWeeklyReportCronWindow(now = new Date()): boolean {
  const p = jakartaParts(now);
  return p.weekday === 0 && p.hour === 20 && p.minute < 5;
}

export function weeklyReportWeekKey(now = new Date()): string {
  const { year, month, mondayDay } = getWeekBounds(0, now);
  return `${year}-${String(month).padStart(2, "0")}-${String(mondayDay).padStart(2, "0")}`;
}
