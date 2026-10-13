import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getDebtScenarios,
  getEmergencyFundAnalysis,
  parsePeriod,
  simulateWhatIf,
} from "@/lib/financial/phase2-service";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = parsePeriod(new URL(request.url).searchParams);
    const [debts, emergency] = await Promise.all([
      getDebtScenarios(userId),
      getEmergencyFundAnalysis(userId, period),
    ]);
    return ok({ debts, emergency, period });
  } catch (error) {
    return handleError(error);
  }
}

const whatIfSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().optional(),
  incomeOverride: z.number().int().optional(),
  expenseOverrides: z
    .array(
      z.object({
        categoryId: z.string(),
        amount: z.number().int(),
      })
    )
    .optional(),
  debtPaymentOverride: z.number().int().optional(),
  savingsOverride: z.number().int().optional(),
});

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = whatIfSchema.parse(await request.json());
    const now = new Date();
    const period = {
      year: body.year ?? now.getFullYear(),
      month: body.month ?? now.getMonth() + 1,
    };
    const result = await simulateWhatIf(userId, period, body);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
