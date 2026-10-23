import { ok, handleError, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enqueueWeeklyReport } from "@/lib/whatsapp/outbound";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json().catch(() => ({}));
    const raw = Number(body?.offset ?? 0);
    const offset = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    const clamped = Math.min(0, Math.max(-52, offset));

    const queued = await enqueueWeeklyReport(userId, {
      weekOffset: clamped,
      kind: "MANUAL",
    });
    return ok(queued);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "WHATSAPP_NOT_CONFIGURED") {
        return fail("WHATSAPP_NOT_CONFIGURED", "WhatsApp session not found", 400);
      }
      if (error.message === "ALLOWED_FROM_REQUIRED") {
        return fail(
          "ALLOWED_FROM_REQUIRED",
          "Set allowed sender number in WhatsApp settings first",
          400
        );
      }
    }
    return handleError(error);
  }
}
