# Finora — Ringkasan Aplikasi (untuk diskusi produk/teknis)

Dokumen ini merangkum **semua fitur yang sudah ada** di codebase Finora, supaya bisa dibahas dengan GPT / reviewer tanpa harus baca seluruh repo.

**Produk:** Finora = *Finance* + *ora* (horizon) — personal finance dengan horizon yang jelas.  
**Persona:** single-user (data tetap di-scope `userId`).  
**Lokasi kode:** `/root/.openclaw/finora-apps`  
**Port default:** `3010`

---

## 1. Positioning singkat

Finora adalah aplikasi **personal finance management** yang menggabungkan:

1. **Ledger / money core** — rekening, transaksi, budget, hutang, fixed cost, goals  
2. **Financial intelligence** — insights deterministik, Tangga Ternak Uang, forecast, simulator, weekly review  
3. **Payday allocation** — alokasi gajian per siklus (waterfall envelopes)  
4. **WhatsApp Vira** — catat transaksi & query saldo via chat (parser deterministik, bukan LLM)

**Prinsip desain uang & AI (penting):**

- Semua angka finansial dihitung **backend, deterministic** (bukan LLM).  
- Uang disimpan sebagai **integer minor units** (IDR = rupiah utuh; EUR = cents).  
- Transfer **bukan** expense.  
- AI/OpenRouter hanya untuk **penjelasan teks** — tidak boleh menulis transaksi/saldo/budget/hutang.  
- WhatsApp Vira menulis transaksi lewat **parser aturan**, bukan model AI.

---

## 2. Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, Recharts |
| Backend | Next.js Route Handlers, Zod |
| DB | MongoDB + Mongoose |
| Auth | Auth.js v5 (credentials: email + password) |
| AI opsional | OpenRouter (`/api/ai/chat`) — explain only |
| WhatsApp | Baileys worker terpisah (`npm run wa:vira`) |
| i18n | ID + EN (copy halaman; label nav banyak tetap English) |
| Theme | Light / dark (`next-themes`) |

---

## 3. Peta halaman (navigasi aktual)

### Overview
| Route | Fitur |
| --- | --- |
| `/dashboard` | KPI siklus gaji, cash flow chart, budget utilization, debts due, recent txs, recommendations |
| `/alerts` | Daftar alert operasional (debt overdue/due soon, fixed cost due, budget warning/overflow) |

### Money
| Route | Fitur |
| --- | --- |
| `/transactions` | CRUD income / expense / transfer |
| `/accounts` | Rekening + saldo (cash, bank, e-wallet, credit card, other) |

### Planning
| Route | Fitur |
| --- | --- |
| `/payday` | **Payday split** — alokasi gajian (featured / center tab mobile) |
| `/budget` | Budget bulanan per kategori |
| `/debts` | Hutang + pembayaran; `/debts/history` riwayat |
| `/fixed-costs` | Biaya tetap berulang + mark paid |
| `/goals` | Target tabungan + progress |

### Insights
| Route | Fitur |
| --- | --- |
| `/insights` | **Tangga Ternak Uang** + sinyal/wawasan bulan ini |
| `/reports/weekly` | Weekly review / report |
| `/simulator` | What-if + skenario pelunasan hutang + emergency fund |
| `/reports` | Analytics / chart ringkasan |

### System
| Route | Fitur |
| --- | --- |
| `/whatsapp` | Connect Vira (QR), rekening default, status session |
| `/settings` | Profil, payday day, gaji bulanan, kategori, theme, bahasa |

### Auth
| Route | Fitur |
| --- | --- |
| `/register`, `/login` | Daftar & masuk |

---

## 4. Fitur detail per modul

### 4.1 Auth & multi-tenant data
- Register email + password (min 8 karakter).  
- Session NextAuth; hampir semua API memakai `requireUser()`.  
- Data selalu di-filter `userId`.  
- **Belum ada** API token server-to-server / Assistant API untuk agent eksternal.

### 4.2 Accounts (rekening)
Tipe: `CASH | BANK | E_WALLET | CREDIT_CARD | OTHER`  
Mata uang: `IDR | EUR`

Khusus credit card:
- `creditLimit`, `statementDueAmount`, `statementDueDay`
- `debitMode` — treat kartu seperti debit: belanja hanya sebatas cash yang dialokasikan di payday

Saldo liability (CC) diperlakukan berbeda dari aset likuid.

### 4.3 Transactions
- Tipe: `INCOME`, `EXPENSE`, `TRANSFER`
- Transfer mengubah dua rekening, tidak masuk expense/income analytics
- Kategori seeded + custom (Settings)
- Digunakan sebagai sumber truth untuk budget, insights, weekly, ladder, WA queries

### 4.4 Pay cycle (siklus gaji)
- User set `paydayDay` + `monthlySalary` di Settings  
- Banyak KPI/budget/insights memakai **periode cycle gaji**, bukan kalender 1–akhir bulan semata  
- Engine: `src/lib/financial/pay-cycle.ts`

### 4.5 Payday Allocation (“Payday split”)
Route: `/payday` — fitur planning utama.

