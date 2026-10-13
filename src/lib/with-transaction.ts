import mongoose from "mongoose";

function isUnsupportedTransactionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /retryable writes/i.test(msg) ||
    /transaction numbers are only allowed/i.test(msg) ||
    /does not support transactions/i.test(msg) ||
    /IllegalOperation.*transaction/i.test(msg)
  );
}

/**
 * Runs work in a multi-doc transaction when the deployment supports it
 * (replica set / Atlas). Falls back to non-transactional writes on
 * standalone local MongoDB.
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // ignore abort failures on unsupported deployments
    }
    if (!isUnsupportedTransactionError(error)) {
      throw error;
    }
  } finally {
    session.endSession();
  }

  return fn(null);
}

export function sessionOption(session: mongoose.ClientSession | null) {
  return session ? { session } : {};
}
