import { z } from "zod";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { Debt } from "@/models/Debt";
import { previewDebtTenor } from "@/lib/financial/decision/scenario-engine";

const schema = z.object({
  debtId: z.string().min(1),
  months: z.number().int().min(1).max(600),
});

/**
 * Preview installment tenor without mutating Debt (FR-04.5).
 * Persist separately via PATCH /api/debts/:id after user confirms.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = schema.parse(await request.json());
    const debt = await Debt.findOne({ _id: body.debtId, userId }).lean();
    if (!debt) throw new Error("NOT_FOUND");

    const preview = previewDebtTenor({
      remainingAmount: debt.remainingAmount,
      months: body.months,
      annualInterestRate: debt.interestRate ?? null,
    });

    return ok({
      debtId: debt._id.toString(),
      name: debt.name,
      currency: debt.currency,
      remainingAmount: debt.remainingAmount,
      ...preview,
    });
  } catch (error) {
    return handleError(error);
  }
}
