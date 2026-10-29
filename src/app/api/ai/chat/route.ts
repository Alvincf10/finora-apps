import { ok, fail, handleError } from "@/lib/api";
import { buildAIExplainContext } from "@/lib/ai/context-builder";
import { isAIError } from "@/lib/ai/errors";
import {
  routeAiGenerate,
  shouldUseModelRouter,
} from "@/lib/ai/model-router";
import {
  assertAIRateLimit,
  getAIProvider,
  isAIConfigured,
} from "@/lib/ai/provider";
import { FINANCIAL_EXPLAINER_SYSTEM } from "@/lib/ai/system-prompt";
import { taskTypeFromContext } from "@/lib/ai/task-types";
import { requireUser } from "@/lib/session";
import { aiChatSchema } from "@/lib/validations";

/**
 * Legacy alias — prefer POST /api/ai/explain with contextType.
 * Kept for older dashboard callers; uses general_summary context.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();

    if (!isAIConfigured()) {
      return fail(
        "AI_NOT_CONFIGURED",
        "Penjelasan AI belum tersedia. Data dan perhitungan keuangan Finora tetap berfungsi normal.",
        503
      );
    }

    assertAIRateLimit(userId);

    const body = aiChatSchema.parse(await request.json().catch(() => ({})));
    const question =
      body.question?.trim() ||
      "Jelaskan kondisi keuangan saya secara singkat berdasarkan data Finora.";

    const context = await buildAIExplainContext(userId, "general_summary");
    const contextBlock = [
      "Ringkasan finansial (sumber kebenaran Finora):",
      JSON.stringify(context.payload, null, 2),
    ].join("\n");

    if (shouldUseModelRouter()) {
      const routed = await routeAiGenerate({
        taskType: taskTypeFromContext("general_summary"),
        systemPrompt: FINANCIAL_EXPLAINER_SYSTEM,
        contextBlock,
        question,
      });
      return ok({
        explanation: routed.explanation,
        model: routed.selectedModel,
        provider: "openrouter",
        contextType: "general_summary",
        disclaimer:
          "Jawaban dibuat AI berdasarkan data Finora. Angka di aplikasi adalah sumber kebenaran.",
        metadata: {
          taskType: routed.requestedTask,
          fallbackUsed: routed.fallbackUsed,
          attempts: routed.attempts,
          routerEnabled: true,
        },
      });
    }

    const provider = getAIProvider();
    const response = await provider.generateText({
      system: FINANCIAL_EXPLAINER_SYSTEM,
      prompt: [contextBlock, "", `Pertanyaan pengguna: ${question}`].join(
        "\n"
      ),
    });

    return ok({
      explanation: response.text,
      model: response.model,
      provider: response.provider,
      contextType: "general_summary",
      disclaimer:
        "Jawaban dibuat AI berdasarkan data Finora. Angka di aplikasi adalah sumber kebenaran.",
    });
  } catch (error) {
    if (isAIError(error)) {
      return fail(error.code, error.message, error.status);
    }
    return handleError(error);
  }
}
