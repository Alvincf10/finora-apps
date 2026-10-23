import { ok, handleError } from "@/lib/api";
import { getPayCycleBounds } from "@/lib/financial/pay-cycle";
import { getFixedCostPaidIdsInCycle } from "@/lib/financial/record-fixed-cost-payment";
import { requireUser } from "@/lib/session";
import { createFixedCostSchema } from "@/lib/validations";
import { FixedCost } from "@/models/FixedCost";
import { User } from "@/models/User";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const user = await User.findById(userId).lean();
    const cycle = getPayCycleBounds(user?.paydayDay ?? 25);
    const [items, paidIds] = await Promise.all([
      FixedCost.find({ userId }).sort({ dueDay: 1, name: 1 }).lean(),
      getFixedCostPaidIdsInCycle(userId, cycle.start, cycle.end),
    ]);

    return ok(
      items.map((item) => ({
        ...item,
        paidThisCycle: paidIds.has(item._id.toString()),
        cycleLabel: cycle.label,
      }))
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
