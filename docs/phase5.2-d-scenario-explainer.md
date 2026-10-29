# Phase 5.2-D — Scenario Explainer

**Status:** Implemented  
**UI:** `/simulator` (Decision Lab)  
**API:** existing `POST /api/ai/explain` with `contextType: "scenario"`

---

## User flow

1. Jalankan simulasi / atur asumsi  
2. **Simpan skenario** (mengunci hasil engine)  
3. Klik **Jelaskan** pada baris tersimpan, atau centang ≥2 skenario untuk bandingkan  
4. Scenario Explainer memanggil AI dengan konteks dari backend saja  

AI **tidak** menjelaskan draft yang belum disimpan — mencegah angka non-reproducible.

---

## Backend

| Item | Detail |
|---|---|
| Single | `contextRef.scenarioId` → ownership check + payload skenario |
| Multi (≤3) | `contextRef.scenarioIds` → compare rows + warning jika snapshot beda / currency campur |
| Validator | `validateAiExplanation` — strip thinking, flag klaim aksi / canary invent |
| Response | `validationWarnings?: string[]` (opsional; UI lama aman) |

---

## Acceptance (PRD §8.5)

- [x] AI hanya memakai hasil simulasi backend  
- [x] AI tidak mengubah output simulasi / ledger  
- [x] Perbandingan currency dicek (limitation jika campur)  
- [x] Tidak menyatakan satu opsi selalu terbaik tanpa trade-off (prompt system)  
- [x] Kontrak Phase 5 explain tetap kompatibel  

**Next:** 5.2-E Decision Advisor (format rekomendasi 7 bagian + preferensi).
