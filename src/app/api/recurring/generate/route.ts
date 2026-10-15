import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { generateDueRecurringTransactions } from "@/lib/financial/recurring";

export async function POST() {
  try {
    const { userId } = await requireUser();
    const created = await generateDueRecurringTransactions(userId);
    return ok({
      createdCount: created.length,
      created,
    });
  } catch (error) {
    return handleError(error);
  }
}
