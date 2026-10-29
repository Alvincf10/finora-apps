/**
 * One-shot probe: compare response shapes with/without reasoning.exclude.
 * Does not print API keys. Synthetic prompt only.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]!]) process.env[m[1]!] = val;
  }
}

function summarize(label: string, status: number, json: Record<string, unknown>) {
  const choices = json.choices as
    | Array<{
        finish_reason?: string;
        message?: {
          content?: unknown;
          reasoning?: unknown;
          reasoning_details?: unknown;
          refusal?: unknown;
        };
      }>
    | undefined;
  const msg = choices?.[0]?.message ?? {};
  const content = msg.content;
  const reasoning = msg.reasoning;
  console.log(
    JSON.stringify(
      {
        label,
        httpStatus: status,
        responseModel: json.model ?? null,
        error: json.error ?? null,
        finish: choices?.[0]?.finish_reason ?? null,
        contentType: content === null ? "null" : typeof content,
        contentLen:
          typeof content === "string"
            ? content.length
            : Array.isArray(content)
              ? content.length
              : 0,
        contentPreview:
          typeof content === "string" ? content.slice(0, 160) : null,
        reasoningType: reasoning === null ? "null" : typeof reasoning,
        reasoningLen: typeof reasoning === "string" ? reasoning.length : 0,
        reasoningPreview:
          typeof reasoning === "string" ? reasoning.slice(0, 160) : null,
        hasReasoningDetails: Array.isArray(msg.reasoning_details),
        refusal: msg.refusal ?? null,
      },
      null,
      2
    )
  );
}

async function main() {
  loadEnvLocal();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY missing");

  const model =
    process.argv[2] ?? "nvidia/nemotron-3.5-lightning:free";

  const baseBody = {
    model,
    max_tokens: 400,
    messages: [
      { role: "system", content: "Jawab singkat dalam Bahasa Indonesia." },
      {
        role: "user",
        content: "Sebutkan angka 1200000 dan kata utang dalam satu kalimat.",
      },
    ],
  };

  for (const [label, extra] of [
    ["with_reasoning_exclude", { reasoning: { exclude: true } }],
    ["no_reasoning_param", {}],
  ] as const) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Finora-Benchmark-Probe",
      },
      body: JSON.stringify({ ...baseBody, ...extra }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    summarize(label, res.status, json);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
