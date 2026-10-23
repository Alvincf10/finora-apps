import { WhatsAppOutbound } from "@/models/WhatsAppOutbound";
import { WhatsAppSession } from "@/models/WhatsAppSession";
import {
  formatWeeklyReportWaText,
  getWeeklyReview,
} from "@/lib/financial/weekly-review";

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export async function enqueueWeeklyReport(
  userId: string,
  options: { weekOffset?: number; kind?: "WEEKLY_REPORT" | "MANUAL" } = {}
) {
  const session = await WhatsAppSession.findOne({ userId });
  if (!session) {
    throw new Error("WHATSAPP_NOT_CONFIGURED");
  }
  const toPhone = digitsOnly(session.allowedFrom);
  if (!toPhone) {
    throw new Error("ALLOWED_FROM_REQUIRED");
  }

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
