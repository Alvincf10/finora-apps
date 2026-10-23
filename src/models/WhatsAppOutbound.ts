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
      enum: ["WEEKLY_REPORT", "MANUAL"],
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

export const WhatsAppOutbound =
  models.WhatsAppOutbound ||
  model("WhatsAppOutbound", WhatsAppOutboundSchema);
