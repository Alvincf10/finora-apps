import type { Types } from "mongoose";

/**
 * Status transitions for the outbound queue.
 *
 * CRITICAL: never use document.save() after send — that re-validates the
 * whole doc (including `kind`). A stale worker schema missing a new kind
 * fails validation, leaves status=pending, and re-sends forever.
 *
 * Always $set only status fields via updateOne (no runValidators).
 */
export type OutboundStatusUpdate =
  | { status: "sent"; sentAt: Date; error: null }
  | { status: "failed"; error: string };

export function buildOutboundSentUpdate(now = new Date()): OutboundStatusUpdate {
  return { status: "sent", sentAt: now, error: null };
}

export function buildOutboundFailedUpdate(error: string): OutboundStatusUpdate {
  return {
    status: "failed",
    error: error.slice(0, 500) || "send failed",
  };
}

/** Keys written on success/failure — must never include `kind` or `body`. */
export function outboundStatusUpdateKeys(
  update: OutboundStatusUpdate
): string[] {
  return Object.keys(update).sort();
}

type OutboundModel = {
  updateOne: (
    filter: { _id: Types.ObjectId | string },
    update: { $set: OutboundStatusUpdate }
  ) => Promise<unknown>;
};

export async function markOutboundSent(
  model: OutboundModel,
  id: Types.ObjectId | string,
  now = new Date()
): Promise<void> {
  await model.updateOne({ _id: id }, { $set: buildOutboundSentUpdate(now) });
}

export async function markOutboundFailed(
  model: OutboundModel,
  id: Types.ObjectId | string,
  error: string
): Promise<void> {
  await model.updateOne(
    { _id: id },
    { $set: buildOutboundFailedUpdate(error) }
  );
}
