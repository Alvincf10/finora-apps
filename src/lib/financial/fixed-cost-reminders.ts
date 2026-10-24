import { FixedCost } from "@/models/FixedCost";
import { formatMoney } from "@/lib/money";
import {
  getPayCycleBounds,
  getUserPaydayDay,
} from "@/lib/financial/pay-cycle";
import { getFixedCostPaidIdsInCycle } from "@/lib/financial/record-fixed-cost-payment";
import { jakartaParts } from "@/lib/financial/weekly-review";
import { daysInMonth } from "@/lib/financial/phase2-math";
import type { Currency } from "@/types";

export type FixedCostDueItem = {
  fixedCostId: string;
  name: string;
  amount: number;
  currency: Currency;
  dueDay: number;
};

const FOOTER =
  "Catat bayar di Fixed costs supaya cycle tetap rapi.";

/**
 * Active fixed costs whose due day (clamped to month length) is today in
 * Asia/Jakarta, excluding ones already paid this pay cycle.
 */
export async function getUnpaidFixedCostsDueToday(
  userId: string,
  now = new Date()
): Promise<FixedCostDueItem[]> {
  const j = jakartaParts(now);
  const dim = daysInMonth(j.year, j.month);
  const todayDueDay = j.day;

  const [costs, paydayDay] = await Promise.all([
    FixedCost.find({ userId, isActive: true }).lean(),
    getUserPaydayDay(userId),
  ]);

  const dueToday = costs.filter((c) => {
    const effective = Math.min(c.dueDay, dim);
    return effective === todayDueDay;
  });
  if (dueToday.length === 0) return [];

  const cycle = getPayCycleBounds(paydayDay, now);
  const paidIds = await getFixedCostPaidIdsInCycle(
    userId,
    cycle.start,
    cycle.end
  );

  return dueToday
    .filter((c) => !paidIds.has(String(c._id)))
    .map((c) => ({
      fixedCostId: String(c._id),
      name: c.name,
      amount: c.amount,
      currency: c.currency as Currency,
      dueDay: c.dueDay,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** WA body — must start with "Vira ·" (not "Finora ") to avoid command echo loops. */
export function formatFixedCostDueWaText(items: FixedCostDueItem[]): string {
  if (items.length === 0) {
    throw new Error("NO_FIXED_COSTS_DUE");
  }

  const dueDay = items[0]!.dueDay;
  const lines: string[] = [];
  lines.push("Vira · Tagihan jatuh tempo hari ini");
  lines.push("");

  if (items.length === 1) {
    const item = items[0]!;
    lines.push(
      `${item.name} · ${formatMoney(item.amount, item.currency)} (tgl ${dueDay})`
    );
  } else {
    for (const item of items) {
      lines.push(
        `• ${item.name} · ${formatMoney(item.amount, item.currency)}`
      );
    }
    lines.push("");
    lines.push(`${formatTotalsLine(items)} (tgl ${dueDay})`);
  }

  lines.push("");
  lines.push(FOOTER);

  let text = lines.join("\n");
  if (text.length > 1500) {
    text = text.slice(0, 1490) + "…";
  }
  return text;
}

function formatTotalsLine(items: FixedCostDueItem[]): string {
  const byCurrency = new Map<Currency, number>();
  for (const item of items) {
    byCurrency.set(
      item.currency,
      (byCurrency.get(item.currency) ?? 0) + item.amount
    );
  }
  const parts = [...byCurrency.entries()].map(([currency, amount]) =>
    formatMoney(amount, currency)
  );
  return `Total: ${parts.join(" · ")}`;
}

/** True during 08:00–08:04 Asia/Jakarta — morning H-0 reminder window. */
export function isFixedCostReminderCronWindow(now = new Date()): boolean {
  const p = jakartaParts(now);
  return p.hour === 8 && p.minute < 5;
}

/** Dedup key: Jakarta calendar day YYYY-MM-DD. */
export function fixedCostReminderDayKey(now = new Date()): string {
  const p = jakartaParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
