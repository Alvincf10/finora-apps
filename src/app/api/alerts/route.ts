import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getAlertsForUser } from "@/lib/financial/alerts";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const alerts = await getAlertsForUser(userId);
    return ok({
      count: alerts.length,
      critical: alerts.filter((a) => a.severity === "CRITICAL").length,
      alerts,
    });
  } catch (error) {
    return handleError(error);
  }
}
