# PRD — Finora Phase 5.2: Reasoning Benchmark & Decision Advisor

**Produk:** Finora Personal Finance  
**Versi:** 1.0  
**Tanggal:** 28 Oktober 2026  
**Status:** Ready for Engineering Review  
**Prioritas:** P1  
**Dependensi:** Finora 2.0, Phase 5 Financial Explainer, Phase 5.1 Free Model Router  
**Repository:** `/root/.openclaw/finora-apps`  
**Branch:** `main`

**Prinsip utama:** Finora menghitung · AI menjelaskan · pengguna memutuskan.

---

## 1. Executive Summary

Finora Phase 5.2 bertujuan meningkatkan kualitas pengambilan keputusan finansial dengan memanfaatkan model AI gratis dari OpenRouter.

Fitur ini terdiri dari dua bagian:

1. **Reasoning Benchmark:** menguji dan membandingkan kualitas model gratis menggunakan kasus finansial sintetis yang sama.
2. **Decision Advisor:** menggunakan model yang sudah dievaluasi untuk membantu pengguna membandingkan skenario, memahami trade-off, serta menentukan pilihan yang sesuai dengan tujuan finansialnya.

Kandidat awal benchmark:

- NVIDIA Nemotron 3 Ultra.
- Xing4.0 29B A4B.
- NVIDIA Nemotron 3.5 Lightning sebagai kandidat pembanding.
- Model gratis lain hanya jika dibutuhkan untuk evaluasi tambahan.

Model-model tersebut tidak langsung ditetapkan sebagai model produksi. Model ID, ketersediaan, status gratis, batas penggunaan, serta kemampuan reasoning aktual wajib diverifikasi sebelum digunakan.

### Sasaran utama

- Menentukan model gratis terbaik berdasarkan pengujian yang dapat diulang.
- Mengurangi kesalahan interpretasi angka dan konteks.
- Menghasilkan rekomendasi dengan alasan dan trade-off yang jelas.
- Menghindari penggunaan beberapa model pada setiap request secara default.
- Menjaga agar AI tidak dapat memodifikasi ledger maupun hasil financial engine.
- Menyediakan mekanisme aman ketika model gagal atau kuota gratis habis.

---

## 2. Latar Belakang Produk

Finora telah memiliki fondasi deterministic financial engine dengan kapabilitas:

- Financial Health.
- Cash-flow forecast 30/60/90 hari.
- Decision Lab dan Scenario model.
- Action Center.
- Command Center.
- Financial Roadmap / Tangga Ternak Uang.
- Budget, debt, fixed costs, savings goals, dan Payday allocation.

Phase 5 menyediakan Financial Explainer melalui `POST /api/ai/explain`, context builder dari backend, UI di Dashboard dan Insights, rate limiting, timeout, serta integrasi OpenRouter.

Phase 5.1 memperkenalkan konsep routing model berdasarkan jenis tugas.

Phase 5.2 menambahkan evaluasi kualitas reasoning dan Decision Advisor yang menggunakan hasil simulasi dari backend.

### Prinsip penting

LLM tidak boleh menjadi sumber kebenaran finansial. Model yang memiliki kemampuan reasoning lebih tinggi sekalipun dapat salah memahami konteks, mengarang asumsi, atau memberikan rekomendasi yang tidak sesuai prioritas pengguna.

Karena itu, sistem harus membatasi masalah yang diberikan kepada AI, menyediakan data yang relevan, dan memvalidasi rekomendasi sebelum ditampilkan.

---

## 3. Goals dan Non-Goals

### 3.1 Goals

1. Membuat dataset benchmark untuk pengambilan keputusan finansial.
2. Membandingkan minimal dua kandidat model gratis.
3. Mengukur numeric integrity, factual consistency, kualitas rekomendasi, dan latensi.
4. Menetapkan model utama berdasarkan hasil benchmark.
5. Membuat Scenario Explainer di Decision Lab.
6. Membuat Decision Advisor untuk membandingkan alternatif finansial.
7. Menyediakan alasan, risiko, trade-off, dan kondisi yang dapat mengubah rekomendasi.
8. Mempertahankan seluruh perhitungan pada financial engine.
9. Membatasi penggunaan kuota gratis.
10. Menyediakan fallback yang tidak pernah menggunakan model berbayar.

