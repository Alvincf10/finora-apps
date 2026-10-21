import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

const WhatsAppSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["disconnected", "qr", "connecting", "connected", "error"],
      default: "disconnected",
    },
    desiredState: {
      type: String,
      enum: ["stopped", "running"],
      default: "stopped",
    },
    qrData: { type: String, default: null },
    qrUpdatedAt: { type: Date, default: null },
    phoneNumber: { type: String, default: null },
    defaultAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    /** E.164-ish digits only, e.g. 62812... Required before Vira may run. */
    allowedFrom: { type: String, default: null },
    lastError: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
    /** Worker heartbeat so the web UI can detect a dead Vira process. */
    lastHeartbeatAt: { type: Date, default: null },
    /** Worker clears Baileys auth folder when true, then resets flag. */
    clearAuthRequested: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type WhatsAppSessionDocument = InferSchemaType<
  typeof WhatsAppSessionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const WhatsAppSession =
  models.WhatsAppSession ||
  model("WhatsAppSession", WhatsAppSessionSchema);
