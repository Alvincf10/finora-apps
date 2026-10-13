import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const EvidenceSchema = new Schema(
  {
    metric: String,
    current: Number,
    average3m: Number,
    changePercent: Number,
  },
  { _id: false, strict: false }
);

const FinancialRecommendationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, required: true },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["INFO", "WARNING", "CRITICAL"],
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    debtId: { type: Schema.Types.ObjectId, ref: "Debt" },
    goalId: { type: Schema.Types.ObjectId, ref: "SavingsGoal" },
    currentValue: Number,
    recommendedValue: Number,
    difference: Number,
    evidence: [EvidenceSchema],
    actionType: String,
    status: {
      type: String,
      enum: ["NEW", "VIEWED", "ACCEPTED", "DISMISSED", "EXPIRED"],
      default: "NEW",
    },
    period: {
      year: Number,
      month: Number,
    },
    metadata: Schema.Types.Mixed,
    expiresAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

FinancialRecommendationSchema.index({ userId: 1, status: 1, createdAt: -1 });
FinancialRecommendationSchema.index({ userId: 1, "period.year": 1, "period.month": 1 });

export type FinancialRecommendationDocument = InferSchemaType<
  typeof FinancialRecommendationSchema
> & { _id: mongoose.Types.ObjectId };

export const FinancialRecommendation =
  models.FinancialRecommendation ||
  model("FinancialRecommendation", FinancialRecommendationSchema);
