import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const TransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    type: {
      type: String,
      enum: ["INCOME", "EXPENSE", "TRANSFER"],
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    description: { type: String, trim: true },
    date: { type: Date, required: true },
    notes: { type: String },
    merchant: { type: String },
    tags: [{ type: String }],
    transferId: { type: Schema.Types.ObjectId },
    transferDirection: { type: String, enum: ["OUT", "IN"] },
    counterpartyAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    debtId: { type: Schema.Types.ObjectId, ref: "Debt" },
    goalId: { type: Schema.Types.ObjectId, ref: "SavingsGoal" },
    recurring: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, accountId: 1, date: -1 });
TransactionSchema.index({ userId: 1, categoryId: 1, date: -1 });
TransactionSchema.index({ userId: 1, type: 1, date: -1 });
TransactionSchema.index({ transferId: 1 });

export type TransactionDocument = InferSchemaType<typeof TransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Transaction =
  models.Transaction || model("Transaction", TransactionSchema);
