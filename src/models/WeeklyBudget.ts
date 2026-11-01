import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

/**
 * Category spending cap for one Mon–Sun week (Asia/Jakarta).
 * weekKey = Monday date YYYY-MM-DD.
 */
const WeeklyBudgetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    weekKey: { type: String, required: true, index: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
  },
  { timestamps: true }
);

WeeklyBudgetSchema.index(
  { userId: 1, weekKey: 1, categoryId: 1 },
  { unique: true }
);

export type WeeklyBudgetDocument = InferSchemaType<typeof WeeklyBudgetSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WeeklyBudget =
  models.WeeklyBudget || model("WeeklyBudget", WeeklyBudgetSchema);
