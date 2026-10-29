# Phase 5.2-E — Decision Advisor

**Status:** Implemented  
**UI:** `/insights` (+ preference on `/settings`)  
**API:** existing `POST /api/ai/explain` with `contextType: "decision_advisor"`

---

## User flow

1. (Opsional) Set **prioritas keputusan** di Insights atau Settings  
2. (Opsional) Centang hingga 3 skenario tersimpan dari Decision Lab  
3. Ajukan pertanyaan ke Decision Advisor  
4. AI menjawab dengan format 7 bagian; angka hanya dari engine Finora  

AI **tidak** menghitung ulang Financial Health / forecast / skenario, dan **tidak** memutasi ledger.

---

## Backend

| Item | Detail |
|---|---|
| Context | Health + forecast 30d + Action Center + roadmap + preferensi (+ scenarioCompare opsional) |
| Preference | `User.decisionPreference` (default `UNSET`); override via `contextRef.decisionPreference` |
| System prompt | `DECISION_ADVISOR_SYSTEM` (bukan Financial Explainer) |
| Router task | `financial_reasoning` |
| Validator | `validateAiExplanation` sama seperti Phase 5 |

---

## Acceptance (PRD §9.6)

- [x] Rekomendasi dapat ditelusuri ke konteks backend  
- [x] AI tidak membuat skor finansial baru yang menggantikan Financial Health  
- [x] Preferensi UNSET / data kurang dinyatakan sebagai batasan  
- [x] Tidak ada mutation finansial dari output AI  
- [x] Kontrak Phase 5 explain tetap kompatibel  

**Next:** 5.2-F rollout / monitoring (opsional).
