import { z } from "zod";
import { ok, handleError, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { User } from "@/models/User";
import { GoldPlan } from "@/models/GoldPlan";
import {
  applyFlatPayment,
  applyManualPayment,
  buildGoldPlanView,
  replayPayments,
} from "@/lib/financial/gold-plan-service";
import type { Currency } from "@/types";

const createSchema = z.object({
  action: z.literal("create_plan").optional(),
  name: z.string().trim().min(1).max(80),
  currency: z.enum(["IDR", "EUR"]).optional(),
  principal: z.number().int().positive(),
  monthlyRatePercent: z.number().min(0).max(100).optional(),
  startDate: z.string().min(4),
});

const updateSchema = z.object({
  planId: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  currency: z.enum(["IDR", "EUR"]).optional(),
  principal: z.number().int().positive(),
  monthlyRatePercent: z.number().min(0).max(100).optional(),
  startDate: z.string().min(4),
  resetPayments: z.boolean().optional(),
});

const paymentSchema = z
  .object({
    action: z.literal("add_payment"),
    planId: z.string().min(1),
    amount: z.number().int().positive().optional(),
    principalPortion: z.number().int().min(0).optional(),
    interestPortion: z.number().int().min(0).optional(),
    date: z.string().min(4).optional(),
    notes: z.string().max(200).optional(),
  })
  .superRefine((val, ctx) => {
    const p = val.principalPortion ?? 0;
    const i = val.interestPortion ?? 0;
    if (p <= 0 && i <= 0 && (val.amount == null || val.amount <= 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Isi bayar pokok dan/atau bunga",
        path: ["principalPortion"],
      });
    }
  });

const deletePaymentSchema = z.object({
  action: z.literal("delete_payment"),
  planId: z.string().min(1),
  paymentId: z.string().min(1),
});

const editPaymentSchema = z
  .object({
    action: z.literal("edit_payment"),
    planId: z.string().min(1),
    paymentId: z.string().min(1),
    principalPortion: z.number().int().min(0).optional(),
    interestPortion: z.number().int().min(0).optional(),
    date: z.string().min(4).optional(),
    notes: z.string().max(200).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const p = val.principalPortion ?? 0;
    const i = val.interestPortion ?? 0;
    if (p <= 0 && i <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Isi bayar pokok dan/atau bunga",
        path: ["principalPortion"],
      });
    }
  });

const deletePlanSchema = z.object({
  action: z.literal("delete_plan"),
  planId: z.string().min(1),
});

function syncPlanFromPayments(doc: InstanceType<typeof GoldPlan>) {
  type Pay = {
    amount: number;
    date: Date;
    principalPortion?: number | null;
    interestPortion?: number | null;
  };
  type Indexed = { p: Pay; index: number };
  const indexed: Indexed[] = doc.payments.map((p: Pay, index: number) => ({
    p,
    index,
  }));
  indexed.sort(
    (a: Indexed, b: Indexed) =>
      new Date(a.p.date).getTime() - new Date(b.p.date).getTime()
  );

  const replayed = replayPayments({
    principal: doc.principal,
    payments: indexed.map(({ p }: Indexed) => ({
      amount: p.amount,
      principalPortion: p.principalPortion,
      interestPortion: p.interestPortion,
    })),
  });

  indexed.forEach(({ p }: Indexed, j: number) => {
    const alloc = replayed.allocations[j];
    p.principalPortion = alloc?.principalPortion ?? 0;
    p.interestPortion = alloc?.interestPortion ?? 0;
    p.amount = (p.principalPortion ?? 0) + (p.interestPortion ?? 0);
  });

  doc.remainingPrincipal = replayed.remainingPrincipal;
  doc.remainingInterest = 0;
  doc.status = replayed.remainingPrincipal <= 0 ? "PAID" : "ACTIVE";
}

async function listPlans(userId: string) {
  const docs = await GoldPlan.find({ userId })
    .sort({ status: 1, createdAt: 1 })
    .lean();
  return docs.map((d) => buildGoldPlanView(d));
}

/** Hidden Gold — multiple items per user. */
export async function GET() {
  try {
    const { userId } = await requireUser();
    const plans = await listPlans(userId);
    return ok({ plans, plan: plans[0] ?? null });
  } catch (error) {
    return handleError(error);
  }
}

