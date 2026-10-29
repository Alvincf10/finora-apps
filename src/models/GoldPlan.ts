import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

/**
 * Standalone Gold cicilan tracker (Weekly Report hidden panel).
 * Multiple items per user (bracelet, necklace, …).
 * Bunga = sisa pokok × monthlyRatePercent (default 3%/bln).
 */
const GoldPaymentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    notes: { type: String },
    principalPortion: { type: Number, min: 0, default: 0 },
    interestPortion: { type: Number, min: 0, default: 0 },
  },
  { _id: true }
);

const GoldPlanSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, default: "Gold" },
    currency: { type: String, enum: ["IDR", "EUR"], default: "IDR" },
    principal: { type: Number, required: true, min: 1 },
    remainingPrincipal: { type: Number, required: true, min: 0 },
    monthlyRatePercent: { type: Number, min: 0, max: 100, default: 3 },
    totalInterest: { type: Number, min: 0, default: 0 },
    remainingInterest: { type: Number, min: 0, default: 0 },
    months: { type: Number, min: 1, max: 600, default: 5 },
    monthlyPayment: { type: Number, min: 1 },
    startDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "PAID"],
      default: "ACTIVE",
    },
    payments: { type: [GoldPaymentSchema], default: [] },
  },
  { timestamps: true }
);

GoldPlanSchema.index({ userId: 1, createdAt: -1 });

export type GoldPlanDocument = InferSchemaType<typeof GoldPlanSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Drop cached model if it still has unique userId (one-plan-only era).
if (models.GoldPlan) {
  const userPath = models.GoldPlan.schema.path("userId") as
    | { options?: { unique?: boolean } }
    | undefined;
  if (userPath?.options?.unique) {
    delete models.GoldPlan;
  }
}

export const GoldPlan =
  models.GoldPlan || model("GoldPlan", GoldPlanSchema);
