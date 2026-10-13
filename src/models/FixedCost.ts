import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const FixedCostSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    /** Day of month the bill is due (1–31). Shorter months clamp to month end. */
    dueDay: { type: Number, required: true, min: 1, max: 31 },
    isActive: { type: Boolean, default: true },
    notes: { type: String },
  },
  { timestamps: true }
);

FixedCostSchema.index({ userId: 1, isActive: 1 });

export type FixedCostDocument = InferSchemaType<typeof FixedCostSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Refresh compiled model when dueDay max was previously capped at 28 (HMR).
const existingDue = models.FixedCost?.schema.path("dueDay") as
  | { options?: { max?: number } }
  | undefined;
if (models.FixedCost && (existingDue?.options?.max ?? 31) < 31) {
  delete models.FixedCost;
}

export const FixedCost =
  (models.FixedCost as mongoose.Model<FixedCostDocument> | undefined) ||
  model<FixedCostDocument>("FixedCost", FixedCostSchema);
