import { ok, handleError } from "@/lib/api";
import { recordFixedCostPayment } from "@/lib/financial/record-fixed-cost-payment";
import { requireUser } from "@/lib/session";
import { payFixedCostSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = payFixedCostSchema.parse(body ?? {});

    const result = await recordFixedCostPayment({
      userId,
      fixedCostId: id,
      accountId: input.accountId,
      amount: input.amount,
      date: input.date ? new Date(input.date) : undefined,
      notes: input.notes,
    });

    return ok(result, result.alreadyPaidThisCycle ? 200 : 201);
  } catch (error) {
    return handleError(error);
  }
}