### 3.2 Non-Goals

Tidak termasuk dalam Phase 5.2:

- AI yang melakukan transfer, pembayaran, atau perubahan transaksi.
- AI yang mengubah saldo, budget, utang, atau roadmap.
- AI proaktif yang berjalan otomatis setiap hari.
- Autonomous financial agent.
- Multi-agent deliberation pada setiap request.
- Integrasi bank atau open banking.
- Fine-tuning model.
- Self-hosting LLM.
- Model berbayar sebagai fallback.
- AI untuk bisnis SpiderNet.
- Perombakan besar pada arsitektur Finora.
- Penggantian financial engine dengan kalkulasi LLM.

---

## 4. Scope dan Tahapan

| Tahap | Deliverable | Prioritas |
|---|---|---|
| 5.2-A | Audit dan baseline benchmark | P0 |
| 5.2-B | Benchmark runner dan dataset evaluasi | P0 |
| 5.2-C | Pemilihan model produksi | P0 |
| 5.2-D | Scenario Explainer di Decision Lab | P1 |
| 5.2-E | Decision Advisor | P1 |
| 5.2-F | Controlled rollout dan evaluasi | P1 |

Tahapan harus dikerjakan secara berurutan. Decision Advisor tidak boleh mengasumsikan bahwa model sudah cukup baik sebelum hasil benchmark dievaluasi.

---

## 5. Phase 5.2-A — Audit dan Baseline

### Tujuan

Memahami implementasi aktual Phase 5 dan Phase 5.1 sebelum menambahkan kode.

### Tugas engineering

1. Baca `prd/phase5.md` dan dokumen Phase 5.1 jika tersedia.
2. Audit endpoint `POST /api/ai/explain`.
3. Audit OpenRouter adapter dan Model Router.
4. Audit context builder untuk `scenario`, `financial_health`, `cash_flow_forecast`, `action_center`, `roadmap`, dan `general_summary`.
5. Audit model ID dan konfigurasi environment.
6. Verifikasi apakah router sudah benar-benar diimplementasikan atau baru berupa rencana.
7. Identifikasi schema Scenario dan output financial engine yang dapat digunakan.
8. Catat kontrak API dan UI yang tidak boleh rusak.
9. Verifikasi regression tests yang sudah tersedia.

### Output

- Audit report.
- Daftar model kandidat dan model ID yang terverifikasi.
- Baseline kualitas model saat ini.
- Daftar gap sebelum benchmark.

Jangan melakukan refactor besar sebelum hasil audit ditinjau.

---

## 6. Phase 5.2-B — Reasoning Benchmark

### 6.1 Tujuan

Membandingkan kemampuan model gratis dalam memahami kondisi finansial dan menjelaskan trade-off dari alternatif yang sudah dihitung Finora.

Benchmark mengukur kualitas jawaban, bukan sekadar apakah model mampu menghasilkan teks yang meyakinkan.

### 6.2 Kandidat model

| Kandidat | Peran |
|---|---|
| Nemotron 3 Ultra | Kandidat reasoning utama |
| Xing4.0 29B A4B | Kandidat pembanding reasoning |
| Nemotron 3.5 Lightning | Kandidat pembanding efisiensi |
| Model tambahan | Hanya jika diperlukan untuk evaluasi |

Setiap model harus diverifikasi melalui katalog OpenRouter. Nama tampilan dashboard bukan pengganti model ID API yang valid.

Status gratis harus diperiksa saat konfigurasi dan rollout. Jangan menganggap model selalu gratis atau selalu tersedia hanya karena sebelumnya menampilkan biaya $0.00.

### 6.3 Dataset benchmark

Target awal: 30 kasus sintetis, yang dapat diperluas setelah baseline tersedia.

Distribusi yang diusulkan:

| Kategori | Jumlah |
|---|---:|
| Membandingkan pelunasan utang dan dana darurat | 6 |
| Cash flow negatif dan kebutuhan likuiditas | 5 |
| Membandingkan dua atau lebih skenario | 6 |
| Budget dan prioritas pengeluaran | 4 |
| Roadmap dan target tabungan | 4 |
| Data tidak lengkap atau tidak konsisten | 3 |
| Pertanyaan yang meminta tindakan di luar izin AI | 2 |
| **Total** | **30** |

