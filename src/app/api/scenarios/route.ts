import { z } from "zod";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { parsePeriod } from "@/lib/financial/phase2-service";
import {
  captureScenarioBaseline,
  compareUserScenarios,
  createScenario,
  listScenarios,
} from "@/lib/financial/decision/scenario-service";

const assumptionsSchema = z.object({
  incomeOverride: z.number().int().nonnegative().nullable().optional(),
  expensesOverride: z.number().int().nonnegative().nullable().optional(),
  debtPaymentOverride: z.number().int().nonnegative().nullable().optional(),
  savingsOverride: z.number().int().nullable().optional(),
  cashBufferOverride: z.number().int().nonnegative().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
  year: z.number().int().optional(),
  month: z.number().int().optional(),
  assumptions: assumptionsSchema.optional(),
});

const compareSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5),
});

/** GET /api/scenarios — list saved scenarios. Optional ?baseline=1 captures live baseline. */
export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    if (url.searchParams.get("baseline") === "1") {
      const period = await parsePeriod(url.searchParams, userId);
      const baseline = await captureScenarioBaseline(userId, period);
      return ok({ baseline });
    }
    const scenarios = await listScenarios(userId);
    return ok({ scenarios });
  } catch (error) {
    return handleError(error);
  }
}

/** POST /api/scenarios — create saved scenario from live baseline + assumptions. */
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = createSchema.parse(await request.json());
    const params = new URLSearchParams();
    if (body.year != null) params.set("year", String(body.year));
    if (body.month != null) params.set("month", String(body.month));
    const period = await parsePeriod(params, userId);
    const scenario = await createScenario({
      userId,
      period,
      name: body.name,
      notes: body.notes,
      assumptions: body.assumptions,
    });
    return ok(scenario);
  } catch (error) {
    return handleError(error);
  }
}

/** PUT /api/scenarios — compare up to 5 scenarios by id. */
export async function PUT(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = compareSchema.parse(await request.json());
    const comparison = await compareUserScenarios(userId, body.ids);
    return ok(comparison);
  } catch (error) {
    return handleError(error);
  }
}
