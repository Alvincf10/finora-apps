import { WhatsAppOutbound } from "@/models/WhatsAppOutbound";
import { WhatsAppSession } from "@/models/WhatsAppSession";
import {
  formatWeeklyReportWaText,
  getWeeklyReview,
} from "@/lib/financial/weekly-review";
import { applyWeeklyBudgetSuggestions } from "@/lib/financial/budget-from-weekly";
import {
  formatFixedCostDueWaText,
  getUnpaidFixedCostsDueToday,
} from "@/lib/financial/fixed-cost-reminders";
import { formatMoney } from "@/lib/money";
import type { WhatsAppAlertKind } from "@/lib/whatsapp/outbound-kinds";

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

async function resolveOutboundPhone(userId: string) {
  const session = await WhatsAppSession.findOne({ userId });
  if (!session) {
    throw new Error("WHATSAPP_NOT_CONFIGURED");
  }
  const toPhone = digitsOnly(session.allowedFrom);
  if (!toPhone) {
    throw new Error("ALLOWED_FROM_REQUIRED");
  }
  return toPhone;
}

export async function enqueueWeeklyReport(
  userId: string,
  options: { weekOffset?: number; kind?: "WEEKLY_REPORT" | "MANUAL" } = {}
) {
  const toPhone = await resolveOutboundPhone(userId);
  const weekOffset = options.weekOffset ?? 0;

  // Auto-set next-week caps from advice (amount as-is, 1 week only).
  let syncNote = "";
  try {
    const synced = await applyWeeklyBudgetSuggestions(userId, weekOffset);
    if (synced.applied.length > 0) {
      const lines = synced.applied
        .slice(0, 4)
        .map(
          (a) =>
            `• ${a.categoryName}: ${formatMoney(a.weeklyAmount, a.currency)}`
        );
      syncNote = [
        "",
        `Budget minggu depan (${synced.weekLabel}):`,
        ...lines,
      ].join("\n");
    }
  } catch {
    // Budget sync is best-effort; still send the weekly report.
  }

  const review = await getWeeklyReview(userId, weekOffset);
  let body = formatWeeklyReportWaText(review) + syncNote;
  if (body.length > 1500) {
    body = body.slice(0, 1490) + "…";
  }

  const doc = await WhatsAppOutbound.create({
    userId,
    toPhone,
    body,
    kind: options.kind ?? "WEEKLY_REPORT",
    status: "pending",
  });

  return {
    id: String(doc._id),
    toPhone,
    body,
    status: doc.status as string,
  };
}

/**
 * Queue a deduped WhatsApp alert (budget / CC limit).
 * Returns null when already queued/sent for the same dedupeKey.
 */
async function enqueueDedupeAlert(
  userId: string,
  input: {
    dedupeKey: string;
    kind: WhatsAppAlertKind;
    body: string;
  }
) {
  const toPhone = await resolveOutboundPhone(userId);

  const existing = await WhatsAppOutbound.findOne({
    userId,
    dedupeKey: input.dedupeKey,
    status: { $in: ["pending", "sent"] },
  }).lean();
  if (existing) return null;

  try {
    const doc = await WhatsAppOutbound.create({
      userId,
      toPhone,
      body: input.body,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      status: "pending",
    });
    return {
      id: String(doc._id),
      toPhone,
      body: input.body,
      status: doc.status as string,
    };
  } catch (error) {
    // Unique partial index race — treat as already queued.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return null;
    }
    throw error;
  }
}

/** Once-per-week budget WhatsApp alert (80% warning or overflow). */
export async function enqueueBudgetAlert(
  userId: string,
  input: {
    dedupeKey: string;
    kind: "BUDGET_OVERFLOW" | "BUDGET_WARNING";
    body: string;
  }
) {
  return enqueueDedupeAlert(userId, input);
}

/** Once-per-month CC limit WhatsApp alert (80% warning or at/over limit). */
export async function enqueueCcLimitAlert(
  userId: string,
  input: {
    dedupeKey: string;
    kind: "CC_LIMIT_OVERFLOW" | "CC_LIMIT_WARNING";
    body: string;
  }
) {
  return enqueueDedupeAlert(userId, input);
}

/**
 * Queue H-0 fixed-cost reminder for unpaid dues today.
 * Returns null when there is nothing to send (caller should still mark dedup).
 */
export async function enqueueFixedCostDueReminder(userId: string, now = new Date()) {
  const items = await getUnpaidFixedCostsDueToday(userId, now);
  if (items.length === 0) return null;

  const toPhone = await resolveOutboundPhone(userId);
  const body = formatFixedCostDueWaText(items);

  const doc = await WhatsAppOutbound.create({
    userId,
    toPhone,
    body,
    kind: "FIXED_COST_DUE",
    status: "pending",
  });

  return {
    id: String(doc._id),
    toPhone,
    body,
    status: doc.status as string,
    itemCount: items.length,
  };
}
