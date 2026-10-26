import { z } from "zod";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  deleteScenario,
  getScenario,
  updateScenarioAssumptions,
} from "@/lib/financial/decision/scenario-service";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  assumptions: z
    .object({
      incomeOverride: z.number().int().nonnegative().nullable().optional(),
      expensesOverride: z.number().int().nonnegative().nullable().optional(),
      debtPaymentOverride: z.number().int().nonnegative().nullable().optional(),
      savingsOverride: z.number().int().nullable().optional(),
      cashBufferOverride: z.number().int().nonnegative().nullable().optional(),
    })
    .optional(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await ctx.params;
    const scenario = await getScenario(userId, id);
    if (!scenario) throw new Error("NOT_FOUND");
    return ok(scenario);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await request.json());
    const scenario = await updateScenarioAssumptions(
      userId,
      id,
      body.assumptions ?? {},
      body.name
    );
    if (!scenario) throw new Error("NOT_FOUND");
    return ok(scenario);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await ctx.params;
    const deleted = await deleteScenario(userId, id);
    if (!deleted) throw new Error("NOT_FOUND");
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
