import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    image: { type: String },
    baseCurrency: {
      type: String,
      enum: ["IDR", "EUR"],
      default: "IDR",
    },
    timezone: { type: String, default: "Asia/Jakarta" },
    /** Day of month salary arrives (1–28). Cycle runs payday → day before next payday. */
    paydayDay: { type: Number, min: 1, max: 28, default: 25 },
    /** Recurring net salary in minor units; applied automatically each pay cycle. */
    monthlySalary: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Next.js HMR can keep an older compiled model without new paths; strict mode
// would then strip paydayDay/monthlySalary on save.
if (models.User && !models.User.schema.path("monthlySalary")) {
  delete models.User;
}

export const User =
  (models.User as mongoose.Model<UserDocument> | undefined) ||
  model<UserDocument>("User", UserSchema);
