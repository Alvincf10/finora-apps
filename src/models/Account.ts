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
    currentBalance: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AccountSchema.index({ userId: 1, isActive: 1 });

export type AccountDocument = InferSchemaType<typeof AccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Account = models.Account || model("Account", AccountSchema);