Alur waterfall envelopes (auto + manual):
1. **Debts / CC statement** — tagihan kartu & cicilan due di cycle  
2. **Fixed costs** — biaya tetap dalam range cycle  
3. **Cash buffer** — buffer kas  
4. **Living / fun** — living money & spend cap CC  
5. **Goals** — saran isi goal sesuai Tangga Ternak Uang  
6. **Other** — envelope manual

Fitur terkait:
- Draft → Active → Completed  
- Edit salary / starting cash per cycle  
- Settle / mark envelope paid (bisa buat transaksi pembayaran)  
- Goal advice terhubung ke langkah aktif wealth ladder  

Engine: `payday-allocation.ts` + model `PaydayAllocation`

### 4.6 Budget
- Budget per kategori per periode  
- Utilization %; over-budget flags  
- Masuk dashboard, alerts, insights, weekly pace

### 4.7 Debts
- Status: `ACTIVE | PAID | CANCELLED`  
- Kind: `CONSUMER | MORTGAGE | OTHER` (penting untuk Tangga Ternak Uang)  
- Due date, minimum/planned payment, interest, installment  
- Catat pembayaran → update remaining + optional transaksi  
- History page  
- Simulasi skenario pelunasan (`/api/debts/simulate`, juga di Simulator)

### 4.8 Fixed costs
- Biaya tetap dengan due day  
- Mark paid dalam cycle (buat transaksi)  
- Reminder WhatsApp H-0 untuk yang belum bayar hari ini  
- Masuk payday envelopes & alerts

### 4.9 Goals (savings)
- Target tabungan, progress, status  
- Dipakai Tangga Ternak Uang (termasuk auto-sync **Tabungan dasar 10jt**)  
- Goal simulation di halaman goals / phase2 math

### 4.10 Dashboard
KPI contoh: income, expense, net cash flow, savings rate, total debt, assets, net worth  
Plus: category breakdown, budget bars, cash flow chart, debts due this month/cycle, recent txs, recommendation snippets, survival / goal allocation helpers.

### 4.11 Alerts (operasional, live-computed)
Tidak di-persist; dihitung dari data live.

Jenis:
- `DEBT_OVERDUE`, `DEBT_DUE_SOON`  
- `FIXED_COST_DUE`  
- `BUDGET_OVERFLOW`, `BUDGET_WARNING`  

Severity: `CRITICAL | WARNING | INFO`  
UI: halaman `/alerts` + bell di shell.

### 4.12 Insights + Tangga Ternak Uang
Route: `/insights` — **dua lapisan**:

**A. Tangga Ternak Uang** (kompas jangka panjang, sequential gate)

| Step | Judul | Selesai jika (ringkas) |
| --- | --- | --- |
| 1 | Nabung cash Rp10jt | Goal tabungan dasar ≥ 10.000.000 IDR (sync saldo likuid) |
| 2 | Lunasi hutang kecil (kecuali KPR) | Tidak ada hutang aktif non-mortgage |
| 3 | Dana darurat 3–6 bulan | Coverage ≥ 3× essential monthly |
| 4 | Investasi ≥ 20% income | Rasio kontribusi investasi ≥ 20% |
| 5 | Dana pendidikan anak | Ada goal pendidikan (selalu ditampilkan) |
| 6 | Lunasi KPR | Tidak ada mortgage aktif |
| 7 | Kekayaan abadi & berbagi | Ada goal/pola berbagi/zakat/donasi |

Aturan: step berikutnya tidak “selesai” / tidak menambah % sampai step sebelumnya tuntas.  
Engine: `wealth-ladder.ts` + `wealth-ladder-math.ts` — **tanpa LLM**.

**B. Sinyal / rekomendasi bulan ini** (operasional)
Contoh tipe insight: spending increase/decrease, budget warning/overflow/projected overflow, savings opportunity/risk, debt payment risk, emergency fund gap, income change, cashflow risk, unusual category spending, dll.  
Bisa di-persist sebagai `FinancialRecommendation` (NEW/VIEWED/ACCEPTED/DISMISSED/EXPIRED).

### 4.13 Weekly Review / Report
- Bandingkan minggu ini vs minggu lalu (WoW)  
- Pace vs budget allotment mingguan  
- Top categories + top items  
- Advice prioritas (HIGH/MEDIUM/LOW)  
- Bisa dikirim ke WhatsApp (`enqueueWeeklyReport`)  
- Perintah WA: `finora report minggu`

### 4.14 Analytics (`/reports`)
- Ringkasan chart / spending analytics berbasis history kategori

### 4.15 Simulator (`/simulator`)
- What-if: override income, expenses, debt payment, savings → cash flow, savings, debt payoff months, ending balance  
- Debt scenarios per hutang (estimasi bulan pelunasan)  
- Emergency fund coverage analysis  
Semua deterministic.

### 4.16 Categories & Settings
- Seed kategori default + CRUD custom  
- Classification expense: ESSENTIAL / IMPORTANT / DISCRETIONARY (dipakai ladder & essentials)  
- Theme + bahasa (ID/EN)  
- Payday day + monthly salary + base currency

