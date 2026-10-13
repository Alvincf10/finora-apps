import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const SavingsGoalSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 1 },
    currentAmount: { type: Number, required: true, default: 0, min: 0 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    targetDate: { type: Date },
    priority: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
    notes: { type: String },
  },
  { timestamps: true }
);

SavingsGoalSchema.index({ userId: 1, status: 1 });

export type SavingsGoalDocument = InferSchemaType<
  typeof SavingsGoalSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const SavingsGoal =
  models.SavingsGoal || model("SavingsGoal", SavingsGoalSchema);
