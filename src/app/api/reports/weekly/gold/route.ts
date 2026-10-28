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

const upsertSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currency: z.enum(["IDR", "EUR"]).optional(),
  principal: z.number().int().positive(),
  /** Bunga % per bulan dari sisa pokok. Default 3. */
  monthlyRatePercent: z.number().min(0).max(100).optional(),
  startDate: z.string().min(4),
  resetPayments: z.boolean().optional(),
});

const paymentSchema = z
  .object({
    action: z.literal("add_payment"),
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
  paymentId: z.string().min(1),
});

const editPaymentSchema = z
  .object({
    action: z.literal("edit_payment"),
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

/** Hidden Gold — reducing-balance 3%/mo on remaining principal. */
export async function GET() {
  try {
    const { userId } = await requireUser();
    const doc = await GoldPlan.findOne({ userId }).lean();
    if (!doc) {
      return ok({ plan: null });
    }
    return ok({ plan: buildGoldPlanView(doc) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = upsertSchema.parse(await request.json());
    const user = await User.findById(userId).lean();
    const currency =
      (body.currency as Currency | undefined) ??
      (user?.baseCurrency as Currency | undefined) ??
      "IDR";

    const existing = await GoldPlan.findOne({ userId });
    const resetPayments = body.resetPayments ?? !existing;
    const startDate = new Date(body.startDate);
    if (Number.isNaN(startDate.getTime())) {
      return fail("INVALID_REQUEST", "Invalid startDate", 400);
    }

    const rate = body.monthlyRatePercent ?? existing?.monthlyRatePercent ?? 3;

    const rawPayments = resetPayments
      ? []
      : (existing?.payments ?? []).map(
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

    const payments = rawPayments.map(
      (
        p: {
          amount: number;
          date: Date;
          notes?: string | null;
          principalPortion?: number | null;
          interestPortion?: number | null;
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

    const doc = await GoldPlan.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          name: body.name?.trim() || existing?.name || "Gold",
          currency,
          principal: body.principal,
          remainingPrincipal: replayed.remainingPrincipal,
          remainingInterest: 0,
          monthlyRatePercent: rate,
          startDate,
          status: replayed.remainingPrincipal <= 0 ? "PAID" : "ACTIVE",
          payments,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (!doc) throw new Error("NOT_FOUND");
    return ok({ plan: buildGoldPlanView(doc) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const raw = await request.json();
    const action = raw?.action;

    if (action === "delete_payment") {
      const body = deletePaymentSchema.parse(raw);
      const doc = await GoldPlan.findOne({ userId });
      if (!doc) throw new Error("NOT_FOUND");
      const before = doc.payments.id(body.paymentId);
      if (!before) throw new Error("NOT_FOUND");
      before.deleteOne();
      syncPlanFromPayments(doc);
      await doc.save();
      return ok({ plan: buildGoldPlanView(doc.toObject()) });
    }

    if (action === "edit_payment") {
      const body = editPaymentSchema.parse(raw);
      const doc = await GoldPlan.findOne({ userId });
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
      return ok({ plan: buildGoldPlanView(doc.toObject()) });
    }

    const body = paymentSchema.parse(raw);
    const doc = await GoldPlan.findOne({ userId });
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

    return ok({ plan: buildGoldPlanView(doc.toObject()) }, 201);
  } catch (error) {
    return handleError(error);
  }
}
