import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const EnvelopeSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ["AUTO", "MANUAL"], default: "MANUAL" },
    kind: {
      type: String,
      enum: [
        "CC_STATEMENT",
        "DEBT",
        "FIXED",
        "CASH_BUFFER",
        "CC_SPEND_CAP",
        "LIVING",
        "GOALS",
        "OTHER",
      ],
      default: "OTHER",
    },
    linkedDebtId: { type: Schema.Types.ObjectId, ref: "Debt" },
    linkedAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    linkedFixedCostId: { type: Schema.Types.ObjectId, ref: "FixedCost" },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date },
    paymentTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
  },
  { _id: true }
);

const PaydayAllocationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cycleStart: { type: Date, required: true },
    cycleEnd: { type: Date, required: true },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    salary: { type: Number, required: true, min: 0 },
    startingCash: { type: Number, required: true, default: 0 },
    envelopes: { type: [EnvelopeSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "COMPLETED"],
      default: "DRAFT",
    },
    notes: { type: String },
  },
  { timestamps: true }
);

PaydayAllocationSchema.index(
  { userId: 1, cycleStart: 1 },
  { unique: true }
);

export type PaydayAllocationDocument = InferSchemaType<
  typeof PaydayAllocationSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const PaydayAllocation =
  models.PaydayAllocation ||
  model("PaydayAllocation", PaydayAllocationSchema);
