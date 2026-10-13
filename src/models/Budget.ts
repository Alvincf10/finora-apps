import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const BudgetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
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

BudgetSchema.index(
  { userId: 1, year: 1, month: 1, categoryId: 1 },
  { unique: true }
);

export type BudgetDocument = InferSchemaType<typeof BudgetSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Budget = models.Budget || model("Budget", BudgetSchema);
