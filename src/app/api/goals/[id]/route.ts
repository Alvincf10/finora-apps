import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { contributeGoalSchema, createGoalSchema } from "@/lib/validations";
import { sessionOption, withTransaction } from "@/lib/with-transaction";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Transaction } from "@/models/Transaction";
import { Category } from "@/models/Category";
import {
  getAccountOrThrow,
  recalculateAccountBalance,
} from "@/lib/financial/balances";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = createGoalSchema.partial().parse(await request.json());
    const goal = await SavingsGoal.findOne({ _id: id, userId });
    if (!goal) throw new Error("NOT_FOUND");

    if (input.name !== undefined) goal.name = input.name;
    if (input.targetAmount !== undefined) {
      goal.targetAmount = input.targetAmount;
      if (
        goal.status === "ACTIVE" &&
        goal.currentAmount >= goal.targetAmount
      ) {
        goal.status = "COMPLETED";
      } else if (
        goal.status === "COMPLETED" &&
        goal.currentAmount < goal.targetAmount
      ) {
        goal.status = "ACTIVE";
      }
    }
    if (input.currentAmount !== undefined) {
      goal.currentAmount = input.currentAmount;
    }
    if (input.priority !== undefined) goal.priority = input.priority;
    if (input.notes !== undefined) goal.notes = input.notes;
    if (input.targetDate !== undefined) {
      goal.targetDate = input.targetDate
        ? new Date(input.targetDate)
        : undefined;
    }

    await goal.save();
    return ok(goal);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = contributeGoalSchema.parse(await request.json());

    const goal = await SavingsGoal.findOne({ _id: id, userId });
    if (!goal) throw new Error("NOT_FOUND");
    if (goal.status !== "ACTIVE") throw new Error("Goal is not active");

    const account = await getAccountOrThrow(input.accountId, userId);
    if (account.currency !== goal.currency) {
      throw new Error("Account currency must match goal currency");
    }

    let savingsCategory = await Category.findOne({
      userId,
      name: "Savings",
      type: "EXPENSE",
    });
    if (!savingsCategory) {
      savingsCategory = await Category.create({
        userId,
        name: "Savings",
        type: "EXPENSE",
        isSystem: true,
        isActive: true,
      });
    }

    const updated = await withTransaction(async (session) => {
      const freshGoal = await SavingsGoal.findOne({ _id: id, userId }).session(
        session
      );
      if (!freshGoal) throw new Error("NOT_FOUND");
      if (freshGoal.status !== "ACTIVE") throw new Error("Goal is not active");

      await Transaction.create(
        [
          {
            userId,
            accountId: account._id,
            type: "EXPENSE",
            amount: input.amount,
            currency: freshGoal.currency,
            categoryId: savingsCategory._id,
            description: `Contribution: ${freshGoal.name}`,
            date: input.date ? new Date(input.date) : new Date(),
            notes: input.notes,
            goalId: freshGoal._id,
          },
        ],
        sessionOption(session)
      );

      freshGoal.currentAmount += input.amount;
      if (freshGoal.currentAmount >= freshGoal.targetAmount) {
        freshGoal.status = "COMPLETED";
      }
      await freshGoal.save(sessionOption(session));
      await recalculateAccountBalance(
        account._id.toString(),
        session ?? undefined
      );
      return freshGoal;
    });

    return ok(updated, 201);
  } catch (error) {
    return handleError(error);
  }
}
