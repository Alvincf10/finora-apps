/**
 * OpenRouter free models sometimes put the answer in `reasoning`
 * (content=null, finish_reason=length). Prefer visible content.
 */

type ContentPart = {
  type?: string;
  text?: string;
};

type ReasoningDetail = {
  type?: string;
  text?: string;
  summary?: string;
  content?: string;
};

export type OpenRouterMessage = {
  role?: string;
  content?: string | ContentPart[] | null;
  refusal?: string | null;
  reasoning?: string | null;
  reasoning_details?: ReasoningDetail[] | null;
};

function fromParts(parts: ContentPart[]): string {
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

function fromReasoningDetails(details: ReasoningDetail[]): string {
  const chunks: string[] = [];
  for (const d of details) {
    if (typeof d?.text === "string" && d.text.trim()) chunks.push(d.text.trim());
    else if (typeof d?.summary === "string" && d.summary.trim()) {
      chunks.push(d.summary.trim());
    } else if (typeof d?.content === "string" && d.content.trim()) {
      chunks.push(d.content.trim());
    }
  }
  return chunks.join("\n\n").trim();
}

export function extractOpenRouterText(message: OpenRouterMessage | undefined): string {
  if (!message) return "";

  const content = message.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = fromParts(content);
    if (joined) return joined;
  }

  if (typeof message.reasoning === "string" && message.reasoning.trim()) {
    return message.reasoning.trim();
  }

  if (Array.isArray(message.reasoning_details)) {
    const fromDetails = fromReasoningDetails(message.reasoning_details);
    if (fromDetails) return fromDetails;
  }

  if (typeof message.refusal === "string" && message.refusal.trim()) {
    return message.refusal.trim();
  }

  return "";
}
