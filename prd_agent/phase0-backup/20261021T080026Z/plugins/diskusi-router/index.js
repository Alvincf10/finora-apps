// Diskusi Router
//
// Automatically routes conversation turns to Gemini 3.1 Pro when the user is in
// "discussion" mode, and lets everything else fall through to the agent's
// default model (Gemini 2.5 Flash). The mode is sticky per session: once a
// discussion is started it stays on Pro until the user signals they are done,
// so multi-turn discussions do not drop back to Flash mid-way.

const DISCUSSION_PROVIDER = "google";
const DISCUSSION_MODEL = "gemini-3.1-pro-preview";

// Entering discussion mode -> use Pro. "diskusi" also covers berdiskusi /
// diskusikan / diskusiin via substring match.
const START_TRIGGERS = [
  "diskusi",
  "brainstorm",
  "bahas",
  "berdebat",
  "discuss",
];

// Leaving discussion mode -> back to the default model. Checked before the
// start triggers so "diskusi sudah selesai" correctly ends the mode.
const STOP_TRIGGERS = [
  "selesai diskusi",
  "stop diskusi",
  "akhiri diskusi",
  "udahan diskusi",
  "selesai",
  "cukup",
  "udahan",
  "sudahi",
  "kembali normal",
  "mode normal",
  "balik flash",
  "ganti flash",
  "pakai flash",
  "end discussion",
];

// sessionKey -> true while a discussion is active. In-memory only; a gateway
// restart resets everyone to the default model, which is the safe direction.
const activeSessions = new Map();

function matchAny(text, triggers) {
  for (const trigger of triggers) {
    if (text.includes(trigger)) return trigger;
  }
  return null;
}

export default {
  id: "diskusi-router",
  name: "Diskusi Router",
  description:
    "Otomatis pakai Gemini 3.1 Pro saat mode diskusi (sticky per sesi), lalu kembali ke model default (Flash) saat diskusi selesai.",
  register(api) {
    api.on("before_model_resolve", (event, ctx) => {
      const prompt = typeof event?.prompt === "string" ? event.prompt : "";
      if (!prompt) return;

      const text = prompt.toLowerCase();
      const key = ctx?.sessionKey || ctx?.sessionId || "__global__";

      const stopHit = matchAny(text, STOP_TRIGGERS);
      const startHit = stopHit ? null : matchAny(text, START_TRIGGERS);

      if (stopHit) {
        if (activeSessions.get(key)) {
          activeSessions.delete(key);
          api.logger?.info?.(
            `diskusi-router: stop ('${stopHit}') -> default model [${key}]`,
          );
        }
        return; // default model (Flash)
      }

      if (startHit) {
        if (!activeSessions.get(key)) {
          api.logger?.info?.(
            `diskusi-router: start ('${startHit}') -> ${DISCUSSION_PROVIDER}/${DISCUSSION_MODEL} [${key}]`,
          );
        }
        activeSessions.set(key, true);
        return {
          providerOverride: DISCUSSION_PROVIDER,
          modelOverride: DISCUSSION_MODEL,
        };
      }

      if (activeSessions.get(key)) {
        return {
          providerOverride: DISCUSSION_PROVIDER,
          modelOverride: DISCUSSION_MODEL,
        };
      }

      return; // default model (Flash)
    });
  },
};