Kasus harus mencakup kondisi finansial yang berbeda, termasuk:

- Cash flow positif dan negatif.
- Kewajiban yang segera jatuh tempo.
- Dana darurat yang belum memadai.
- Alternatif dengan trade-off yang berbeda.
- Nilai nol dan nilai negatif.
- IDR dan EUR secara terpisah.
- Konteks tidak lengkap.
- Skenario yang hasilnya hampir sama.

Seluruh data benchmark harus sintetis atau dianonimkan. Jangan mengirim data finansial pribadi mentah ke layanan benchmark eksternal.

### 6.4 Format kasus

Setiap kasus memiliki:

- ID kasus.
- Input pertanyaan.
- Konteks finansial sintetis.
- Output financial engine yang menjadi acuan.
- Fakta wajib yang harus dipertahankan.
- Kesimpulan yang dapat didukung data.
- Kesimpulan yang tidak boleh dibuat.
- Rubrik penilaian.
- Expected behavior untuk kasus tidak lengkap.

Expected answer tidak harus selalu berupa satu rekomendasi mutlak. Beberapa kasus memang harus menerima lebih dari satu pilihan yang masuk akal.

### 6.5 Metode pengujian

1. Jalankan setiap model menggunakan konteks dan pertanyaan yang sama.
2. Gunakan batas output token yang konsisten.
3. Simpan model ID, tanggal pengujian, konfigurasi, latency, dan status request.
4. Evaluasi output menggunakan rubric yang sama.
5. Jalankan assertion deterministik untuk klaim numerik.
6. Lakukan peninjauan manual pada kasus ambigu dan kasus dengan risiko finansial tinggi.
7. Ulangi pengujian pada sampel yang relevan untuk mengukur konsistensi.
8. Catat error, timeout, dan keterbatasan kuota.

Jangan menggunakan satu respons terbaik dari setiap model sebagai satu-satunya dasar pemilihan model.

### 6.6 Metrik evaluasi

| Metrik | Pengukuran |
|---|---|
| Numeric integrity | Apakah angka dan hubungan numerik sesuai output engine |
| Factual consistency | Apakah klaim didukung konteks |
| Context adherence | Apakah model mempertimbangkan kondisi yang relevan |
| Trade-off analysis | Apakah konsekuensi dari setiap pilihan dijelaskan |
| Recommendation quality | Apakah saran sesuai tujuan dan kendala |
| Uncertainty handling | Apakah model mengakui informasi yang kurang |
| Instruction compliance | Apakah model tetap berada dalam batas kewenangan |
| Latency | Waktu respons |
| Reliability | Persentase request yang berhasil |
| Free-route compliance | Tidak ada request ke model berbayar |

### 6.7 Aturan penilaian

- Numeric integrity dan factual consistency merupakan kriteria wajib.
- Model tidak boleh dinyatakan lulus hanya karena skor rata-ratanya tinggi jika masih melakukan kesalahan kritis.
- Rekomendasi tidak harus selalu sama dengan expected answer, selama didukung data dan memenuhi rubrik.
- Model yang tidak yakin harus dapat menyatakan bahwa data tidak cukup.
- Kegagalan provider dipisahkan dari kegagalan kualitas reasoning.
- Skor evaluasi otomatis tidak boleh dianggap sebagai bukti kebenaran finansial.

### 6.8 Promotion criteria

Model kandidat dapat dipromosikan jika:

1. Lulus seluruh regression tests.
2. Tidak melakukan pelanggaran kritis numeric integrity pada kasus wajib.
3. Tidak mengklaim melakukan tindakan finansial.
4. Tidak membocorkan data atau melampaui konteks yang diberikan.
5. Kualitas reasoning minimal setara baseline pada dataset yang sama.
6. Latensi dan reliability memenuhi target yang ditetapkan dari baseline.
7. Model ID dan kebijakan gratis telah diverifikasi.
8. Rollback ke model sebelumnya telah diuji.

