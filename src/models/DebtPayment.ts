import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const DebtPaymentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    debtId: {
      type: Schema.Types.ObjectId,
      ref: "Debt",
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    date: { type: Date, required: true },
    notes: { type: String },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type DebtPaymentDocument = InferSchemaType<typeof DebtPaymentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DebtPayment =
  models.DebtPayment || model("DebtPayment", DebtPaymentSchema);
