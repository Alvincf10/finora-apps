import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  generatePhase2Insights,
  parsePeriod,
  persistInsights,
} from "@/lib/financial/phase2-service";
import { evaluateWealthLadder } from "@/lib/financial/wealth-ladder";
import {
  getPayCycleForPeriod,
  getUserPaydayDay,
} from "@/lib/financial/pay-cycle";
import { FinancialRecommendation } from "@/models/FinancialRecommendation";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const period = await parsePeriod(searchParams, userId);
    const refresh = searchParams.get("refresh") === "1";

    const ladder = await evaluateWealthLadder(userId, period);
    const paydayDay = await getUserPaydayDay(userId);
    const cycle = getPayCycleForPeriod(paydayDay, period);
    const meta = { period, cycleLabel: cycle.label };

    if (refresh) {
      const insights = await generatePhase2Insights(userId, period);
      const saved = await persistInsights(userId, period, insights);
      return ok({ insights: saved, ladder, ...meta });
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
      return ok({ insights: saved, ladder, ...meta });
    }

    return ok({ insights: existing, ladder, ...meta });
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
