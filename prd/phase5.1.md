# PRD — Finora Phase 5.1: Free Model Router

**Produk:** Finora Personal Finance  
**Versi:** 1.0  
**Tanggal:** 28 Oktober 2026  
**Status:** Ready for Engineering Review  
**Prioritas:** P1  
**Dependensi:** Finora Phase 5 — Financial Explainer  
**Repository:** `/root/.openclaw/finora-apps`  
**Branch:** `main`

**Prinsip produk:** Finora menghitung · AI menjelaskan · pengguna memutuskan.

---

## 1. Executive Summary

Finora Phase 5.1 meningkatkan integrasi OpenRouter yang sudah tersedia dengan menambahkan routing model berdasarkan jenis tugas.

Phase 5 telah menyediakan endpoint `POST /api/ai/explain`, context builder dari financial engine, UI Financial Explainer, rate limiting, timeout, serta konfigurasi model `openrouter/free`.

Pada Phase 5.1, Finora akan dapat memilih model gratis tertentu sesuai kebutuhan, misalnya penjelasan finansial biasa, analisis skenario, atau ringkasan sederhana.

Model-model yang sudah digunakan pengguna di OpenRouter meliputi:

- LFM2.5-2.6B
- North Mini Code (free)
- Flint (free)
- Dots3-Note Preview (free)
- Nemotron 3.5 Lightning
- Laguna S 2.1
- Xing4.0 29B A4B (free)
- Nemotron 3 Ultra
- Nemotron 3 Nano Omni (free)
- Others

Daftar tersebut menjadi kandidat awal evaluasi, bukan daftar model yang semuanya wajib diaktifkan. Ketersediaan, model ID API, batas gratis, dan kemampuan aktual setiap model harus diverifikasi melalui katalog OpenRouter saat implementasi.

### Tujuan utama

1. Memilih model berdasarkan jenis tugas, bukan memakai satu model untuk semua kebutuhan.
2. Memanfaatkan model gratis tanpa fallback otomatis ke model berbayar.
3. Menjaga konsistensi angka dan fakta yang berasal dari financial engine.
4. Mengukur kualitas, latensi, tingkat kegagalan, dan penggunaan setiap model.
5. Memungkinkan pergantian model tanpa mengubah business logic Finora.
6. Mempertahankan kompatibilitas dengan Financial Explainer Phase 5.

---

## 2. Latar Belakang

Implementasi Phase 5 menggunakan `openrouter/free` sebagai model default. Pendekatan ini sederhana, tetapi kontrol terhadap model yang menangani suatu tugas masih terbatas.

Routing berdasarkan tugas memungkinkan Finora mengevaluasi model yang berbeda untuk kebutuhan yang berbeda.

Contohnya:

- Pertanyaan sederhana tidak selalu memerlukan model dengan kemampuan reasoning lebih tinggi.
- Analisis skenario membutuhkan penjelasan trade-off yang lebih mendalam.
- Ringkasan membutuhkan respons singkat dan konsisten.
- Jika model utama gagal, Finora dapat mencoba model gratis alternatif sesuai kebijakan retry yang ditetapkan.

Routing tidak boleh dianggap otomatis meningkatkan akurasi. Kualitas setiap model harus dibuktikan melalui pengujian dengan pertanyaan dan konteks yang sama.

---

## 3. Goals dan Non-Goals

### 3.1 Goals

- Menambahkan Free Model Router di server.
- Menetapkan model berdasarkan kategori tugas.
- Mendukung konfigurasi model melalui environment variable.
- Mendukung fallback ke model gratis yang diizinkan.
- Menerapkan batas retry, timeout, dan token.
- Mencatat model yang digunakan dan hasil request.
- Menyediakan evaluasi kualitas model.
- Mempertahankan keamanan data dan autentikasi Phase 5.
- Memastikan semua perhitungan tetap dilakukan oleh financial engine.

### 3.2 Non-Goals

Tidak termasuk dalam Phase 5.1:

- AI proaktif atau scheduler AI.
- Multi-agent orchestration.
- AI yang mengubah transaksi atau saldo.
- AI yang menjalankan pembayaran atau alokasi dana.
- AI yang menggantikan deterministic financial engine.
- Model berbayar sebagai fallback.
- Fine-tuning atau hosting model sendiri.
- Migrasi ke provider AI lain.
- Perombakan besar pada UI Finora.
- AI untuk bisnis SpiderNet.
- Perubahan pada alur WhatsApp Finora Vira atau OpenClaw.