/** Update an existing plan by planId. */
export async function PUT(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = updateSchema.parse(await request.json());
    const user = await User.findById(userId).lean();
    const currency =
      (body.currency as Currency | undefined) ??
      (user?.baseCurrency as Currency | undefined) ??
      "IDR";

    const existing = await GoldPlan.findOne({ _id: body.planId, userId });
    if (!existing) throw new Error("NOT_FOUND");

    const startDate = new Date(body.startDate);
    if (Number.isNaN(startDate.getTime())) {
      return fail("INVALID_REQUEST", "Invalid startDate", 400);
    }

    const resetPayments = body.resetPayments === true;
    const rate =
      body.monthlyRatePercent ?? existing.monthlyRatePercent ?? 3;

    const rawPayments = resetPayments
      ? []
      : existing.payments.map(
          (p: {
            amount: number;
            date: Date;
            notes?: string | null;
            principalPortion?: number | null;
            interestPortion?: number | null;
          }) => ({
            amount: p.amount,
            date: p.date,
            notes: p.notes,
            principalPortion: p.principalPortion ?? null,
            interestPortion: p.interestPortion ?? null,
          })
        );

    const replayed = replayPayments({
      principal: body.principal,
      payments: rawPayments,
    });

    existing.name = body.name?.trim() || existing.name;
    existing.currency = currency;
    existing.principal = body.principal;
    existing.remainingPrincipal = replayed.remainingPrincipal;
    existing.remainingInterest = 0;
    existing.monthlyRatePercent = rate;
    existing.startDate = startDate;
    existing.status = replayed.remainingPrincipal <= 0 ? "PAID" : "ACTIVE";
    existing.payments = resetPayments
      ? []
      : rawPayments.map(
          (
            p: {
              amount: number;
              date: Date;
              notes?: string | null;
            },
            i: number
          ) => ({
            ...p,
            principalPortion: replayed.allocations[i]?.principalPortion ?? 0,
            interestPortion: replayed.allocations[i]?.interestPortion ?? 0,
            amount:
              (replayed.allocations[i]?.principalPortion ?? 0) +
              (replayed.allocations[i]?.interestPortion ?? 0),
          })
        );
    await existing.save();

    const plans = await listPlans(userId);
    return ok({
      plans,
      plan: plans.find((p) => p.id === body.planId) ?? null,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const raw = await request.json();
    const action = raw?.action;

    if (action === "create_plan" || (!action && raw?.principal != null && !raw?.planId)) {
      const body = createSchema.parse({ ...raw, action: "create_plan" });
      const user = await User.findById(userId).lean();
      const currency =
        (body.currency as Currency | undefined) ??
        (user?.baseCurrency as Currency | undefined) ??
        "IDR";
      const startDate = new Date(body.startDate);
      if (Number.isNaN(startDate.getTime())) {
        return fail("INVALID_REQUEST", "Invalid startDate", 400);
      }

      const doc = await GoldPlan.create({
        userId,
        name: body.name.trim(),
        currency,
        principal: body.principal,
        remainingPrincipal: body.principal,
        remainingInterest: 0,
        monthlyRatePercent: body.monthlyRatePercent ?? 3,
        startDate,
        status: "ACTIVE",
        payments: [],
      });

      const plans = await listPlans(userId);
      return ok(
        {
          plans,
          plan: buildGoldPlanView(doc.toObject()),
        },
        201
      );
    }

    if (action === "delete_plan") {
      const body = deletePlanSchema.parse(raw);
      const deleted = await GoldPlan.findOneAndDelete({
        _id: body.planId,
        userId,
      });
      if (!deleted) throw new Error("NOT_FOUND");
      const plans = await listPlans(userId);
      return ok({ plans, plan: plans[0] ?? null });
    }

    if (action === "delete_payment") {
      const body = deletePaymentSchema.parse(raw);
      const doc = await GoldPlan.findOne({ _id: body.planId, userId });
      if (!doc) throw new Error("NOT_FOUND");
      const before = doc.payments.id(body.paymentId);
      if (!before) throw new Error("NOT_FOUND");
      before.deleteOne();
      syncPlanFromPayments(doc);
      await doc.save();
      const plans = await listPlans(userId);
      return ok({
        plans,
        plan: plans.find((p) => p.id === body.planId) ?? null,
      });
    }

    if (action === "edit_payment") {
      const body = editPaymentSchema.parse(raw);
      const doc = await GoldPlan.findOne({ _id: body.planId, userId });
      if (!doc) throw new Error("NOT_FOUND");
      const row = doc.payments.id(body.paymentId);
      if (!row) throw new Error("NOT_FOUND");

      const principalPortion = body.principalPortion ?? 0;
      const interestPortion = body.interestPortion ?? 0;
      if (principalPortion <= 0 && interestPortion <= 0) {
        return fail("INVALID_REQUEST", "Isi bayar pokok dan/atau bunga", 400);
      }
      if (body.date) {
        const date = new Date(body.date);
        if (Number.isNaN(date.getTime())) {
          return fail("INVALID_REQUEST", "Invalid payment date", 400);
        }
        row.date = date;
      }
      if (body.notes !== undefined) {
        row.notes = body.notes ?? undefined;
      }
      row.principalPortion = principalPortion;
      row.interestPortion = interestPortion;
      row.amount = principalPortion + interestPortion;
      syncPlanFromPayments(doc);
      await doc.save();
      const plans = await listPlans(userId);
      return ok({
        plans,
        plan: plans.find((p) => p.id === body.planId) ?? null,
      });
    }

    const body = paymentSchema.parse(raw);
    const doc = await GoldPlan.findOne({ _id: body.planId, userId });
    if (!doc) throw new Error("NOT_FOUND");

    const date = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return fail("INVALID_REQUEST", "Invalid payment date", 400);
    }

    const hasManual =
      (body.principalPortion != null && body.principalPortion > 0) ||
      (body.interestPortion != null && body.interestPortion > 0);

    const applied = hasManual
      ? applyManualPayment({
          remainingPrincipal: doc.remainingPrincipal,
          remainingInterest: 0,
          principalPortion: body.principalPortion ?? 0,
          interestPortion: body.interestPortion ?? 0,
        })
      : applyFlatPayment({
          remainingPrincipal: doc.remainingPrincipal,
          remainingInterest: 0,
          paymentAmount: body.amount ?? 0,
        });

    const amount = applied.principalPortion + applied.interestPortion;
    if (amount <= 0) {
      return fail("INVALID_REQUEST", "Isi bayar pokok dan/atau bunga", 400);
    }

    doc.payments.push({
      amount,
      date,
      notes: body.notes,
      principalPortion: applied.principalPortion,
      interestPortion: applied.interestPortion,
    });
    doc.remainingPrincipal = applied.remainingPrincipal;
    doc.remainingInterest = 0;
    doc.status = applied.remainingPrincipal <= 0 ? "PAID" : "ACTIVE";
    if (doc.monthlyRatePercent == null) doc.monthlyRatePercent = 3;
    await doc.save();

    const plans = await listPlans(userId);
    return ok(
      {
        plans,
        plan: plans.find((p) => p.id === body.planId) ?? null,
      },
      201
    );
  } catch (error) {
    return handleError(error);
  }
}
