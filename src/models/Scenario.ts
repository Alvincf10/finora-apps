import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

/**
 * Persisted Decision Lab scenario (FR-04).
 * baselineSnapshot is immutable after create — results stay reproducible
 * even if live ledger data changes.
 */
const ScenarioSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    currency: { type: String, enum: ["IDR", "EUR"], required: true },
    /** Frozen inputs at capture time. */
    baselineSnapshot: { type: Schema.Types.Mixed, required: true },
    /** User overrides relative to the snapshot. */
    assumptions: { type: Schema.Types.Mixed, required: true, default: {} },
    /** Deterministic evaluation of assumptions against baselineSnapshot. */
    results: { type: Schema.Types.Mixed, required: true },
    notes: { type: String, maxlength: 500 },
    rulesVersion: { type: String, required: true },
  },
  { timestamps: true }
);

ScenarioSchema.index({ userId: 1, createdAt: -1 });

export type ScenarioDocument = InferSchemaType<typeof ScenarioSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Scenario =
  models.Scenario || model("Scenario", ScenarioSchema);
