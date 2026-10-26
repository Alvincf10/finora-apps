import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getCommandCenter } from "@/lib/financial/command-center";
import { parsePeriod } from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    const hasPeriod =
      url.searchParams.get("year") && url.searchParams.get("month");
    const period = hasPeriod
      ? await parsePeriod(url.searchParams, userId)
      : undefined;
    const data = await getCommandCenter(userId, period);
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
