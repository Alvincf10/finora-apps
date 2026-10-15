import { addMonths, addWeeks, startOfDay } from "date-fns";
import { RecurringTransaction } from "@/models/RecurringTransaction";
import { Transaction } from "@/models/Transaction";
import { createTransaction } from "@/lib/financial/transactions";
import { daysInMonth } from "@/lib/financial/phase2-math";
import type { Currency } from "@/types";

const MAX_POSTS_PER_TEMPLATE = 24;

export function computeNextMonthlyOccurrence(
  dayOfMonth: number,
  from: Date = new Date()
): Date {
  const today = startOfDay(from);
  const dim = daysInMonth(today.getFullYear(), today.getMonth() + 1);
  const thisMonth = startOfDay(
    new Date(today.getFullYear(), today.getMonth(), Math.min(dayOfMonth, dim))
  );
  if (thisMonth >= today) return thisMonth;

  const next = addMonths(today, 1);
  const dimNext = daysInMonth(next.getFullYear(), next.getMonth() + 1);
  return startOfDay(
    new Date(next.getFullYear(), next.getMonth(), Math.min(dayOfMonth, dimNext))
  );
}

export function advanceOccurrence(
  current: Date,
  frequency: "MONTHLY" | "WEEKLY",
  dayOfMonth?: number | null
): Date {
  if (frequency === "WEEKLY") {
    return startOfDay(addWeeks(current, 1));
  }
  const base = addMonths(startOfDay(current), 1);
  const day = dayOfMonth ?? current.getDate();
  const dim = daysInMonth(base.getFullYear(), base.getMonth() + 1);
  return startOfDay(
    new Date(base.getFullYear(), base.getMonth(), Math.min(day, dim))
  );
}

export type GeneratedRecurring = {
  recurringId: string;
  description: string;
  transactionId: string;
  date: string;
  amount: number;
  currency: Currency;
};

/**
 * Post all due recurring templates for a user into the ledger.
 * Advances nextOccurrence after each successful post.
 */
export async function generateDueRecurringTransactions(
  userId: string,
  asOf: Date = new Date()
): Promise<GeneratedRecurring[]> {
  const today = startOfDay(asOf);
  const due = await RecurringTransaction.find({
    userId,
    isActive: true,
    nextOccurrence: { $lte: today },
  });

  const created: GeneratedRecurring[] = [];

  for (const template of due) {
    let next = startOfDay(new Date(template.nextOccurrence));
    let posts = 0;

    while (
      next <= today &&
      posts < MAX_POSTS_PER_TEMPLATE &&
      (!template.endDate || next <= startOfDay(new Date(template.endDate)))
    ) {
      const tx = await createTransaction(userId, {
        type: template.type,
        amount: template.amount,
        currency: template.currency as Currency,
        accountId: template.accountId.toString(),
        categoryId: template.categoryId.toString(),
        description:
          template.description ||
          `Recurring ${template.type.toLowerCase()}`,
        date: next.toISOString(),
      });

      await Transaction.updateOne(
        { _id: tx._id },
        { $set: { recurring: true, recurringId: template._id } }
      );

      created.push({
        recurringId: template._id.toString(),
        description: template.description || template.type,
        transactionId: tx._id.toString(),
        date: next.toISOString(),
        amount: template.amount,
        currency: template.currency as Currency,
      });

      next = advanceOccurrence(
        next,
        template.frequency as "MONTHLY" | "WEEKLY",
        template.dayOfMonth
      );
      posts += 1;
    }

    template.nextOccurrence = next;
    template.lastGeneratedAt = new Date();
    if (
      template.endDate &&
      startOfDay(new Date(template.nextOccurrence)) >
        startOfDay(new Date(template.endDate))
    ) {
      template.isActive = false;
    }
    await template.save();
  }

  return created;
}
