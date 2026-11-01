import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const WhatsAppOutboundSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    toPhone: { type: String, required: true },
    body: { type: String, required: true },
    kind: {
      type: String,
      enum: [
        "WEEKLY_REPORT",
        "FIXED_COST_DUE",
        "BUDGET_OVERFLOW",
        "BUDGET_WARNING",
        "MANUAL",
      ],
      default: "MANUAL",
    },
    /** Stable identity for once-per-week alerts (e.g. budget-warn:2026-10-27:catId). */
    dedupeKey: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

WhatsAppOutboundSchema.index({ status: 1, createdAt: 1 });
WhatsAppOutboundSchema.index(
  { userId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $type: "string" },
      status: { $in: ["pending", "sent"] },
    },
  }
);

export type WhatsAppOutboundDocument = InferSchemaType<
  typeof WhatsAppOutboundSchema
> & {
  _id: mongoose.Types.ObjectId;
};

// Refresh compiled model when kind enum / dedupeKey changes (HMR).
const existingKind = models.WhatsAppOutbound?.schema.path("kind") as
  | { options?: { enum?: string[] } }
  | undefined;
const existingDedupe = models.WhatsAppOutbound?.schema.path("dedupeKey");
if (
  models.WhatsAppOutbound &&
  (!(existingKind?.options?.enum ?? []).includes("BUDGET_WARNING") ||
    !existingDedupe)
) {
  delete models.WhatsAppOutbound;
}

export const WhatsAppOutbound =
  (models.WhatsAppOutbound as
    | mongoose.Model<WhatsAppOutboundDocument>
    | undefined) ||
  model<WhatsAppOutboundDocument>("WhatsAppOutbound", WhatsAppOutboundSchema);