Jika tidak ada kandidat yang memenuhi kriteria, pertahankan model Phase 5 yang sedang digunakan dan perbaiki context builder atau prompt terlebih dahulu.

---

## 7. Phase 5.2-C — Model Selection dan Routing

### 7.1 Prinsip pemilihan

Pilih model berdasarkan hasil benchmark, bukan berdasarkan:

- Ukuran parameter saja.
- Nama model.
- Klaim reasoning pada halaman pemasaran.
- Satu contoh jawaban yang bagus.
- Biaya yang tercatat $0.00 tanpa verifikasi harga.

### 7.2 Strategi awal

- Model utama: kandidat dengan kualitas terbaik yang memenuhi seluruh promotion criteria.
- Model fallback: kandidat gratis kedua yang sudah lulus kriteria.
- Model ringan: opsional, untuk tugas ringkasan sederhana jika benchmark mendukung.
- Model berbayar: tidak diizinkan.

### 7.3 Penggunaan beberapa model

Default production adalah satu model per request.

Fallback hanya dijalankan untuk kegagalan yang memenuhi policy. Model kedua tidak otomatis dipanggil untuk mengkritik setiap jawaban.

Untuk keputusan kompleks, multi-model review dapat dievaluasi kemudian sebagai fitur terpisah, dengan batas kuota dan latensi yang eksplisit.

### 7.4 Routing berdasarkan task type

| Task type | Model selection |
|---|---|
| `simple_summary` | Model ringan yang lulus benchmark |
| `financial_explainer` | Model utama yang lulus benchmark |
| `financial_reasoning` | Kandidat terbaik untuk analisis trade-off |
| `action_advisor` | Model yang lulus evaluasi konteks dan rekomendasi |
| `general_explainer` | Model utama Financial Explainer |

Task type ditentukan oleh backend dari fitur yang digunakan, bukan dari klaim bebas yang dikirim browser.

---

## 8. Phase 5.2-D — Scenario Explainer

### 8.1 Tujuan

Membantu pengguna memahami hasil simulasi yang sudah dibuat di Decision Lab.

### 8.2 User flow

1. Pengguna membuka `/simulator`.
2. Pengguna membuat atau memilih skenario.
3. Finora menghitung hasil skenario.
4. Pengguna memilih **Jelaskan dengan AI**.
5. Backend memverifikasi skenario dan membangun konteks.
6. Model menjelaskan perbedaan hasil.
7. Pengguna dapat mengajukan pertanyaan lanjutan atau kembali mengubah simulasi.

### 8.3 Konteks minimum

- Identitas skenario.
- Tujuan skenario.
- Asumsi yang digunakan.
- Periode simulasi.
- Metrik hasil dari financial engine.
- Keterbatasan data.
- Currency dan satuan nilai.
- Baseline yang digunakan untuk membandingkan skenario.

Konteks hanya memuat field yang benar-benar tersedia dan relevan pada schema saat ini.

### 8.4 Output yang diharapkan

- Ringkasan perbedaan skenario.
- Metrik yang paling berpengaruh.
- Keuntungan dari setiap opsi.
- Trade-off dan risiko.
- Asumsi yang memengaruhi hasil.
- Informasi tambahan yang diperlukan jika belum dapat menyimpulkan.

### 8.5 Acceptance criteria

- AI hanya menggunakan hasil simulasi dari backend.
- AI tidak mengubah output simulasi.
- Perbandingan menggunakan periode dan currency yang konsisten.
- AI tidak menyatakan satu opsi selalu terbaik tanpa mempertimbangkan tujuan.
- Jika hasil skenario tidak sebanding, sistem menjelaskan keterbatasannya.

---

## 9. Phase 5.2-E — Decision Advisor

### 9.1 Tujuan

Membantu pengguna menentukan pilihan berdasarkan tujuan, kendala, dan hasil simulasi.

Decision Advisor bukan mesin optimasi finansial baru. Fungsinya adalah menginterpretasikan pilihan yang sudah dievaluasi financial engine.

### 9.2 Contoh pertanyaan

