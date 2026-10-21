import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createDebtSchema } from "@/lib/validations";
import { Debt } from "@/models/Debt";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const debts = await Debt.find({ userId }).sort({ createdAt: -1 });
    return ok(debts);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createDebtSchema.parse(await request.json());

    const debt = await Debt.create({
      userId,
      name: input.name,
      kind: input.kind ?? "CONSUMER",
      originalAmount: input.originalAmount,
      remainingAmount: input.originalAmount,
      currency: input.currency,
      interestRate: input.interestRate,
      minimumPayment: input.minimumPayment,
      plannedPayment: input.plannedPayment,
      installmentMonths: input.installmentMonths,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      targetPayoffDate: input.targetPayoffDate
        ? new Date(input.targetPayoffDate)
        : undefined,
      notes: input.notes,
      status: "ACTIVE",
    });

    return ok(debt, 201);
  } catch (error) {
    return handleError(error);
  }
}
