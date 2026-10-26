import { ok, handleError } from "@/lib/api";
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import { getFixedCostPaymentsInCycle } from "@/lib/financial/record-fixed-cost-payment";
import { requireUser } from "@/lib/session";
import { createFixedCostSchema } from "@/lib/validations";
import { Account } from "@/models/Account";
import { FixedCost } from "@/models/FixedCost";
import { User } from "@/models/User";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const user = await User.findById(userId).lean();
    const cycle = getPayCycleBounds(user?.paydayDay ?? 25);
    const [items, payments] = await Promise.all([
      FixedCost.find({ userId }).sort({ dueDay: 1, name: 1 }).lean(),
      getFixedCostPaymentsInCycle(userId, cycle.start, cycle.end),
    ]);

    const accountIds = [...new Set([...payments.values()].map((p) => p.accountId))];
    const accounts =
      accountIds.length > 0
        ? await Account.find({ _id: { $in: accountIds }, userId })
            .select({ name: 1 })
            .lean()
        : [];
    const accountNameById = new Map(
      accounts.map((a) => [a._id.toString(), a.name as string])
    );

    return ok(
      items.map((item) => {
        const id = item._id.toString();
        const payment = payments.get(id);
        return {
          ...item,
          paidThisCycle: Boolean(payment),
          paidFromAccountId: payment?.accountId,
          paidFromAccountName: payment
            ? accountNameById.get(payment.accountId)
            : undefined,
          cycleLabel: cycle.label,
        };
      })
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createFixedCostSchema.parse(await request.json());

    const item = await FixedCost.create({
      userId,
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      dueDay: input.dueDay,
      notes: input.notes,
      isActive: true,
    });

    return ok(item, 201);
  } catch (error) {
    return handleError(error);
  }
}
