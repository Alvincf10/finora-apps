import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getWeeklyReview } from "@/lib/financial/weekly-review";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const params = new URL(request.url).searchParams;
    const raw = Number(params.get("offset") ?? "0");
    const offset = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    // Allow looking back up to ~1 year
    const clamped = Math.min(0, Math.max(-52, offset));
    const review = await getWeeklyReview(userId, clamped);
    return ok(review);
  } catch (error) {
    return handleError(error);
  }
}
