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
    /**
     * How this obligation behaves in a pay cycle.
     * CREDIT_STATEMENT → use linked CC statementDueAmount when present.
     */
    obligationType: {
      type: String,
      enum: ["INSTALLMENT", "CREDIT_STATEMENT", "PAYOFF", "TRANSFER", "OTHER"],
      default: "INSTALLMENT",
    },
    /** Optional link to a CREDIT_CARD (or other) account. */
    linkedAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
    },
  },
  { timestamps: true }
);

// HMR may keep an older compiled model without obligation fields.
if (models.Debt && !models.Debt.schema.path("obligationType")) {
  delete models.Debt;
}

DebtSchema.index({ userId: 1, status: 1 });

export type DebtDocument = InferSchemaType<typeof DebtSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Debt = models.Debt || model("Debt", DebtSchema);
