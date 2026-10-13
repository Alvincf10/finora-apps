import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createTransactionSchema } from "@/lib/validations";
import { Transaction } from "@/models/Transaction";
import { createTransaction } from "@/lib/financial/transactions";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const accountId = searchParams.get("accountId") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

    const filter: Record<string, unknown> = { userId };
    if (type) filter.type = type;
    if (accountId) filter.accountId = accountId;
    if (categoryId) filter.categoryId = categoryId;
    if (from || to) {
      filter.date = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(to) } : {}),
      };
    }
    if (q) {
      filter.$or = [
        { description: { $regex: q, $options: "i" } },
        { merchant: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    // Hide transfer IN legs from default list to avoid double-counting UX
    if (!type) {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { type: { $ne: "TRANSFER" } },
            { transferDirection: "OUT" },
            { transferDirection: { $exists: false } },
          ],
        },
      ];
    }

    const transactions = await Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .populate("accountId", "name currency")
      .populate("categoryId", "name type")
      .populate("counterpartyAccountId", "name");

    return ok(transactions);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createTransactionSchema.parse(await request.json());
    const tx = await createTransaction(userId, input);
    return ok(tx, 201);
  } catch (error) {
    return handleError(error);
  }
}
