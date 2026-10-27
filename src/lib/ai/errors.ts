export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_RESPONSE_INVALID"
  | "AI_RATE_LIMITED"
  | "INSUFFICIENT_CONTEXT"
  | "INVALID_REQUEST"
  | "RATE_LIMITED";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly status: number;

  constructor(code: AIErrorCode, message: string, status = 503) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.status = status;
  }
}

export function isAIError(error: unknown): error is AIError {
  return error instanceof AIError;
}
