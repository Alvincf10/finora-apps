import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const CategorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Category" },
    type: { type: String, enum: ["INCOME", "EXPENSE"], required: true },
    icon: { type: String },
    color: { type: String },
    classification: {
      type: String,
      enum: ["ESSENTIAL", "IMPORTANT", "DISCRETIONARY", "UNKNOWN"],
      default: "UNKNOWN",
    },
    nature: {
      type: String,
      enum: ["FIXED", "VARIABLE", "UNKNOWN"],
      default: "UNKNOWN",
    },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CategorySchema.index({ userId: 1, type: 1, isActive: 1 });

export type CategoryDocument = InferSchemaType<typeof CategorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Category = models.Category || model("Category", CategorySchema);
