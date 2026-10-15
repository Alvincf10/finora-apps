import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const RecurringTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["INCOME", "EXPENSE"],
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    description: { type: String, trim: true },
    frequency: {
      type: String,
      enum: ["MONTHLY", "WEEKLY"],
      default: "MONTHLY",
    },
    /** Day of month for MONTHLY (1–31). Shorter months clamp to month end. */
    dayOfMonth: { type: Number, min: 1, max: 31 },
    nextOccurrence: { type: Date, required: true },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
    lastGeneratedAt: { type: Date },
  },
  { timestamps: true }
);

RecurringTransactionSchema.index({ userId: 1, isActive: 1, nextOccurrence: 1 });

export type RecurringTransactionDocument = InferSchemaType<
  typeof RecurringTransactionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const RecurringTransaction =
  models.RecurringTransaction ||
  model("RecurringTransaction", RecurringTransactionSchema);
