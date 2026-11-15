import { ok, handleError } from "@/lib/api";
import { suggestPaydayAllocation } from "@/lib/financial/payday-allocation";
import {
  resolvePaydayTargetCycle,
  type PaydayCycleTarget,
} from "@/lib/financial/pay-cycle";
import { requireUser } from "@/lib/session";
import { savePaydayAllocationSchema } from "@/lib/validations";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { User } from "@/models/User";

function parseTarget(
  raw: string | null
): PaydayCycleTarget | "auto" {
  if (raw === "current" || raw === "next" || raw === "auto") return raw;
  return "auto";
}

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const target = parseTarget(url.searchParams.get("target"));
    return ok(
      await suggestPaydayAllocation(userId, new Date(), {
        ignoreSaved: refresh,
        target,
      })
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = savePaydayAllocationSchema.parse(await request.json());
    const user = await User.findById(userId).lean();
    const paydayDay = user?.paydayDay ?? 25;
    const currency = user?.baseCurrency ?? "IDR";
    const targetPref = parseTarget(input.target ?? null);
    const resolved = resolvePaydayTargetCycle(
      paydayDay,
      new Date(),
      targetPref
    );
    const cycle = resolved.cycle;

    if (input.resetToSuggestion) {
      await PaydayAllocation.deleteOne({
        userId,
        cycleStart: cycle.start,
      });
      return ok(
        await suggestPaydayAllocation(userId, new Date(), {
          ignoreSaved: true,
          target: resolved.target,
        })
      );
    }

    const salary = input.salary ?? user?.monthlySalary ?? 0;
    const startingCash = input.startingCash ?? 0;
    const envelopes = input.envelopes ?? [];

    const doc = await PaydayAllocation.findOneAndUpdate(
      { userId, cycleStart: cycle.start },
      {
        $set: {
          userId,
          cycleStart: cycle.start,
          cycleEnd: cycle.end,
          currency,
          salary,
          startingCash,
          envelopes: envelopes.map((e) => ({
            key: e.key,
            label: e.label,
            amount: e.amount,
            source: e.source ?? "MANUAL",
            kind: e.kind ?? "OTHER",
            linkedDebtId: e.linkedDebtId,
            linkedAccountId: e.linkedAccountId,
            linkedFixedCostId: e.linkedFixedCostId,
            paid: e.paid ?? false,
          })),
          status: input.status ?? "ACTIVE",
          notes: input.notes,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const allocated = doc.envelopes.reduce(
      (s: number, e: { amount: number }) => s + e.amount,
      0
    );
    const totalIn = doc.salary + doc.startingCash;

    return ok({
      id: doc._id.toString(),
      cycle: {
        start: cycle.start.toISOString(),
        end: cycle.end.toISOString(),
        paydayDay: cycle.paydayDay,
        label: cycle.label,
      },
      target: resolved.target,
      currentCycle: {
        start: resolved.currentCycle.start.toISOString(),
        end: resolved.currentCycle.end.toISOString(),
        label: resolved.currentCycle.label,
      },
      nextCycle: {
        start: resolved.nextCycle.start.toISOString(),
        end: resolved.nextCycle.end.toISOString(),
        label: resolved.nextCycle.label,
      },
      currency: doc.currency,
      salary: doc.salary,
      baseSalary: user?.monthlySalary ?? 0,
      startingCash: doc.startingCash,
      totalIn,
      envelopes: doc.envelopes,
      status: doc.status,
      allocated,
      remaining: totalIn - allocated,
      configured: true,
      existingId: doc._id.toString(),
      existingStatus: doc.status,
    });
  } catch (error) {
    return handleError(error);
  }
}
