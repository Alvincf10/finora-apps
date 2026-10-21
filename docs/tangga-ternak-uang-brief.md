# Brief: Fitur Tangga Ternak Uang (Finora)

Dokumen ini untuk diskusi desain/produk (bukan AI coaching).

## Konteks produk

**Finora** adalah aplikasi personal finance (Next.js). Fitur **Tangga Ternak Uang** hidup di menu **Wawasan Keuangan** (`/insights`).

Sifat engine: **deterministic / rule-based** — bukan LLM. Semua sinyal dihitung dari data user (rekening, hutang, goals, transaksi, budget).

Inspirasi kerangka: 7 langkah “Tangga Ternak Uang”:

1. Nabung cash  
2. Lunasi hutang kecil (kecuali KPR)  
3. Dana darurat 3–6 bulan  
4. Investasi minimal 20% income  
5. Dana pendidikan anak  
6. Lunasi KPR secepat mungkin  
7. Kekayaan abadi & berbagi  

## Tujuan fitur

1. Memberi **urutan prioritas keuangan yang tetap** (tidak loncat-loncat).  
2. Menjadi **kompas jangka panjang**, terpisah dari alarm operasional bulan ini.  
3. Progress dihitung dari data nyata di app, bukan jawaban model AI.

## Arsitektur dua lapisan di halaman Insights

| Lapisan | Fungsi |
| --- | --- |
| **Tangga Ternak Uang** | “Kamu di step berapa? Fokus berikutnya apa?” — jarang berubah |
| **Wawasan / sinyal bulan ini** | Alert deterministik: budget overflow, cashflow negatif, hutang overdue, anomaly belanja, dll. |

Tangga ditampilkan di atas; sinyal bulanan di bawah.

## 7 langkah + sumber data

| Step | Judul | Selesai jika | Sumber data |
| --- | --- | --- | --- |
| 1 | Nabung cash 10 juta | Goal **Tabungan dasar 10jt** ≥ Rp10.000.000 (fixed) | **Goals** (auto-create + sync dari saldo likuid cash/bank/e-wallet) |
| 2 | Lunasin hutang kecil (kecuali KPR) | Tidak ada hutang `ACTIVE` non-KPR dengan sisa > 0 | **Debts** (`kind`: `CONSUMER` / `OTHER`) |
| 3 | Dana darurat 3–6 bulan | Coverage ≥ 3× essentials bulanan | **Goals** (nama darurat/emergency) + profil belanja |
| 4 | Investasi ≥ 20% income | Belanja kategori investasi ≥ 20% income bulan ini | **Transaksi/kategori** (heuristic nama: investasi, saham, reksa, dll.) |
| 5 | Dana pendidikan anak | Ada goal pendidikan/sekolah/anak (**selalu ditampilkan**) | **Goals** |
| 6 | Lunasin KPR | Tidak ada hutang `MORTGAGE` aktif | **Debts** (`kind`: `MORTGAGE` / infer dari nama KPR) |
| 7 | Kekayaan abadi & berbagi | Ada goal/kategori berbagi/zakat/donasi (**selalu ditampilkan**) | **Goals** + transaksi |

### Keputusan produk yang sudah dikunci

- Threshold step 1: **fixed Rp10.000.000** (bukan % income).  
- Step 5 & 7: **selalu muncul** di UI.  
- Step 7 tetap ditampilkan sebagai target akhir.

## Aturan penting: sequential gate

- Step berikutnya **tidak dihitung “selesai”** dan tidak menambah % progres tangga sampai step sebelumnya tuntas.  
- Contoh bug lama yang sudah diperbaiki: user masih Rp0 di step 1, tapi step 6 (tidak ada KPR) dianggap selesai → total ~14%.  
- Perbaikan: step yang “siap” di kemudian hari tetap **terkunci** sampai gilirannya; baru auto-complete saat step sebelumnya selesai.  
- **% Progres tangga** = jumlah step selesai secara berurutan / 7.

## Sync step 1 ↔ Goals

- Saat evaluasi tangga: pastikan goal **“Tabungan dasar 10jt”** ada (auto-buat jika belum).  
- `currentAmount = max(kontribusi manual, saldo likuid IDR)`, capped di Rp10jt (tidak menurunkan jika user sudah isi lebih besar manual).  
- CTA step 1 → halaman **Goals** (bukan Accounts).  
- Goal penuh → status `COMPLETED` → step 1 selesai.

## Sync step 2 & 6 ↔ Debts

- Langsung dari model Debt; **tidak** auto-buat hutang.  
- Step 2 = non-mortgage; step 6 = mortgage.  
- User set **jenis hutang** di UI Debts: Hutang kecil / KPR / Lainnya.  
- Nama mengandung “KPR/rumah” bisa diinfer sebagai mortgage jika jenis belum diisi.  
- Bayar / lunasi di Debts → progress tangga ikut update.

## UX ringkas

- Visual tangga naik (7 batang), fokus step aktif besar, timeline status (Selesai / Fokus / Belum).  
- Satu CTA utama per step aktif (Goals / Debts / saran anggaran / transaksi).  
- Copy & aturan berbahasa Indonesia.  
- Implementasi utama: `src/lib/financial/wealth-ladder.ts` + UI di `src/app/(app)/insights/page.tsx`.

## Limitation (untuk diskusi)

1. Step 4 mengandalkan **nama kategori** investasi (heuristic), belum flag kategori formal.  
2. Step 3/5/7 banyak mengandalkan **pola nama** goal.  
3. Step 7 “selesai” relatif soft (cukup ada goal/transaksi berbagi).  
4. Belum ada preferensi “tidak punya anak” untuk skip step 5.  
5. EUR: target 10jt tetap berbasis IDR; step 1 efektif penuh untuk currency IDR.  
6. Tidak ada AI coaching — hanya rule + angka.

## Pertanyaan diskusi

1. Apakah urutan 7 langkah ini optimal untuk konteks Indonesia / single-user?  
2. Apakah step 1 lebih baik 100% dari Goals saja, atau hybrid Goals + saldo likuid seperti sekarang?  
3. Bagaimana merancang step 4 (investasi 20%) yang lebih akurat tanpa AI?  
4. Apakah sequential gate terlalu ketat (mis. KPR sudah lunas tapi tidak boleh “selesai” sebelum pendidikan anak)?  
5. Ide gamification / notifikasi tanpa mengubah sifat deterministic?

## Prompt lanjutan (opsional)

> Diskusikan kelemahan desain, alternatif aturan, dan usulan perbaikan UX/data model untuk fitur Tangga Ternak Uang di atas. Prioritaskan solusi yang tetap deterministic (tanpa LLM) dan cocok untuk personal finance app single-user di Indonesia.