### 4.17 AI chat (opsional)
- `POST /api/ai/chat` via OpenRouter  
- Rate limited  
- Hanya narasi/penjelasan dari konteks finansial yang sudah dihitung server  
- Tanpa AI key, ledger tetap jalan

### 4.18 WhatsApp Vira
Proses terpisah Baileys (`scripts/wa-vira.ts`).

**Inbound (deterministik):**
- Catat expense/income: `finora makan 50rb`, `finora gaji 10jt`  
- Query: `saldo`, `total pengeluaran`, `pengeluaran hari ini`, `pemasukan`, `ringkasan`, `report minggu`, `help`  
- Prefix default `finora` agar bisa berbagi nomor dengan OpenClaw  
- Allowlist `allowedFrom`; group diabaikan  
- Write path: parse → `createTransaction` **langsung** (belum ada preview/confirm/idempotency)

**Outbound (queue):**
- Weekly report  
- Fixed-cost due reminder  
Model: `WhatsAppOutbound` (pending → sent)

UI `/whatsapp`: QR connect, default account, session status.

---

## 5. Model data utama

`User`, `Account`, `Transaction`, `Category`, `Budget`, `Debt`, `DebtPayment`, `FixedCost`, `SavingsGoal`, `PaydayAllocation`, `FinancialRecommendation`, `MonthlySnapshot`, `WhatsAppSession`, `WhatsAppOutbound`

---

## 6. API surface (utama)

```
Auth:            /api/auth/*, /api/auth/register
Money:           /api/accounts, /api/transactions, /api/categories
Planning:        /api/budgets, /api/debts, /api/debts/:id/payments,
                 /api/debts/simulate, /api/fixed-costs, /api/fixed-costs/:id/pay,
                 /api/goals, /api/payday-allocation, /api/payday-allocation/settle
Intelligence:    /api/dashboard, /api/alerts, /api/insights, /api/analytics,
                 /api/simulator, /api/recommendations, /api/financial-summary,
                 /api/financial-context, /api/reports/weekly, /api/reports/weekly/send
System:          /api/settings, /api/whatsapp, /api/ai/chat
```

---

## 7. Aturan bisnis yang sering menjadi topik diskusi

1. **Minor units** — jangan hitung float untuk uang.  
2. **Transfer ≠ expense/income.**  
3. **Pay cycle** — banyak metrik mengikuti tanggal gajian, bukan 1–31 kalender.  
4. **Payday waterfall** — hutang & fixed dulu, baru living & goals.  
5. **Wealth ladder sequential gate** — progress % hanya step berurutan.  
6. **AI tidak menulis data uang.**  
7. **Vira write-immediate** — cepat, tapi belum ada konfirmasi (risiko salah parse).  
8. **Shared WA number** dengan OpenClaw — isolasi via prefix `finora`.  
9. **IDR-centric** untuk target ladder step 1 (10jt); EUR tidak dikonversi implisit.  
10. **Credit card** bisa debit-mode + statement due masuk alokasi gajian.

---

## 8. Yang belum / gap (konteks diskusi lanjutan)

Dari inventaris agent/PRD (bukan blocker fitur app user-facing):

- Belum ada `/api/assistant/*` + auth S2S + preview/confirm transaksi untuk agent  
- Vira belum idempotent / confirm flow  
- Cost ledger token AI (OpenClaw/OpenRouter) terpisah dari app ledger  
- Beberapa klasifikasi ladder masih fallback heuristic nama kategori/goal  
- Step pendidikan anak belum punya preferensi “tidak punya anak” untuk skip  
- Integrasi bank eksternal: tidak ada (manual entry + WA)

PRD terkait: `prd/phase1.md`, `prd/phase2.md`, `prd/phase3.md` (Tangga Ternak Uang), `docs/tangga-ternak-uang-brief.md`

---

## 9. Struktur kode singkat

```text
src/app/(app)/          # halaman fitur
src/app/api/            # route handlers
src/lib/financial/      # engine uang (phase1/2, ladder, payday, weekly, alerts…)
src/lib/whatsapp/       # parse, query, session, outbound
src/lib/ai/             # OpenRouter provider
src/models/             # Mongoose schemas
src/components/         # shell, UI, i18n
scripts/wa-vira.ts      # worker Baileys
docs/                   # brief produk
prd/                    # PRD phase 1–3
```

---

## 10. Prompt siap tempel ke GPT

```text
Berikut ringkasan aplikasi personal finance "Finora" (Next.js + MongoDB).
Baca dokumen ringkasan fitur ini, lalu bantu saya diskusikan:
1) prioritas produk 3 bulan ke depan,
2) risiko desain (terutama payday allocation, wealth ladder, WhatsApp write-immediate),
3) usulan perbaikan UX/data model yang tetap deterministic (tanpa LLM untuk angka uang),
4) apakah ada fitur overlapping yang sebaiknya digabung.

[tempel seluruh isi docs/finora-app-summary.md]
```

---

*Dibuat untuk diskusi eksternal. Sinkron dengan navigasi & modul di codebase per Oktober 2026.*