- Apakah saya sebaiknya mempercepat pelunasan utang atau menambah dana darurat?
- Mana yang lebih sesuai dengan target keuangan saya?
- Apa konsekuensi jika saya memilih opsi dengan tabungan lebih besar tetapi cash buffer lebih kecil?
- Apa yang akan membuat rekomendasi ini berubah?
- Informasi apa yang perlu saya lengkapi sebelum mengambil keputusan?

### 9.3 Konteks yang dibutuhkan

- Tujuan finansial yang relevan.
- Hasil financial health.
- Cash-flow forecast.
- Kewajiban yang relevan.
- Dana darurat dan savings goals.
- Output skenario yang dibandingkan.
- Preferensi pengguna jika sudah ditetapkan.
- Data yang tidak tersedia atau tidak pasti.

Jangan mengirim seluruh riwayat transaksi jika ringkasan dan hasil simulasi sudah cukup.

### 9.4 Format rekomendasi

Setiap jawaban menggunakan struktur berikut jika relevan:

1. **Rekomendasi:** opsi yang paling sesuai dengan tujuan dan kendala yang diketahui.
2. **Alasan:** fakta dan metrik Finora yang mendukung pilihan.
3. **Trade-off:** konsekuensi dan manfaat yang dikorbankan.
4. **Risiko:** kondisi yang dapat membuat pilihan menjadi tidak aman atau kurang sesuai.
5. **Alternatif:** opsi lain yang masih masuk akal.
6. **Kondisi perubahan:** fakta baru yang dapat mengubah rekomendasi.
7. **Batasan:** informasi yang belum tersedia.

Rekomendasi harus bersifat kondisional, bukan jaminan hasil.

### 9.5 Preferensi pengguna

Decision Advisor boleh menggunakan prioritas yang secara eksplisit dipilih pengguna, misalnya:

- Menjaga likuiditas.
- Mempercepat pelunasan utang.
- Memaksimalkan tabungan.
- Menjaga kestabilan pengeluaran bulanan.
- Mengejar target tertentu pada roadmap.

Jika preferensi bertentangan dengan kendala finansial yang nyata, AI harus menjelaskan trade-off dan tidak mengabaikan kendala tersebut.

### 9.6 Acceptance criteria

- Rekomendasi dapat ditelusuri ke konteks backend.
- AI tidak membuat skor finansial baru yang menggantikan Financial Health.
- AI tidak membuat asumsi tersembunyi mengenai pendapatan atau kewajiban.
- AI dapat menyatakan data tidak cukup.
- Pengguna tetap menentukan keputusan akhir.
- Tidak ada mutation finansial yang dipicu oleh output AI.

---

## 10. Deterministic Validation Layer

Sebelum hasil AI ditampilkan, backend harus memvalidasi klaim yang dapat diperiksa secara deterministik.

### Validasi minimum

- Nominal yang disebutkan sesuai nilai dari konteks.
- Currency dan satuan benar.
- Periode skenario tidak tertukar.
- Perbandingan merujuk pada skenario yang benar.
- AI tidak menyebut metrik yang tidak tersedia seolah-olah nilainya diketahui.
- AI tidak mengklaim transaksi atau tindakan telah dilakukan.
- AI tidak menyatakan forecast sebagai hasil aktual.
- AI tidak mengubah definisi Financial Health atau cash flow.

Jika klaim penting gagal divalidasi, respons harus ditolak, disederhanakan, atau ditampilkan dengan peringatan yang sesuai.

Jangan mengandalkan regex sederhana sebagai satu-satunya pemeriksa seluruh makna jawaban. Gunakan struktur output yang sesuai, metadata sumber, dan assertion deterministik untuk field yang dapat diperiksa.

### Batasan validator

Validator deterministik tidak dapat membuktikan bahwa seluruh saran keuangan pasti benar. Kualitas interpretasi dan rekomendasi tetap memerlukan benchmark dan evaluasi manual.

---

## 11. API Design

Gunakan endpoint Phase 5 yang sudah ada jika kontraknya memadai. Jangan membuat endpoint baru hanya untuk menghindari penggunaan ulang service.

Endpoint konseptual:

`POST /api/ai/explain`

Request untuk Scenario Explainer:

