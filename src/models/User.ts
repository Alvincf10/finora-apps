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
    /** Nominal day of month salary arrives (1–28). If that date is Sat/Sun, pay advances to the previous Friday. Cycle runs actual payday → day before next payday. */
    paydayDay: { type: Number, min: 1, max: 28, default: 25 },
    /** Planned net salary in minor units — used for cycle planning (budget / payday), not auto-posted to accounts. */
    monthlySalary: { type: Number, min: 0, default: 0 },
    /** Financial Roadmap (Tangga Ternak Uang) preferences — FR-03. */
    roadmapPreferences: {
      educationGoalApplicability: {
        type: String,
        enum: ["APPLICABLE", "NOT_APPLICABLE", "UNSET"],
        default: "UNSET",
      },
    },
    /**
     * Decision Advisor priority (PRD 5.2-E). Explicit only — never invent.
     * UNSET = advisor must state preference is unknown.
     */
    decisionPreference: {
      type: String,
      enum: [
        "UNSET",
        "LIQUIDITY",
        "DEBT_PAYOFF",
        "MAXIMIZE_SAVINGS",
        "SPENDING_STABILITY",
        "ROADMAP_FOCUS",
      ],
      default: "UNSET",
    },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Next.js HMR can keep an older compiled model without new paths; strict mode
// would then strip new fields on save.
if (
  models.User &&
  (!models.User.schema.path("monthlySalary") ||
    !models.User.schema.path("roadmapPreferences") ||
    !models.User.schema.path("decisionPreference"))
) {
  delete models.User;
}

export const User =
  (models.User as mongoose.Model<UserDocument> | undefined) ||
  model<UserDocument>("User", UserSchema);
