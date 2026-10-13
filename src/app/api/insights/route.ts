import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  generatePhase2Insights,
  parsePeriod,
  persistInsights,
} from "@/lib/financial/phase2-service";
import { FinancialRecommendation } from "@/models/FinancialRecommendation";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const period = parsePeriod(searchParams);
    const refresh = searchParams.get("refresh") === "1";

    if (refresh) {
      const insights = await generatePhase2Insights(userId, period);
      const saved = await persistInsights(userId, period, insights);
      return ok(saved);
    }

    const existing = await FinancialRecommendation.find({
      userId,
      "period.year": period.year,
      "period.month": period.month,
      status: { $nin: ["DISMISSED", "EXPIRED"] },
    }).sort({ priority: 1, createdAt: -1 });

    if (existing.length === 0) {
      const insights = await generatePhase2Insights(userId, period);
      const saved = await persistInsights(userId, period, insights);
      return ok(saved);
    }

    return ok(existing);
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["VIEWED", "ACCEPTED", "DISMISSED"]),
});

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
