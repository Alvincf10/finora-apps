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

async function main() {
  loadEnvLocal();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("missing key");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Finora-Probe",
    },
    body: JSON.stringify({
      model: "nvidia/nemotron-3.5-lightning:free",
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "Jawab final dalam Bahasa Indonesia. Jangan tulis proses berpikir panjang — langsung jawaban.",
        },
        {
          role: "user",
          content: "Sebutkan angka 1200000 dan kata utang dalam satu kalimat.",
        },
      ],
    }),
  });
  const json = (await res.json()) as {
    model?: string;
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: unknown; reasoning?: unknown };
    }>;
  };
  const msg = json.choices?.[0]?.message ?? {};
  console.log(
    JSON.stringify(
      {
        status: res.status,
        model: json.model,
        finish: json.choices?.[0]?.finish_reason,
        contentLen:
          typeof msg.content === "string" ? msg.content.length : 0,
        contentPreview:
          typeof msg.content === "string" ? msg.content.slice(0, 200) : msg.content,
        reasoningLen:
          typeof msg.reasoning === "string" ? msg.reasoning.length : 0,
        reasoningTail:
          typeof msg.reasoning === "string"
            ? msg.reasoning.slice(-250)
            : null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
