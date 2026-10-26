import { z } from "zod";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getActionCenter } from "@/lib/financial/recommendations/action-center";
import { FinancialRecommendation } from "@/models/FinancialRecommendation";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const data = await getActionCenter(userId, {
      refresh,
      searchParams: url.searchParams,
    });
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["VIEWED", "ACCEPTED", "DISMISSED"]),
});

/** Update recommendation lifecycle (alerts remain client-dismiss only for now). */
export async function PATCH(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = patchSchema.parse(await request.json());
    const doc = await FinancialRecommendation.findOneAndUpdate(
      { _id: body.id, userId },
      { $set: { status: body.status } },
      { new: true }
    );
    if (!doc) throw new Error("NOT_FOUND");
    return ok(doc);
  } catch (error) {
    return handleError(error);
  }
}
