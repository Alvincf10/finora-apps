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
      enum: ["WEEKLY_REPORT", "FIXED_COST_DUE", "MANUAL"],
      default: "MANUAL",
    },
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

export type WhatsAppOutboundDocument = InferSchemaType<
  typeof WhatsAppOutboundSchema
> & {
  _id: mongoose.Types.ObjectId;
};

// Refresh compiled model when FIXED_COST_DUE was added to kind enum (HMR).
const existingKind = models.WhatsAppOutbound?.schema.path("kind") as
  | { options?: { enum?: string[] } }
  | undefined;
if (
  models.WhatsAppOutbound &&
  !(existingKind?.options?.enum ?? []).includes("FIXED_COST_DUE")
) {
  delete models.WhatsAppOutbound;
}

export const WhatsAppOutbound =
  (models.WhatsAppOutbound as
    | mongoose.Model<WhatsAppOutboundDocument>
    | undefined) ||
  model<WhatsAppOutboundDocument>("WhatsAppOutbound", WhatsAppOutboundSchema);
