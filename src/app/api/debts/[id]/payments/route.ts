import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createDebtPaymentSchema } from "@/lib/validations";
import { sessionOption, withTransaction } from "@/lib/with-transaction";
import { Debt } from "@/models/Debt";
import { DebtPayment } from "@/models/DebtPayment";
import { Transaction } from "@/models/Transaction";
import { Category } from "@/models/Category";
import {
  getAccountOrThrow,
  recalculateAccountBalance,
} from "@/lib/financial/balances";

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

    const debt = await Debt.findOne({ _id: id, userId });
    if (!debt) throw new Error("NOT_FOUND");
    if (debt.status !== "ACTIVE") throw new Error("Debt is not active");

    const account = await getAccountOrThrow(input.accountId, userId);
    if (account.currency !== debt.currency) {
      throw new Error("Account currency must match debt currency");
    }

    let debtCategory = await Category.findOne({
      userId,
      name: "Debt Payment",
      type: "EXPENSE",
    });
    if (!debtCategory) {
      debtCategory = await Category.create({
        userId,
        name: "Debt Payment",
        type: "EXPENSE",
        isSystem: true,
        isActive: true,
      });
    }

    const result = await withTransaction(async (session) => {
      const freshDebt = await Debt.findOne({ _id: id, userId }).session(
        session
      );
      if (!freshDebt) throw new Error("NOT_FOUND");
      if (freshDebt.status !== "ACTIVE") throw new Error("Debt is not active");

      const [tx] = await Transaction.create(
        [
          {
            userId,
            accountId: account._id,
            type: "EXPENSE",
            amount: input.amount,
            currency: freshDebt.currency,
            categoryId: debtCategory._id,
            description: `Debt payment: ${freshDebt.name}`,
            date: new Date(input.date),
            notes: input.notes,
            debtId: freshDebt._id,
          },
        ],
        sessionOption(session)
      );

      const [payment] = await DebtPayment.create(
        [
          {
            userId,
            debtId: freshDebt._id,
            accountId: account._id,
            amount: input.amount,
            currency: freshDebt.currency,
            date: new Date(input.date),
            notes: input.notes,
            transactionId: tx._id,
          },
        ],
        sessionOption(session)
      );

      freshDebt.remainingAmount = Math.max(
        0,
        freshDebt.remainingAmount - input.amount
      );
      if (freshDebt.remainingAmount === 0) freshDebt.status = "PAID";
      await freshDebt.save(sessionOption(session));

      await recalculateAccountBalance(
        account._id.toString(),
        session ?? undefined
      );

      return { payment, debt: freshDebt };
    });

    return ok(result, 201);
  } catch (error) {
    return handleError(error);
  }
}
