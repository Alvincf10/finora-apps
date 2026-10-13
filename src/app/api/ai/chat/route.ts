import { ok, fail, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { aiChatSchema } from "@/lib/validations";
import { buildFinancialContext } from "@/lib/financial/recommendations";
import {
  checkAIRateLimit,
  FINANCIAL_AI_SYSTEM,
  getAIProvider,
} from "@/lib/ai/provider";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();

    if (!checkAIRateLimit(userId, 10, 60_000)) {
      return fail("RATE_LIMITED", "Too many AI requests. Try again later.", 429);
    }

    const body = aiChatSchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const period = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const context = await buildFinancialContext(userId, period);

    const provider = getAIProvider();
    const response = await provider.generateText({
      system: FINANCIAL_AI_SYSTEM,
      prompt: `Financial context (source of truth):\n${JSON.stringify(context, null, 2)}\n\nUser question: ${body.question ?? "Explain my current financial situation briefly."}`,
      maxTokens: 400,
    });

    return ok({
      explanation: response.text,
      model: response.model,
      provider: response.provider,
      context,
      disclaimer:
        "AI explanations are based on recorded data and are not the source of truth for balances or transactions.",
    });
  } catch (error) {
    return handleError(error);
  }
}
