import { Account } from "@/models/Account";
import {
  creditAvailable,
  creditUtilizationPct,
  isLiabilityAccount,
} from "@/lib/financial/balances";
import { formatMoney } from "@/lib/money";
import { enqueueCcLimitAlert } from "@/lib/whatsapp/outbound";
import type { AccountType, Currency } from "@/types";

const WARN_PCT = 80;

function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * After a CC expense, WhatsApp once per card per month when utilization
 * hits 80% (mendekati limit) or reaches/exceeds 100% (limit habis).
 */
export async function maybeNotifyCcLimit(
  userId: string,
  accountId: string | null | undefined
): Promise<void> {
  if (!accountId) return;

  try {
    const account = await Account.findOne({
      _id: accountId,
      userId,
      isActive: true,
    }).lean();
    if (!account || !isLiabilityAccount(account.type as AccountType)) return;

    const creditLimit = Math.max(0, account.creditLimit ?? 0);
    if (creditLimit <= 0) return;

    const outstanding = Math.max(0, account.currentBalance ?? 0);
    const available =
      creditAvailable({
        type: account.type,
        creditLimit,
        currentBalance: outstanding,
      }) ?? 0;
    const utilization =
      creditUtilizationPct({
        type: account.type,
        creditLimit,
        currentBalance: outstanding,
      }) ?? 0;

    const currency = account.currency as Currency;
    const key = monthKey();
    const name = account.name;

    if (available <= 0 || utilization >= 100) {
      await enqueueCcLimitAlert(userId, {
        dedupeKey: `cc-over:${key}:${accountId}`,
        kind: "CC_LIMIT_OVERFLOW",
        body: [
          `Vira · Limit CC habis`,
          `${name} sudah di / melebihi limit.`,
          `Outstanding ${formatMoney(outstanding, currency)} / limit ${formatMoney(creditLimit, currency)}.`,
          `Sisa limit ${formatMoney(0, currency)} — tahan belanja CC atau bayar tagihan dulu.`,
        ].join("\n"),
      });
      return;
    }

    if (utilization >= WARN_PCT) {
      await enqueueCcLimitAlert(userId, {
        dedupeKey: `cc-warn:${key}:${accountId}`,
        kind: "CC_LIMIT_WARNING",
        body: [
          `Vira · CC mendekati limit`,
          `${name} sudah ${utilization}% terpakai.`,
          `Outstanding ${formatMoney(outstanding, currency)} / limit ${formatMoney(creditLimit, currency)} (sisa ${formatMoney(available, currency)}).`,
        ].join("\n"),
      });
    }
  } catch {
    // WhatsApp / session errors must not break transaction writes.
  }
}