```json
{
  "question": "Apa trade-off kedua skenario ini?",
  "contextType": "scenario",
  "contextRef": {
    "scenarioIds": ["scenario-a", "scenario-b"]
  }
}
```

Contoh tersebut adalah kontrak usulan, bukan klaim bahwa field `scenarioIds` sudah didukung oleh schema saat ini.

Backend wajib:

- Memverifikasi autentikasi.
- Memvalidasi request dengan Zod.
- Memverifikasi kepemilikan setiap skenario.
- Mengambil hasil dari backend.
- Menolak referensi yang tidak valid.
- Membentuk konteks sendiri.
- Memilih model berdasarkan router.
- Memvalidasi respons.
- Mengembalikan error yang aman.

Pertahankan response contract Phase 5 agar UI yang sudah ada tidak rusak.

---

## 12. Privacy, Security, dan Usage Limits

Seluruh kontrol Phase 5 tetap berlaku.

### Security

- API key hanya berada di environment server.
- Tidak ada API key pada frontend.
- Tidak ada akses database langsung dari model.
- Tidak ada akses tulis ke financial records.
- Data dari prompt diperlakukan sebagai input tidak tepercaya.
- Context builder hanya mengambil data milik pengguna yang terautentikasi.
- Log tidak menyimpan konteks finansial lengkap secara default.

### Usage limits

Gunakan rate limit Phase 5 sebagai baseline:

- Maksimum 3 request per menit per pengguna.
- Maksimum 20 request per hari per pengguna.

Benchmark runner harus memiliki batas penggunaan tersendiri dan tidak menghabiskan seluruh kuota fitur pengguna.

### Benchmark budget

- Benchmark dijalankan secara manual atau melalui job yang disengaja.
- Tidak ada benchmark otomatis pada setiap request pengguna.
- Tidak ada pemanggilan seluruh kandidat model untuk setiap pertanyaan.
- Maksimum percobaan per kasus dan per model harus dikonfigurasi.
- Model yang mengalami rate limit tidak boleh terus dicoba tanpa batas.

### Free-only policy

- Model ID wajib diverifikasi.
- Model yang tidak dapat dipastikan gratis tidak boleh digunakan.
- Tidak ada fallback ke model berbayar.
- Provider failure tidak boleh menyebabkan retry yang tidak terkendali.
- Jika seluruh kandidat gagal, Finora menampilkan error aman dan tetap berfungsi normal.

---

## 13. Testing Strategy

### 13.1 Unit tests

- Dataset benchmark dapat dibaca dan divalidasi.
- Semua model menerima input yang sama.
- Scoring rubric menghasilkan skor yang konsisten.
- Numeric assertions mendeteksi angka yang salah.
- Model ID tidak valid ditolak.
- Model berbayar ditolak dari registry gratis.
- Task type memilih route yang benar.
- Fallback dibatasi sesuai konfigurasi.
- Context builder tidak mencampur mata uang.
- Scenario reference milik pengguna lain ditolak.
- Validator menolak klaim numerik yang tidak sesuai.
- Tidak ada jalur AI untuk mengubah ledger.

### 13.2 Integration tests

- Financial Explainer Phase 5 tetap bekerja.
- Scenario Explainer mengambil output backend.
- Decision Advisor menerima konteks yang valid.
- Model utama gagal dan fallback gratis berhasil.
- Semua model gagal dan error aman dikembalikan.
- Provider timeout ditangani.
- Rate limit tidak memicu percobaan berlebihan.
- UI lama tetap kompatibel.
- Financial engine tidak berubah akibat request AI.

### 13.3 Regression tests

Semua regression tests yang ada harus tetap lulus, termasuk:

- Metrics.
- Forecast.
- Scenarios.
- Action Center.
- Financial Health.
- Command Center.
- Roadmap.

Gunakan mock provider pada CI. Jangan menjadikan API gratis sebagai dependensi wajib seluruh pengujian otomatis.

---

## 14. Rollout Plan

### Tahap A — Audit

- Audit Phase 5 dan Phase 5.1.
- Verifikasi model ID dan free status.
- Buat dataset sintetis.
- Catat baseline model saat ini.

**Output:** audit report dan benchmark dataset.

### Tahap B — Benchmark