---

## 4. Model Routing Strategy

### 4.1 Kategori tugas

Router menggunakan kategori tugas yang eksplisit, bukan menebak kompleksitas hanya berdasarkan panjang pertanyaan.

| Task type | Tujuan | Strategi |
|---|---|---|
| `simple_summary` | Ringkasan singkat dari konteks yang sudah dihitung backend | Model ringan yang lolos evaluasi |
| `financial_explainer` | Menjelaskan Financial Health, forecast, atau kondisi keuangan | Model utama yang paling konsisten |
| `financial_reasoning` | Menjelaskan trade-off dan risiko dari skenario | Model dengan skor reasoning terbaik |
| `action_advisor` | Menjelaskan prioritas tindakan dan alternatif | Model yang konsisten menggunakan konteks Action Center |
| `general_explainer` | Pertanyaan umum terkait ringkasan keuangan | Model utama Financial Explainer |

Kategori `financial_reasoning` dan `action_advisor` dapat dikonfigurasi sejak awal, tetapi UI khusus untuk keduanya tetap mengikuti roadmap produk.

### 4.2 Kandidat model awal

| Model | Peran evaluasi awal | Status |
|---|---|---|
| Nemotron 3.5 Lightning | Kandidat utama untuk Financial Explainer | Perlu benchmark |
| Xing4.0 29B A4B | Kandidat reasoning finansial | Perlu benchmark |
| LFM2.5-2.6B | Kandidat ringkasan sederhana | Perlu benchmark |
| Nemotron 3 Ultra | Kandidat pembanding untuk reasoning | Perlu verifikasi model ID dan benchmark |
| Nemotron 3 Nano Omni | Kandidat alternatif ringan | Perlu verifikasi model ID dan benchmark |
| North Mini Code | Kandidat pembanding, terutama untuk tugas coding | Tidak diprioritaskan untuk penjelasan keuangan |
| Flint | Kandidat evaluasi tambahan | Perlu verifikasi kemampuan dan model ID |
| Dots3-Note Preview | Kandidat evaluasi tambahan | Perlu verifikasi kemampuan dan model ID |
| Laguna S 2.1 | Kandidat evaluasi tambahan | Perlu verifikasi kemampuan dan model ID |

Model-model tersebut belum otomatis menjadi rekomendasi final. Nama pada dashboard penggunaan tidak cukup untuk memastikan model ID, kemampuan, atau kebijakan gratisnya.

### 4.3 Baseline sebelum benchmark

Sebelum hasil benchmark tersedia:

- Pertahankan model konfigurasi Phase 5 yang sudah bekerja.
- Jangan mengganti model produksi secara otomatis hanya karena model baru tersedia.
- Jalankan evaluasi model kandidat menggunakan dataset yang sama.
- Promosikan model baru setelah memenuhi acceptance criteria.

Dengan demikian, Phase 5.1 tidak mengurangi kualitas fitur yang sudah live hanya demi mencoba model lain.

---

## 5. Model Registry

Buat konfigurasi terpusat untuk model yang diizinkan.

Contoh konseptual:

```typescript
type AiTaskType =
  | "simple_summary"
  | "financial_explainer"
  | "financial_reasoning"
  | "action_advisor"
  | "general_explainer";

type ModelRouteConfig = {
  primaryModel: string;
  fallbackModels: string[];
  maxOutputTokens: number;
  timeoutMs: number;
};
```

Registry bertanggung jawab atas:

- Daftar model yang diizinkan.
- Model utama setiap task type.
- Urutan fallback gratis.
- Batas token per task.
- Timeout per task.
- Status aktif/nonaktif model.
- Versi konfigurasi yang digunakan untuk evaluasi.

Router tidak boleh membuat ID model sendiri. Semua ID harus berasal dari konfigurasi yang diverifikasi.

---

## 6. Environment Configuration

Konfigurasi harus mendukung pergantian model tanpa perubahan kode.

Contoh awal:

