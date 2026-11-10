import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { fail, handleError, ok } from "@/lib/api";

async function jsonBody<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("ok", () => {
  it("returns success JSON with status", async () => {
    const res = ok({ id: "1" }, 201);
    expect(res.status).toBe(201);
    const body = await jsonBody<{ success: boolean; data: { id: string } }>(res);
    expect(body).toEqual({ success: true, data: { id: "1" } });
  });
});

describe("fail", () => {
  it("returns error payload", async () => {
    const res = fail("BAD", "nope", 422);
    const body = await jsonBody<{
      success: boolean;
      error: { code: string; message: string };
    }>(res);
    expect(body.success).toBe(false);
    expect(body.error).toEqual({ code: "BAD", message: "nope" });
    expect(res.status).toBe(422);
  });
});

describe("handleError", () => {
  it("maps ZodError to INVALID_REQUEST", async () => {
    const schema = z.object({ x: z.number() });
    let err: unknown;
    try {
      schema.parse({ x: "n" });
    } catch (e) {
      err = e;
    }
    const res = handleError(err);
    const body = await jsonBody<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(res.status).toBe(400);
  });

  it("maps known Error messages", async () => {
    const cases: [string, string, number][] = [
      ["UNAUTHORIZED", "UNAUTHORIZED", 401],
      ["NOT_FOUND", "NOT_FOUND", 404],
      ["RATE_LIMITED", "RATE_LIMITED", 429],
      ["ALLOWED_FROM_REQUIRED", "ALLOWED_FROM_REQUIRED", 400],
      ["CC_LIMIT_EXCEEDED", "CC_LIMIT_EXCEEDED", 400],
    ];
    for (const [message, code, status] of cases) {
      const res = handleError(new Error(message));
      const body = await jsonBody<{ error: { code: string } }>(res);
      expect(body.error.code).toBe(code);
      expect(res.status).toBe(status);
    }
  });

  it("handles non-Error unknown", async () => {
    const res = handleError("boom");
    const body = await jsonBody<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(res.status).toBe(500);
  });

  it("uses ZodError instance check", () => {
    const e = new ZodError([]);
    expect(handleError(e).status).toBe(400);
  });
});
