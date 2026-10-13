import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const MonthlySnapshotSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    income: { type: Number, default: 0 },
    expense: { type: Number, default: 0 },
    debtPayment: { type: Number, default: 0 },
    savings: { type: Number, default: 0 },
    netCashFlow: { type: Number, default: 0 },
    categoryTotals: [
      {
        categoryId: Schema.Types.ObjectId,
        name: String,
        amount: Number,
      },
    ],
  },
  { timestamps: true }
);

MonthlySnapshotSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

export type MonthlySnapshotDocument = InferSchemaType<
  typeof MonthlySnapshotSchema
> & { _id: mongoose.Types.ObjectId };

export const MonthlySnapshot =
  models.MonthlySnapshot || model("MonthlySnapshot", MonthlySnapshotSchema);