```bash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

OPENROUTER_MODEL_SIMPLE_SUMMARY=
OPENROUTER_MODEL_FINANCIAL_EXPLAINER=
OPENROUTER_MODEL_FINANCIAL_REASONING=
OPENROUTER_MODEL_ACTION_ADVISOR=

OPENROUTER_FALLBACK_MODELS=
AI_ROUTER_ENABLED=false

AI_MAX_OUTPUT_TOKENS=800
AI_REQUEST_TIMEOUT_MS=20000
AI_MAX_RETRIES=1
```

Ketentuan:

1. Pertahankan `OPENROUTER_MODEL` untuk kompatibilitas dengan Phase 5.
2. Jika routing belum diaktifkan, endpoint harus tetap menggunakan jalur Phase 5 yang sudah berfungsi.
3. Model spesifik hanya boleh digunakan jika telah dikonfigurasi dan diverifikasi.
4. `OPENROUTER_FALLBACK_MODELS` hanya boleh berisi model gratis yang disetujui.
5. Model berbayar harus ditolak oleh validasi konfigurasi.
6. Jika registry tidak valid, sistem harus gagal secara aman, bukan memilih model berbayar.
7. API key tetap berada di environment server.

Nilai kosong pada contoh berarti harus diisi dengan model ID aktual yang sudah diverifikasi sebelum routing diaktifkan.

---

## 7. Routing Flow

### 7.1 Alur utama

1. Pengguna mengirim pertanyaan melalui UI Finora.
2. Backend melakukan autentikasi dan validasi input.
3. Backend menentukan `contextType` dan task type yang diizinkan.
4. Context builder mengambil data keuangan dari financial engine.
5. Router memilih model utama berdasarkan registry.
6. Request dikirim ke OpenRouter.
7. Backend memvalidasi status dan struktur respons.
8. Jika gagal dan kegagalan memenuhi syarat fallback, router mencoba model gratis berikutnya.
9. Respons yang valid dikembalikan ke UI.
10. Metadata penggunaan dicatat tanpa menyimpan konteks sensitif secara default.

### 7.2 Task classification

Untuk MVP, kategori tugas ditentukan dari konteks fitur yang diketahui backend.

Contoh:

- `financial_health` → `financial_explainer`
- `cash_flow_forecast` → `financial_explainer`
- `scenario` → `financial_reasoning`
- `action_center` → `action_advisor`
- `roadmap` → `financial_explainer`
- `general_summary` → `general_explainer`

`simple_summary` hanya boleh digunakan ketika endpoint atau fitur secara eksplisit meminta ringkasan sederhana.

Jangan mengandalkan model tambahan untuk menentukan task type secara otomatis pada MVP. Ini akan menambah latensi, biaya kuota, dan titik kegagalan.

---

## 8. Fallback Policy

### 8.1 Tujuan

Fallback digunakan untuk meningkatkan ketersediaan layanan, bukan untuk menjamin semua request pasti berhasil.

### 8.2 Kondisi yang dapat memicu fallback

- Model tidak tersedia.
- Provider mengembalikan error sementara yang memenuhi kebijakan retry.
- Timeout pada model utama.
- Respons model tidak memenuhi kontrak minimum.

### 8.3 Kondisi yang tidak boleh memicu fallback otomatis

- Input pengguna tidak valid.
- Pengguna tidak terautentikasi.
- Pengguna terkena rate limit Finora.
- Context builder gagal karena data tidak valid.
- Pengguna mencoba mengakses data milik pengguna lain.

### 8.4 Batas percobaan

- Maksimum satu percobaan model utama dan satu percobaan fallback per request sebagai baseline.
- Tidak ada retry tanpa batas.
- Jangan melakukan retry pada error validasi atau autentikasi.
- Terapkan timeout total agar fallback tidak membuat request berlangsung terlalu lama.
- Jika seluruh model gagal, kembalikan error aman kepada UI.

### 8.5 Kebijakan gratis

- Tidak ada fallback ke model berbayar.
- Jangan berasumsi semua model dengan label yang mirip memiliki kebijakan harga yang sama.
- Verifikasi model ID dan status harga dari katalog OpenRouter.
- Jika status gratis tidak dapat dipastikan, model tidak boleh masuk registry produksi.
- Jika OpenRouter mengembalikan rate limit atau kuota habis, jangan terus mencoba seluruh model secara berurutan.
- Jangan menganggap saldo penggunaan `$0.00` sebagai bukti bahwa setiap model selalu gratis dan tersedia.

