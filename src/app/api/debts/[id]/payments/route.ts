import { ok, handleError } from "@/lib/api";
import { recordDebtPayment } from "@/lib/financial/record-debt-payment";
import { requireUser } from "@/lib/session";
import { createDebtPaymentSchema } from "@/lib/validations";
import { DebtPayment } from "@/models/DebtPayment";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const payments = await DebtPayment.find({ userId, debtId: id }).sort({
      date: -1,
    });
    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = createDebtPaymentSchema.parse(await request.json());

    const result = await recordDebtPayment({
      userId,
      debtId: id,
      accountId: input.accountId,
      amount: input.amount,
      date: new Date(input.date),
      notes: input.notes,
    });

    return ok(result, 201);
  } catch (error) {
    return handleError(error);
  }
}
