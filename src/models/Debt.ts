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
    originalAmount: { type: Number, required: true, min: 1 },
    remainingAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    interestRate: { type: Number },
    minimumPayment: { type: Number },
    plannedPayment: { type: Number },
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
