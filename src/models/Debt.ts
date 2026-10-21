import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const DebtSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    /** CONSUMER = hutang kecil; MORTGAGE = KPR (dikecualikan step 2 tangga). */
    kind: {
      type: String,
      enum: ["CONSUMER", "MORTGAGE", "OTHER"],
      default: "CONSUMER",
    },
    originalAmount: { type: Number, required: true, min: 1 },
    remainingAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    interestRate: { type: Number },
    minimumPayment: { type: Number },
    /** Monthly installment (cicilan) amount in minor units */
    plannedPayment: { type: Number },
    /** Total installment tenure in months (tenor) */
    installmentMonths: { type: Number, min: 1 },
    dueDate: { type: Date },
    startDate: { type: Date },
    targetPayoffDate: { type: Date },
    status: {
      type: String,
      enum: ["ACTIVE", "PAID", "CANCELLED"],
      default: "ACTIVE",
    },
    notes: { type: String },
  },
  { timestamps: true }
);

DebtSchema.index({ userId: 1, status: 1 });

export type DebtDocument = InferSchemaType<typeof DebtSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Debt = models.Debt || model("Debt", DebtSchema);
