import { WhatsAppOutbound } from "@/models/WhatsAppOutbound";
import { WhatsAppSession } from "@/models/WhatsAppSession";
import {
  formatWeeklyReportWaText,
  getWeeklyReview,
} from "@/lib/financial/weekly-review";
import {
  formatFixedCostDueWaText,
  getUnpaidFixedCostsDueToday,
} from "@/lib/financial/fixed-cost-reminders";

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

  const review = await getWeeklyReview(userId, options.weekOffset ?? 0);
  const body = formatWeeklyReportWaText(review);

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