---

## 9. Free Model Router Service

Buat service terisolasi, misalnya:

`src/lib/ai/model-router.ts`

Tanggung jawab:

- Membaca konfigurasi model.
- Memilih route berdasarkan task type.
- Memvalidasi model yang diizinkan.
- Menjalankan request ke adapter OpenRouter.
- Menjalankan fallback sesuai policy.
- Mengembalikan hasil dan metadata.
- Mencatat alasan kegagalan secara aman.

Contoh kontrak internal:

```typescript
type AiRouteRequest = {
  taskType: AiTaskType;
  systemPrompt: string;
  context: Record<string, unknown>;
  question: string;
};

type AiRouteResult = {
  explanation: string;
  requestedTask: AiTaskType;
  selectedModel: string;
  attempts: number;
  latencyMs: number;
};
```

Kontrak ini merupakan usulan desain. Sesuaikan dengan struktur adapter Phase 5 yang sudah ada dan hindari duplikasi service atau tipe yang sebenarnya sudah tersedia.

Router tidak boleh menerima fungsi yang dapat memodifikasi ledger atau memanggil mutation endpoint.

---

## 10. OpenRouter Adapter

Pertahankan adapter provider yang sudah digunakan Phase 5 jika implementasinya memadai.

Tanggung jawab adapter:

- Mengirim request ke endpoint OpenRouter yang benar.
- Menggunakan API key server-side.
- Memvalidasi HTTP status.
- Memetakan provider error ke kategori internal.
- Membatasi output token.
- Menerapkan timeout.
- Mengambil model aktual dari respons bila tersedia.
- Mengambil token usage bila tersedia.
- Tidak membocorkan response body sensitif kepada pengguna.

Router dan adapter harus dipisahkan:

- Router menentukan model yang digunakan.
- Adapter menjalankan komunikasi dengan provider.
- Context builder menentukan data keuangan yang boleh dikirim.

---

## 11. Response Contract

Pertahankan kontrak respons publik endpoint Phase 5 agar UI lama tidak rusak.

Jika metadata internal perlu ditambahkan, gunakan field opsional yang kompatibel.

Contoh konseptual:

```json
{
  "success": true,
  "data": {
    "explanation": "Penjelasan berdasarkan konteks Finora.",
    "contextType": "scenario",
    "metadata": {
      "taskType": "financial_reasoning",
      "fallbackUsed": false
    }
  }
}
```

Jangan menampilkan seluruh detail internal routing kepada pengguna jika tidak diperlukan.

Jangan mengubah bentuk response endpoint secara breaking tanpa audit pemakaian endpoint oleh UI yang sudah ada.

---

## 12. Observability dan Usage Monitoring

Setiap request dapat mencatat:

- Timestamp.
- Pseudonymous user identifier.
- Context type.
- Task type.
- Model yang diminta.
- Model yang benar-benar digunakan.
- Apakah fallback digunakan.
- Jumlah percobaan.
- Latensi.
- Status sukses atau gagal.
- Kategori error.
- Token usage bila provider menyediakannya.

Jangan menyimpan API key, seluruh prompt, atau ringkasan finansial lengkap secara default.

### Dashboard monitoring

Dashboard khusus bukan syarat wajib untuk routing MVP.

Prioritas pertama adalah struktur log yang konsisten dan aman. UI monitoring dapat dibuat pada fase berikutnya jika data penggunaan sudah tersedia.

---

## 13. Model Evaluation Framework

Pemilihan model harus berdasarkan pengujian yang dapat diulang.

### 13.1 Dataset evaluasi

Buat dataset pertanyaan dan konteks sintetis atau yang sudah dianonimkan, meliputi:

- Financial Health.
- Cash-flow forecast positif dan negatif.
- Utang dan dana darurat.
- Perbandingan dua skenario.
- Prioritas Action Center.
- Roadmap finansial.
- Konteks tidak lengkap.
- Perbedaan mata uang.
- Nilai nol dan nilai negatif.
- Pertanyaan yang meminta tindakan di luar izin AI.

### 13.2 Kriteria penilaian

