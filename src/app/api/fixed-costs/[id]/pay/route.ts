import { ok, handleError } from "@/lib/api";
import {
  recordFixedCostPayment,
  reassignFixedCostPaymentSource,
} from "@/lib/financial/record-fixed-cost-payment";
import { requireUser } from "@/lib/session";
import {
  payFixedCostSchema,
  reassignFixedCostPaymentSchema,
} from "@/lib/validations";

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

/** Change funding account for an already-paid fixed cost this cycle. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = reassignFixedCostPaymentSchema.parse(body ?? {});

    const result = await reassignFixedCostPaymentSource({
      userId,
      fixedCostId: id,
      accountId: input.accountId,
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
