import { ok, handleError } from "@/lib/api";
import { getDebtCrushPlan } from "@/lib/financial/debt-crush-service";
import { requireUser } from "@/lib/session";
import { z } from "zod";

const querySchema = z.object({
  income: z.coerce.number().int().min(0).optional(),
  livingCap: z.coerce.number().int().min(0).optional(),
  cycleCount: z.coerce.number().int().min(1).max(6).optional(),
  includeCc: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v !== "0" && v !== "false"),
  fromTarget: z.enum(["current", "next"]).optional(),
});

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      income: url.searchParams.get("income") ?? undefined,
      livingCap: url.searchParams.get("livingCap") ?? undefined,
      cycleCount: url.searchParams.get("cycleCount") ?? undefined,
      includeCc: url.searchParams.get("includeCc") ?? undefined,
      fromTarget: url.searchParams.get("fromTarget") ?? undefined,
    });

    const result = await getDebtCrushPlan(userId, {
      income: parsed.income,
      livingCap: parsed.livingCap,
      cycleCount: parsed.cycleCount,
      includeSeparateLiability: parsed.includeCc ?? true,
      fromTarget: parsed.fromTarget ?? "next",
      paySeparateLiabilityFromSurplus: true,
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