| Metrik | Tujuan |
|---|---|
| Factual consistency | Tidak menyimpang dari fakta backend |
| Numeric integrity | Tidak mengubah atau mengarang angka |
| Context adherence | Menggunakan konteks yang relevan |
| Recommendation quality | Saran relevan dan mempertimbangkan trade-off |
| Indonesian quality | Bahasa Indonesia jelas dan natural |
| Latency | Waktu respons |
| Reliability | Persentase request sukses |
| Free-route compliance | Tidak menggunakan model berbayar |

### 13.3 Metode benchmark

- Berikan konteks dan pertanyaan yang sama ke setiap model.
- Gunakan dataset dan rubrik penilaian yang sama.
- Pisahkan skor kualitas jawaban dari latensi.
- Catat model ID, tanggal pengujian, serta konfigurasi.
- Gunakan penilaian otomatis hanya untuk penyaringan awal; verifikasi akurasi angka dengan assertion deterministik.
- Jangan mengirim data finansial pribadi mentah ke benchmark eksternal.

### 13.4 Promotion criteria

Model baru dapat menjadi default jika:

- Tidak ada pelanggaran numeric integrity pada test case yang diharapkan deterministik.
- Tidak ada kebocoran data atau tindakan di luar izin.
- Lulus regression tests.
- Kualitas jawaban minimal setara dengan baseline pada dataset evaluasi.
- Latensi dan tingkat kegagalan dapat diterima.
- Model ID dan kebijakan gratis telah diverifikasi.

Threshold kualitas yang lebih rinci ditetapkan setelah baseline Phase 5 diukur.

---

## 14. Security dan Financial Integrity

Semua kontrol Phase 5 tetap wajib:

- Authentication.
- Zod validation.
- Rate limit 3 request per menit dan 20 request per hari, kecuali keputusan produk mengubahnya.
- Timeout.
- Data minimization.
- Context builder dari backend.
- Error mapping aman.
- Tidak ada fallback berbayar.

Aturan finansial:

1. Semua angka keuangan berasal dari financial engine.
2. AI tidak menghitung ulang saldo, forecast, atau hasil simulasi.
3. Transfer bukan pendapatan atau pengeluaran.
4. Tidak ada agregasi lintas mata uang tanpa konversi yang eksplisit dan tervalidasi.
5. AI tidak menulis transaksi, saldo, budget, debt, atau roadmap.
6. AI tidak mengubah alokasi Payday.
7. Semua rekomendasi adalah saran, bukan tindakan yang telah dilakukan.
8. Context builder hanya mengambil data sesuai sesi pengguna.
9. Data dari prompt atau catatan pengguna diperlakukan sebagai input tidak tepercaya.

---

## 15. UI/UX Requirements

### MVP

UI Financial Explainer yang sudah ada di Dashboard dan Insights harus tetap berfungsi tanpa perubahan besar.

Perubahan UI hanya diperlukan jika dibutuhkan untuk:

- Menangani status provider gagal.
- Menampilkan status jawaban yang belum tersedia.
- Mencegah double submit.
- Menampilkan penjelasan error yang aman.

Pengguna tidak wajib memilih model secara manual. Pemilihan model merupakan tanggung jawab backend.

### Future enhancement

Setelah routing stabil, UI dapat menampilkan informasi nonteknis seperti:

- Penjelasan berhasil dibuat.
- Jawaban tidak tersedia sementara.
- Silakan mencoba kembali nanti.

Nama model dapat tersedia di halaman internal monitoring, tetapi tidak harus ditampilkan di setiap jawaban pengguna.

---

## 16. Testing Requirements

### Unit tests

- Task type memilih model yang benar.
- Konfigurasi kosong menggunakan baseline Phase 5.
- Model tidak diizinkan ditolak.
- Model berbayar ditolak dari registry gratis.
- Fallback hanya mencoba model yang diizinkan.
- Jumlah percobaan tidak melebihi batas.
- Provider error dipetakan dengan benar.
- Timeout total dihormati.
- Metadata model aktual dicatat bila tersedia.

### Integration tests

- Endpoint Phase 5 tetap berfungsi.
- UI lama tetap menerima response yang kompatibel.
- Autentikasi dan rate limit tidak berubah.
- Context builder tetap menggunakan backend.
- Model utama berhasil menghasilkan jawaban.
- Model utama gagal dan fallback gratis berhasil.
- Semua model gagal dan UI menerima error aman.
- Rate limit provider tidak memicu retry berlebihan.
- Tidak ada jalur model berbayar.

