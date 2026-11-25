import mongoose from "mongoose";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { Debt } from "@/models/Debt";
import { DebtPayment } from "@/models/DebtPayment";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const debts = await Debt.find({
      userId,
      status: { $in: ["PAID", "CANCELLED"] },
    })
      .select({
        name: 1,
        kind: 1,
        originalAmount: 1,
        remainingAmount: 1,
        currency: 1,
        status: 1,
        dueDate: 1,
        updatedAt: 1,
        createdAt: 1,
      })
      .lean();

    const ids = debts.map((d) => d._id);
    const lastPayments =
      ids.length === 0
        ? []
        : await DebtPayment.aggregate<{
            _id: mongoose.Types.ObjectId;
            lastPaidAt: Date;
          }>([
            {
              $match: {
                userId: new mongoose.Types.ObjectId(userId),
                debtId: { $in: ids },
              },
            },
            {
              $group: {
                _id: "$debtId",
                lastPaidAt: { $max: "$date" },
              },
            },
          ]);

    const lastByDebt = new Map(
      lastPayments.map((p) => [p._id.toString(), p.lastPaidAt] as const)
    );

    const items = debts.map((d) => {
      const id = d._id.toString();
      const lastPaidAt = lastByDebt.get(id) ?? null;
      const fallback =
        (d as { updatedAt?: Date }).updatedAt ??
        (d as { createdAt?: Date }).createdAt ??
        null;
      const sortAt = lastPaidAt ?? fallback;
      return {
        _id: id,
        name: d.name,
        kind: d.kind,
        originalAmount: d.originalAmount,
        remainingAmount: d.remainingAmount,
        currency: d.currency,
        status: d.status,
        dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : undefined,
        lastPaidAt: lastPaidAt ? new Date(lastPaidAt).toISOString() : null,
        sortAt: sortAt ? new Date(sortAt).toISOString() : "",
      };
    });

    items.sort((a, b) => {
      const ta = a.sortAt ? new Date(a.sortAt).getTime() : 0;
      const tb = b.sortAt ? new Date(b.sortAt).getTime() : 0;
      return tb - ta;
    });

    return ok(items);
  } catch (error) {
    return handleError(error);
  }
}
