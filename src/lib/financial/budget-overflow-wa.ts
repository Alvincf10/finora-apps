import { formatMoney } from "@/lib/money";
import { getWeeklyBudgetSpent } from "@/lib/financial/weekly-budget";
import { enqueueBudgetAlert } from "@/lib/whatsapp/outbound";

/**
 * After an expense lands, WhatsApp once per category per week when weekly
 * budget hits 80% (hati-hati) or goes over 100%.
 */
export async function maybeNotifyBudgetOverflow(
  userId: string,
  categoryId: string | null | undefined
): Promise<void> {
  if (!categoryId) return;

  try {
    const row = await getWeeklyBudgetSpent(userId, categoryId, 0);
    if (!row) return;

    if (row.actualAmount > row.budgetAmount) {
      const overBy = row.actualAmount - row.budgetAmount;
      await enqueueBudgetAlert(userId, {
        dedupeKey: `budget-over:${row.weekKey}:${categoryId}`,
        kind: "BUDGET_OVERFLOW",
        body: [
          `Vira · Budget overflow`,
          `${row.categoryName} sudah melebihi plafon minggu ini (${row.label}).`,
          `Terpakai ${formatMoney(row.actualAmount, row.currency)} / ${formatMoney(row.budgetAmount, row.currency)} (+${formatMoney(overBy, row.currency)}).`,
        ].join("\n"),
      });
      return;
    }

    if (row.utilizationPercentage >= 80) {
      const left = Math.max(0, row.budgetAmount - row.actualAmount);
      await enqueueBudgetAlert(userId, {
        dedupeKey: `budget-warn:${row.weekKey}:${categoryId}`,
        kind: "BUDGET_WARNING",
        body: [
          `Vira · Hati-hati budget`,
          `${row.categoryName} sudah ${row.utilizationPercentage}% plafon minggu ini (${row.label}) — minggu belum selesai.`,
          `Terpakai ${formatMoney(row.actualAmount, row.currency)} / ${formatMoney(row.budgetAmount, row.currency)} (sisa ${formatMoney(left, row.currency)}).`,
        ].join("\n"),
      });
    }
  } catch {
    // WhatsApp / session errors must not break transaction writes.
  }
}
