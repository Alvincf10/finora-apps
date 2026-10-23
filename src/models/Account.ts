import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const AccountSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["CASH", "BANK", "E_WALLET", "CREDIT_CARD", "OTHER"],
      required: true,
    },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    initialBalance: { type: Number, required: true, default: 0 },
    /**
     * For cash/bank/e-wallet: money on hand.
     * For CREDIT_CARD: outstanding balance owed (positive = you owe).
     */
    currentBalance: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
    /** CREDIT_CARD only: total credit limit. */
    creditLimit: { type: Number, min: 0 },
    /**
     * CREDIT_CARD only: amount due on the current statement
     * (may be less than outstanding).
     */
    statementDueAmount: { type: Number, min: 0 },
    /** CREDIT_CARD only: statement due day of month (1–31). */
    statementDueDay: { type: Number, min: 1, max: 31 },
    /**
     * When true, treat card like debit: spend only up to cash reserved
     * for the cycle (enforced in payday allocation / alerts).
     */
    debitMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AccountSchema.index({ userId: 1, isActive: 1 });

export type AccountDocument = InferSchemaType<typeof AccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

// HMR may keep an older compiled model without CC fields.
if (models.Account && !models.Account.schema.path("creditLimit")) {
  delete models.Account;
}

export const Account = models.Account || model("Account", AccountSchema);