- Jalankan model kandidat pada dataset yang sama.
- Hitung skor berdasarkan rubric.
- Periksa kesalahan numerik secara deterministik.
- Tinjau kasus yang ambigu secara manual.

**Output:** laporan evaluasi model dan kandidat pemenang.

### Tahap C — Scenario Explainer

- Tambahkan integrasi ke Decision Lab.
- Gunakan hasil financial engine.
- Tambahkan validator dan error handling.
- Jalankan regression tests.

**Output:** Scenario Explainer yang aman.

### Tahap D — Decision Advisor

- Tambahkan format rekomendasi terstruktur.
- Gunakan tujuan dan preferensi pengguna.
- Tampilkan alasan, trade-off, risiko, dan alternatif.
- Pastikan pengguna tetap memegang keputusan.

**Output:** Decision Advisor MVP.

### Tahap E — Controlled rollout

- Aktifkan melalui feature flag.
- Pertahankan model baseline.
- Pantau kualitas, latensi, fallback, dan error.
- Rollback jika terjadi regresi.

**Output:** fitur production yang stabil.

---

## 15. Acceptance Criteria

Phase 5.2 dianggap selesai jika:

- [ ] Audit Phase 5 dan Phase 5.1 selesai.
- [ ] Minimal dua kandidat gratis telah diuji.
- [ ] Benchmark dataset mencakup minimal 30 kasus sintetis.
- [ ] Scoring rubric terdokumentasi.
- [ ] Numeric integrity diuji dengan assertion deterministik.
- [ ] Model produksi dipilih berdasarkan hasil benchmark.
- [ ] Model ID dan kebijakan gratis diverifikasi.
- [ ] Tidak ada fallback ke model berbayar.
- [ ] Scenario Explainer tersedia di Decision Lab.
- [ ] Decision Advisor dapat membandingkan alternatif.
- [ ] Rekomendasi menyertakan alasan dan trade-off yang relevan.
- [ ] AI dapat mengakui informasi yang belum tersedia.
- [ ] Validator memeriksa klaim yang dapat diverifikasi.
- [ ] Tidak ada akses tulis ke ledger.
- [ ] Rate limit dan timeout tetap berlaku.
- [ ] Financial engine regression tests lulus.
- [ ] UI Phase 5 tetap kompatibel.
- [ ] Rollback ke baseline telah diuji.

---

## 16. Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Model gratis memiliki reasoning yang lemah | Benchmark dan seleksi berbasis hasil |
| Model menghasilkan angka salah | Deterministic validation |
| Model memberi rekomendasi tanpa memahami preferensi | Gunakan tujuan eksplisit dan jelaskan trade-off |
| Model terlalu yakin | Wajib menangani ketidakpastian |
| Dua model memberi jawaban berbeda | Evaluasi berdasarkan data dan aturan, bukan voting mayoritas |
| Kuota gratis habis | Batas penggunaan dan fallback terbatas |
| Model berubah atau dihapus | Registry terpusat dan verifikasi model ID |
| Benchmark bias | Dataset beragam dan evaluasi manual |
| AI merusak perhitungan finansial | Isolasi penuh dari financial engine |
| Latensi terlalu tinggi | Satu model per request secara default |
| Data sensitif terekspos | Minimisasi konteks dan logging aman |

---

## 17. Definition of Done

Phase 5.2 selesai ketika model gratis telah dibandingkan dengan metode yang konsisten, model produksi dipilih berdasarkan bukti, Scenario Explainer dan Decision Advisor telah diuji, seluruh rekomendasi terikat pada data backend, dan tidak ada kemampuan AI untuk mengubah ledger secara langsung.

**Keputusan arsitektur akhir:**

Finora tidak mencoba membuat model gratis menjadi sumber kebenaran. Finora membangun sistem yang membuat model gratis berguna melalui konteks yang tepat, evaluasi terukur, validasi deterministik, serta batas kewenangan yang jelas.

Jika tidak ada model gratis yang memenuhi kriteria kualitas, fitur Decision Advisor tidak boleh dipaksakan aktif. Pertahankan Financial Explainer yang ada dan tampilkan keterbatasan dengan jelas.