import { randomUUID } from "crypto";
import { ok, fail, handleError } from "@/lib/api";
import {
  buildAIExplainContext,
  type AIContextType,
} from "@/lib/ai/context-builder";
import { isAIError } from "@/lib/ai/errors";
import {
  assertAIRateLimit,
  getAIProvider,
  isAIConfigured,
} from "@/lib/ai/provider";
import { FINANCIAL_EXPLAINER_SYSTEM } from "@/lib/ai/system-prompt";
import { appendAIUsageLog, hashUserId } from "@/lib/ai/usage-log";
import { requireUser } from "@/lib/session";
import { aiExplainSchema } from "@/lib/validations";

/**
 * POST /api/ai/explain — Financial Explainer (Phase 5).
 * Read-only: never mutates ledger / budgets / debts / roadmap.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const requestId = randomUUID();
  let userIdForLog = "anon";
  let contextTypeForLog = "unknown";
  let modelForLog: string | null = null;

  try {
    const { userId } = await requireUser();
    userIdForLog = userId;

    if (!isAIConfigured()) {
      return fail(
        "AI_NOT_CONFIGURED",
        "Penjelasan AI belum tersedia. Data dan perhitungan keuangan Finora tetap berfungsi normal.",
        503
      );
    }

    assertAIRateLimit(userId);

    const body = aiExplainSchema.parse(await request.json().catch(() => ({})));
    const contextType = body.contextType as AIContextType;
    contextTypeForLog = contextType;

    const context = await buildAIExplainContext(
      userId,
      contextType,
      body.contextRef
    );

    const provider = getAIProvider();
    const response = await provider.generateText({
      system: FINANCIAL_EXPLAINER_SYSTEM,
      prompt: [
        `Jenis konteks: ${context.contextType}`,
        `Mata uang: ${context.currency}`,
        `Periode: ${JSON.stringify(context.period)}`,
        context.dataLimitations.length
          ? `Batasan data: ${context.dataLimitations.join(", ")}`
          : null,
        "Ringkasan finansial (sumber kebenaran Finora):",
        JSON.stringify(context.payload, null, 2),
        "",
        `Pertanyaan pengguna: ${body.question}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    modelForLog = response.model;

    appendAIUsageLog({
      requestId,
      userIdHash: hashUserId(userId),
      contextType,
      model: response.model,
      status: "ok",
      latencyMs: Date.now() - started,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      ts: new Date().toISOString(),
    });

    return ok({
      explanation: response.text,
      model: response.model,
      contextType,
      disclaimer:
        "Jawaban dibuat AI berdasarkan data Finora. Angka di aplikasi adalah sumber kebenaran — AI tidak mengubah saldo atau transaksi.",
    });
  } catch (error) {
    if (isAIError(error)) {
      appendAIUsageLog({
        requestId,
        userIdHash: hashUserId(userIdForLog),
        contextType: contextTypeForLog,
        model: modelForLog,
        status: "error",
        errorCode: error.code,
        latencyMs: Date.now() - started,
        ts: new Date().toISOString(),
      });
      return fail(error.code, error.message, error.status);
    }

    appendAIUsageLog({
      requestId,
      userIdHash: hashUserId(userIdForLog),
      contextType: contextTypeForLog,
      model: modelForLog,
      status: "error",
      errorCode: "INTERNAL_ERROR",
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
    });

    return handleError(error);
  }
}