### Regression tests

Seluruh regression tests financial engine wajib lulus, termasuk:

- Metrics.
- Forecast.
- Scenarios.
- Action Center.
- Financial Health.
- Command Center.
- Roadmap.

Gunakan mock provider pada CI. Jangan menjadikan API gratis sebagai dependensi wajib seluruh pengujian otomatis.

---

## 17. Rollout Plan

### Phase 5.1-A — Audit dan baseline

- Baca PRD Phase 5 dan implementasi adapter yang ada.
- Identifikasi kontrak endpoint yang digunakan UI.
- Catat model default dan perilaku error saat ini.
- Buat baseline dataset evaluasi.

**Output:** audit dan hasil baseline.

### Phase 5.1-B — Router implementation

- Tambahkan Model Registry.
- Tambahkan task routing.
- Tambahkan fallback policy.
- Tambahkan model validation.
- Pertahankan adapter dan endpoint Phase 5 jika memungkinkan.

**Output:** router teruji dengan mock provider.

### Phase 5.1-C — Evaluation

- Benchmark model kandidat.
- Bandingkan kualitas, latency, dan reliabilitas.
- Verifikasi kebijakan gratis.
- Pilih model berdasarkan hasil.

**Output:** laporan evaluasi dan konfigurasi yang disetujui.

### Phase 5.1-D — Controlled rollout

- Pertahankan baseline sebagai jalur aman.
- Aktifkan router melalui feature flag.
- Uji pada production dengan penggunaan terbatas.
- Pantau error dan fallback.
- Rollback ke baseline jika terjadi regresi.

**Output:** routing produksi yang stabil.

---

## 18. Acceptance Criteria

Phase 5.1 dinyatakan selesai jika:

- [ ] Router memilih model berdasarkan task type.
- [ ] Model ID diverifikasi dari katalog OpenRouter.
- [ ] Model gratis tidak diasumsikan selalu tersedia.
- [ ] Tidak ada fallback ke model berbayar.
- [ ] Fallback hanya menggunakan model yang diizinkan.
- [ ] Jumlah percobaan dan timeout dibatasi.
- [ ] Endpoint Phase 5 tetap kompatibel.
- [ ] Financial context tetap dibangun oleh backend.
- [ ] Tidak ada akses tulis dari AI ke financial engine.
- [ ] Logging tidak membocorkan data sensitif.
- [ ] Unit dan integration tests lulus.
- [ ] Financial engine regression tests lulus.
- [ ] Model default baru dipilih berdasarkan evaluasi, bukan tebakan.
- [ ] Rollback ke baseline Phase 5 telah diuji.
- [ ] Dokumentasi environment dan deployment diperbarui.

---

## 19. Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Model gratis tidak tersedia | Fallback terbatas dan error aman |
| Routing meningkatkan latensi | Batasi percobaan dan timeout total |
| Model menghasilkan angka salah | Context builder dari engine dan numeric integrity tests |
| Model berubah atau dihapus provider | Registry terpusat dan verifikasi model ID |
| Fallback menghabiskan kuota | Maksimum satu fallback dan circuit-breaker bila diperlukan |
| Konfigurasi memilih model berbayar | Validasi registry dan pemeriksaan harga |
| Jawaban model tidak konsisten | Dataset benchmark dan regression tests |
| Perubahan merusak UI lama | Pertahankan response contract Phase 5 |
| Log menyimpan data sensitif | Logging metadata minimum dan redaksi |

---

## 20. Definition of Done

Phase 5.1 selesai ketika routing berbasis tugas, fallback gratis, konfigurasi terpusat, evaluasi model, dan pengujian keamanan telah diterapkan tanpa merusak Financial Explainer yang sudah ada.

**Keputusan akhir:** Finora tidak memilih model hanya karena nama atau parameter model terlihat lebih besar. Model dipilih berdasarkan hasil pengujian terhadap kebutuhan Finora, tetap gratis sesuai kebijakan yang diverifikasi, dan tidak pernah menjadi sumber kebenaran untuk perhitungan finansial.

