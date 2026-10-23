# Phase 1 — Cost Optimization Baseline

**Tanggal:** 21 Oktober 2026  
**Status:** Implemented (baseline spend $0 sampai LLM call berikutnya tercatat)  
**Acuan:** `prd_agent/phase1.md` §9 Phase 1 · `CURRENT_STATE.md`

---

## Deliverable checklist

| Item | Status |
|---|---|
| Task routing (classify + routing YAML) | Done — `prd_agent/assistant/` |
| Cost ledger | Done — `/var/lib/openclaw-cost/ledger.jsonl` via plugin `cost-guard` |
| Budget warnings 70%/85% + hard $10 | Done — middleware `before_agent_run` (bukan prompt) |
| Soft-block Pro saat budget tinggi | Done — `cost-guard` + `diskusi-router` |
| Output / context limits | Done — OpenClaw `contextTokens=100k`, compaction safeguard, thinking off |
| Jalur `/saldo` deterministik | Done — Vira: `finora saldo` (no LLM) |
| Finora in-app AI cost append | Done — `src/lib/ai/provider.ts` → ledger yang sama |
| Laporan baseline | File ini + `scripts/cost-report.mjs` |
| DeepSeek sebagai primary | **Ditunda** — catat baseline Gemini dulu (rekomendasi Phase 0) |

---

## Perubahan runtime

### OpenClaw

- Plugin baru: `/root/.openclaw/extensions/cost-guard/`
- Plugin allow + `hooks.allowConversationAccess: true`
- `agents.defaults`:
  - `thinkingDefault: off`
  - `contextTokens: 100000`
  - `bootstrapMaxChars: 12000` / `bootstrapTotalMaxChars: 24000`
  - `contextLimits.toolResultMaxChars: 8000`
  - `compaction.mode: safeguard` (+ truncate, keepRecentTokens 8k)
  - `timeoutSeconds: 120`
- `diskusi-router`: tidak naik ke Pro jika soft budget terlampaui

### Finora Vira

- Perintah: `finora saldo` | `finora /saldo` | `finora cek saldo` → daftar `currentBalance` rekening (integer minor units)
- Help text diperbarui
- Restart service: `finora-vira` (aktif setelah restore `chmod 711 ~/.openclaw`)

### Tooling

```text
prd_agent/assistant/
├── config/{budget,pricing,routing.example}.*
├── src/{cost-ledger,router}/
├── scripts/cost-report.mjs
└── tests/cost-calc.test.mjs
```

---

## Cara ukur baseline (7 hari)

1. Biarkan OpenClaw & Finora AI berjalan normal.  
2. Setiap hari (atau on-demand):

```bash
node /root/.openclaw/finora-apps/prd_agent/assistant/scripts/cost-report.mjs
```

3. Catat di tabel:

| Tanggal | Spend USD | Requests | Notes |
|---|---:|---:|---|
| 2026-10-21 | 0.0000 | 0 | Ledger kosong saat go-live Phase 1 |
| | | | |

4. Setelah ≥7 hari atau ≥50 LLM requests: keputusan apakah ganti primary ke DeepSeek.

---

## Uji manual cepat

```bash
# Unit
node prd_agent/assistant/tests/cost-calc.test.mjs
node scripts/smoke-wa-balance.mjs

# WhatsApp (nomor allowlist)
#   finora saldo
#   finora total pengeluaran
# Harus dijawab Vira tanpa melibatkan OpenClaw LLM.
```

Hard-limit test (staging only): isi ledger palsu sampai ≥ $10 lalu kirim chat OpenClaw — harus ditolak dengan pesan budget.

---

## Rollback Phase 1

```bash
# Config OpenClaw
cp -a /var/backups/openclaw-phase0/openclaw.json.pre-phase1.* /root/.openclaw/openclaw.json
# atau last-good
cp -a /var/backups/openclaw-phase0/openclaw.json.last-good /root/.openclaw/openclaw.json
systemctl --user restart openclaw-gateway

# Disable plugin only
openclaw config set plugins.entries.cost-guard.enabled false
```

Jangan rollback data Finora.

---

## Gap tersisa → Phase 2

- `/api/assistant/*` + S2S auth  
- Transaction preview/confirm + idempotency (Vira masih write-immediate)  
- Hermes staging  

**Next:** Phase 2 — Finora Assistant API, atau observasi baseline 7 hari dulu.
