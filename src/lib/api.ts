import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiResponse } from "@/types";

export function ok<T>(data: T, status = 200) {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

export function fail(
  code: string,
  message: string,
  status = 400
) {
  const body: ApiResponse<never> = {
    success: false,
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return fail(
      "VALIDATION_ERROR",
      error.issues[0]?.message ?? "Validation failed",
      400
    );
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    if (error.message === "FORBIDDEN") {
      return fail("FORBIDDEN", "Access denied", 403);
    }
    if (error.message === "NOT_FOUND") {
      return fail("NOT_FOUND", "Resource not found", 404);
    }
    return fail("INTERNAL_ERROR", error.message, 500);
  }

  return fail("INTERNAL_ERROR", "Unexpected error", 500);
}
