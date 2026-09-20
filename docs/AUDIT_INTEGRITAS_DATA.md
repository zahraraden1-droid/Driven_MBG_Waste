# Laporan Audit Integritas Data Produksi — MBGCircular SPPG MBG

**Tanggal audit:** 20 September 2026
**Metode:** pembacaan langsung database produksi Supabase via PostgREST, **read-only** (hanya `GET`/`SELECT`). Tidak ada operasi tulis.
**Skrip:** `tools/audit/01-audit-integritas-data.mjs`, `tools/audit/02-verifikasi-schema-dan-bukti.mjs`
**Bukti mentah:** `tools/audit/hasil/audit-integritas-data.json`, `tools/audit/hasil/verifikasi-schema.json`, `tools/audit/hasil/waste_records-detail.csv`, `tools/audit/hasil/waste_records-per-tanggal.csv`

> **Catatan kredensial:** laporan ini tidak memuat kunci API, token, atau kata sandi apa pun. Kredensial dibaca dari `.env` (ter-gitignore) dan tidak pernah ikut tertulis ke output.

---

## A. Ringkasan Eksekutif

Audit ini dilaksanakan untuk menjawab satu pertanyaan: **apakah data produksi MBGCircular dapat dipercaya untuk menopang klaim kinerja pada paper?**

Jawabannya: **belum.** Sistem yang berjalan saat ini menghasilkan data, tetapi data tersebut tidak dapat dipakai apa adanya untuk klaim kinerja, dan satu di antaranya justru **bertentangan langsung dengan isi paper**.

Tiga temuan utama:

1. **90% baris data limbah bernilai nol, dan total seluruh data hanya 0,2 kg.** Dari 60 baris `waste_records`, sebanyak 54 baris bernilai `0` kg (90%). Enam baris sisanya berjumlah total **0,200 kg** — nilai ini **persis pada ambang deteksi load cell** (`DUMP_DELTA_KG = 0.02` kg per sesi, `smart_container_esp32cam.ino:53`). Artinya seluruh data limbah yang tersimpan berada di **lantai derau (noise floor)** sensor, bukan pada rentang pengukuran yang bermakna.

2. **Seluruh 32 baris telemetri maggot chamber kosong.** Semua kolom sensor (`suhu_bilik_c`, `kelembapan_persen`, `kadar_amonia_ppm`, `suhu_substrat_c`, `estimasi_berat_maggot_kg`) bernilai `null` pada 32 dari 32 baris. Insert berjalan (ada 32 baris dengan jeda ~30 detik sesuai setelan firmware), tetapi **nilainya null** — sehingga **jalur telemetri maggot chamber belum pernah sekali pun menyimpan pembacaan nyata**. Paper menyatakan sistem "mencatat data bobot sampah secara real-time dengan latency <2 detik"; **database tidak memiliki satu pun nilai sensor sebagai bukti.**

3. **Data tidak memiliki provenance.** Tidak ada kolom yang menandai asal data (`sumber`, `is_simulated`, `model_versi`, `confidence`). Model mock dan model Roboflow menulis ke tabel dan bentuk baris yang identik, sehingga **setelah tersimpan, data nyata dan data simulasi tidak dapat dibedakan lagi**. Ini adalah masalah struktural, bukan sekadar bug: selama provenance tidak ada, tidak ada angka yang bisa diaudit.

**Konsekuensi untuk paper:** angka pada Tabel 4 (dan setiap klaim turunannya) saat ini **belum dapat dipertanggungjawabkan dari database**. Ini bukan berarti sistemnya gagal — sistemnya berjalan dan menulis data. Yang belum ada adalah **data yang layak dikutip** dan jejak asal yang memungkinkan audit. Keduanya dapat diperbaiki, dan sebagian besar perbaikannya berbiaya rendah.

**Satu catatan yang perlu disampaikan cepat ke paper manager:** hasil audit ini **tidak menyerang** klaim hardware atau arsitektur. Hardware sudah final dan jalur datanya terbukti hidup (32 insert berhasil dengan jeda tepat 30 detik). Yang belum terjadi adalah **validasi nilai sebelum disimpan** — maka yang tercatat adalah "ada aktivitas" tanpa "ada pengukuran".

---

## B. Metode Audit

| Aspek | Keterangan |
|---|---|
| Sumber data | Database produksi Supabase (PostgreSQL) proyek yang dipakai backend Railway |
| Cara akses | HTTP `GET` ke PostgREST (`/rest/v1/<tabel>?select=*`), kunci `service_role` dari `.env` lokal |
| Sifat | **Read-only.** Tidak ada `POST`/`PATCH`/`DELETE`. Skema dibaca dari OpenAPI PostgREST |
| Tabel diperiksa | `users`, `maggot_batches`, `sensor_readings`, `menu_uploads`, `waste_records`, `maggot_harvests`, `sales_records`, `ai_predictions` |
| Keterbatasan | Audit tidak dapat melihat log runtime Railway, nilai `confidence`/kelas Roboflow per deteksi, maupun isi berkas foto — karena tidak ada kolomnya di database. Keterbatasan ini sendiri adalah temuan. |

---

## C. Hasil Kuantitatif

### C.1 Inventaris tabel

| Tabel | Jumlah baris | Rentang `created_at` | Catatan |
|---|---:|---|---|
| `users` | 3 | — | 3 akun: superadmin, admin_sekolah, dapur_mbg |
| `maggot_batches` | 1 | 2026-09-18 | batch `001`, 5 gram telur, status `inkubasi` |
| `sensor_readings` | **32** | 2026-09-19 10:20:57 → 10:37:32 UTC | **seluruh kolom sensor null** |
| `menu_uploads` | **0** | — | tidak ada data menu |
| `waste_records` | **60** | 2026-09-19 (10 grup insert) | 54 baris = 0 kg |
| `maggot_harvests` | **0** | — | **tidak ada panen maggot sama sekali** |
| `sales_records` | **0** | — | tidak ada penjualan |
| `ai_predictions` | **0** | — | tidak ada prediksi tersimpan |

**Catatan penting untuk paper:** `maggot_harvests` = 0 baris berarti **tidak ada satu pun data panen/biomassa maggot**. Judul paper menjanjikan *"Maggot Biomass"*, dan Tabel 2 menjanjikan produk sampingan kasgot & biomassa larva. Dari sisi database, **keduanya tidak memiliki data sama sekali.** Ini sejalan dengan temuan dokumen revisi, tetapi sekarang terbukti dengan angka, bukan dugaan.

### C.2 `waste_records` — inti masalah

**Struktur insert.** Data datang dalam **10 grup insert × 6 baris = 60 baris**. Setiap grup memiliki **susunan kategori yang identik**, 10 kali dari 10:

```
buah | lauk | lauk | nasi | sayur | sayur
```

Ini persis pola yang dihasilkan `mockPredictions()` (`backend/src/services/roboflowService.js:62-72`), yang selalu mengembalikan **tepat 6 kelas** dengan komposisi kategori `nasi, sayur×2, lauk×2, buah` setelah `mapClassToKategori()`.

**Distribusi berat.** Hanya ada **6 nilai `berat_kg` unik** di seluruh tabel:

| Nilai `berat_kg` | Jumlah | Tafsiran |
|---|---:|---|
| `0` | **54** | 9 dari 10 sesi penimbangan menghasilkan nol |
| `0.021` | 1 | |
| `0.029` | 1 | |
| `0.034` | 1 | |
| `0.038` | 1 | |
| `0.039` | 2 | |
| **Total** | **60** | **0,200 kg** |

Dua hal yang harus dibaca dari tabel ini:

1. **54 dari 60 baris adalah nol.** Ini terjadi karena `readKg()` gagal atau beban belum terbaca, lalu hasilnya tetap diproses dan didistribusikan oleh `hitungProportion()` sebagai 0 kg ke enam kategori. Nol bukan "tidak ada sisa makanan" — nol adalah **kegagalan pembacaan yang tercatat sebagai hasil sah**.
2. **Total 0,2 kg berada di ambang deteksi sensor.** Satu sesi baru dimulai bila `delta > DUMP_DELTA_KG` yaitu **0,02 kg** (`smart_container_esp32cam.ino:53,705`). Seluruh korpus data (0,2 kg) setara dengan ambang minimum satu sesi dikalikan sepuluh. Untuk penimbangan sisa makanan ompreng siswa, angka ini **tidak mewakili rentang pengukuran yang bermakna** dan tidak dapat dipakai untuk menjustifikasi klaim reduksi sampah sekolah.

**Konsekuensi pada KPI publik.** Fungsi `get_public_kpi()` (`supabase/schema.sql:78-87`) menjumlahkan seluruh tabel tanpa filter. Nilai yang **sedang tayang di dashboard publik saat audit ini**:

```json
{ "totalLimbahTerolahKg": 0.2, "totalPanenMaggotKg": 0, "penghematanEmisiCo2e": 0.104 }
```

Ketiganya berasal dari data yang 90% nol. `penghematanEmisiCo2e` = 0,104 kg CO2e dihitung dengan faktor `0,52` yang **tidak memiliki rujukan apa pun di dalam kode**.

### C.3 `sensor_readings` — telemetri kosong

| Kolom | Nilai non-null | Persentase terisi |
|---|---:|---:|
| `suhu_bilik_c` | 0 dari 32 | **0%** |
| `kelembapan_persen` | 0 dari 32 | **0%** |
| `kadar_amonia_ppm` | 0 dari 32 | **0%** |
| `suhu_substrat_c` | 0 dari 32 | **0%** |
| `estimasi_berat_maggot_kg` | 0 dari 32 | **0%** |
| `batch_id` | 0 dari 32 | **0%** |
| `sekolah_id` | 0 dari 32 | **0%** (kolom warisan skema lama) |

Contoh baris apa adanya:

```json
{"id":"8383230f-…","sekolah_id":null,"suhu_bilik_c":null,"kelembapan_persen":null,
 "kadar_amonia_ppm":null,"estimasi_berat_maggot_kg":null,
 "created_at":"2026-09-19T10:20:57.181799+00:00","suhu_substrat_c":null,"batch_id":null}
```

**Yang sudah benar (bukti jalur hidup):** 32 baris itu ada, dengan jeda antar-pembacaan yang saya ukur dari `created_at`:

| Statistik interval | Nilai |
|---|---|
| n | 31 |
| min | 29,4 detik |
| **p50** | **30,0 detik** |
| mean | 32,1 detik |
| p95 | 30,6 detik |
| max | 95,1 detik |

Interval p50 = **30,0 detik** sama persis dengan `SEND_INTERVAL_MS = 30000` (`maggot_chamber_esp8266.ino:41`). Jadi **penjadwalan firmware bekerja tepat**, dan jalur MQTT → backend → database **hidup dan menyimpan baris**. Yang tidak sampai adalah **nilainya**.

Payload firmware ternyata **sudah benar bentuknya** — saya bandingkan langsung dengan yang dibaca backend:

| Firmware `addField()` (`maggot_chamber_esp8266.ino:408-412`) | Backend `processChamber()` (`iotProcessor.js:44-51`) | Cocok? |
|---|---|---|
| `suhuBilikC` | `suhuBilikC` | ✅ |
| `kelembapanPersen` | `kelembapanPersen` | ✅ |
| `kadarAmoniaPpm` | `kadarAmoniaPpm` | ✅ |
| `suhuSubstratC` | `suhuSubstratC` | ✅ |
| `beratMaggotPanenKg` | `beratMaggotPanenKg` | ✅ |

**Jadi masalahnya bukan salah nama field.** Kesimpulan yang paling didukung bukti: pengiriman nilai `null` oleh firmware diproses backend **tanpa validasi apa pun**, sehingga baris tetap dibuat meski tidak ada satu pun nilai terukur. Ini sejalan dengan komentar jujur di firmware sendiri (`maggot_chamber_esp8266.ino:389-391`) yang **secara eksplisit meminta dipastikan backend menerima `null`** — dan ternyata backend menerimanya, tetapi menyimpannya sebagai baris kosong alih-alih menolak atau menandainya.

Dua kemungkinan penyebab sisi sensor yang **harus dikonfirmasi dengan pengujian lapangan** (audit ini tidak dapat memutuskan dari database saja):
- Sensor mengembalikan `NaN` (DHT/DS18B20/MQ-135 tidak terbaca atau tidak terpasang saat perekaman 10:20–10:37 UTC), sehingga `addField()` menulis `null` sesuai desain; **atau**
- Alat menyala dalam kondisi sensor belum siap, dan tidak ada gerbang pemanasan (warm-up) MQ-135 — padahal itu butuh 24-48 jam.

Yang dapat saya pastikan: **`processChamber()` menyimpan `null` tanpa penolakan** (`iotProcessor.js:44-80`), dan itulah sebabnya database berisi 32 baris tanpa nilai.

### C.4 Skema database masih versi lama

Saya bandingkan skema nyata (dari OpenAPI PostgREST) dengan `supabase/schema.sql` dan `supabase/migration_prod.sql`:

| Kolom diperiksa | Status nyata | Seharusnya |
|---|---|---|
| `user.sekolah_id` | **ADA** | tidak ada (desain satu sekolah, bukan multi-tenant) |
| `waste_records.sekolah_id` | **ADA** | tidak ada |
| `sensor_readings.sekolah_id` | **ADA** | tidak ada |
| `menu_uploads.sekolah_id` | **ADA** | tidak ada |
| `sales_records.sekolah_id` | **ADA** | tidak ada |
| `ai_predictions.sekolah_id` | **ADA** | tidak ada |
| `maggot_batches.sekolah_id` | tidak ada | konsisten |
| `sensor_readings.suhu_substrat_c` | ADA | ADA ✅ (migration dijalankan) |
| `sensor_readings.batch_id` | ADA | ADA ✅ (migration dijalankan) |

**Tafsiran:** `migration_prod.sql` **sudah dijalankan** (kolom `suhu_substrat_c` dan `batch_id` ada), tetapi kolom warisan `sekolah_id` **tidak pernah dihapus**. Seluruh nilainya `null` di setiap baris yang diperiksa. Terkonfirmasi bahwa tidak ada isolasi per sekolah: **kolomnya ada tetapi kosong di semua tabel.**

Dampak: kolom mati yang tidak pernah diisi menimbulkan ambiguitas skema (pembaca skema berikutnya bisa menyangka sistem ini multi-tenant), dan query agregat yang menyertakan kolom ini membuang ruang tanpa manfaat.

### C.5 Fitur yang menganggur di database

| Tabel | Baris | Fitur terkait | Status |
|---|---:|---|---|
| `menu_uploads` | 0 | Input menu MBG (`admin-sekolah/menu`) | **belum ada data** |
| `maggot_harvests` | 0 | Panen maggot & `totalPanenMaggotKg` | **belum ada data** |
| `sales_records` | 0 | Penjualan maggot & pendapatan | **belum ada data** |
| `ai_predictions` | 0 | Penyimpanan hasil prediksi AI | **tidak pernah diisi kode mana pun** |

**Temuan tambahan:** tabel `ai_predictions` **tidak pernah ditulis oleh kode mana pun** (tidak ada `insert` ke tabel itu di `backend/src`). Tabel ini hanya bisa diisi manual. Prediksi AI yang ditampilkan dashboard dihitung ulang setiap permintaan (`aiService.js:21-63`), bukan dibaca dari tabel. Artinya klaim "prediksi AI tersimpan untuk analitik" **tidak didukung implementasi**.

Ini juga menjelaskan mengapa korelasi menu↔limbah tidak dapat bermakna: `getMenuCorrelation()` (`aiService.js:65-104`) membutuhkan pasangan tanggal antara `menu_uploads` dan `waste_records`, sedangkan `menu_uploads` kosong. **Korelasi menu tidak mungkin dihitung** dari data saat ini — ini perlu dinyatakan sebagai keterbatasan, bukan disajikan sebagai hasil.

### C.6 Cakupan data untuk kolom `n` pada Tabel 4

| Metrik | Nilai riil |
|---|---|
| Baris `waste_records` | 60 (**hanya 6 bernilai > 0**) |
| Hari unik dengan data limbah | **1 hari** (2026-09-19) |
| Baris `sensor_readings` | 32 (**0 nilai sensor**) |
| Hari unik dengan data sensor | **1 hari** |
| Hari dengan keduanya | 1 |
| Batch maggot | 1 |
| Panen maggot | **0** |
| Upload menu | **0** |
| Penjualan | **0** |
| Panjang observasi limbah | ±3 jam 57 menit (04:45–10:42 UTC) |
| Panjang observasi sensor | ±17 menit (10:20–10:37 UTC) |

Dokumen revisi meminta kolom `n` untuk setiap baris Tabel 4. **Jawabannya sekarang dapat diisi dengan angka jujur:** n=60 baris mentah / 6 baris bermakna, 1 hari, 1 batch, 0 panen, 0 menu. Ini jauh lebih baik daripada kekosongan, dan jauh lebih aman daripada mengarang.

---

## D. Temuan Terurut Prioritas

| # | Severity | Temuan | Bukti | Dampak | Rekomendasi | Effort | Prioritas |
|---|---|---|---|---|---|---|---|
| 1 | **Critical** | Tidak ada provenance data: baris hasil model mock dan hasil Roboflow tidak dapat dibedakan setelah tersimpan | Tidak ada kolom `sumber`/`is_simulated`/`model_versi` di `waste_records` (OpenAPI); `iotProcessor.js:29` menyimpan `hasil.deteksi` tanpa memeriksa `hasil.mode`; `roboflowService.js:136-137,162-163` mengembalikan mock saat key kosong **atau** API gagal | Seluruh angka turunan (KPI, ranking, CSV, Tabel 4) berpotensi tidak dapat diaudit; tidak ada cara memisahkan data nyata | Tambahkan kolom provenance + setel `mode` ke tiap baris; filter `is_simulated=false` di `get_public_kpi()` | S | **P0** |
| 2 | **Critical** | 90% baris limbah bernilai 0 kg, direkam sebagai hasil sah | 54 dari 60 baris `berat_kg=0`; `hitungProportion` mendistribusikan 0 kg ke 6 kategori (`roboflowService.js:40-60`) | KPI publik, ranking kategori, dan tren terdistorsi; nol tidak dapat dibedakan dari "tidak ada sisa" | Tolak sesi dengan `totalBeratKg ≤ 0` sebelum distribusi; jangan tulis baris bila tidak ada nilai valid | S | **P0** |
| 3 | **Critical** | 32 baris telemetri sensor tersimpan dengan **semua** kolom null | `sensor_readings` 32/32 null pada 5 kolom sensor; `iotProcessor.js:44-80` menyimpan tanpa validasi | Klaim monitoring real-time tanpa data pendukung; tabel tumbuh tanpa informasi | Validasi: tolak insert bila seluruh field sensor null; tandai `sensor_valid`/`sumber` | S | **P0** |
| 4 | **High** | Total data limbah 0,2 kg berada pada ambang deteksi sensor (0,02 kg/sesi) | Total 0,200 kg; `DUMP_DELTA_KG=0.02` (`smart_container_esp32cam.ino:53,705`) | Data tidak mewakili rentang pengukuran bermakna; tidak dapat menopang klaim volume/reduksi | Nyatakan sebagai keterbatasan; kalibrasi ulang load cell dengan massa acuan; catat rentang valid di paper | M | **P0 (paper)** |
| 5 | **High** | `maggot_harvests` = 0 baris padahal judul paper menjanjikan biomassa maggot | Inventaris tabel: `maggot_harvests` 0 baris; `get_public_kpi` `totalPanenMaggotKg`=0 | Janji judul & Tabel 2 tidak punya data | Isi data panen nyata, atau ubah judul/sesuaikan klaim (dokumen revisi sudah menawarkan opsi judul alternatif) | S (redaksional) / L (data) | **P0 (paper)** |
| 6 | **High** | Korelasi menu→limbah mustahil dihitung karena `menu_uploads` kosong | 0 baris `menu_uploads`; `aiService.js:65-104` butuh pasangan tanggal | Fitur unggulan "ranking menu tidak disukai untuk SPPG" tidak punya bahan | Isi data menu harian, atau nyatakan sebagai keterbatasan & pindahkan ke roadmap | S | **P0 (paper)** |
| 7 | **High** | `ai_predictions` tidak pernah ditulis kode mana pun | Tidak ada `insert` ke `ai_predictions` di `backend/src`; 0 baris | Klaim penyimpanan prediksi tidak didukung implementasi | Implementasikan persistensi atau hapus tabel & klaimnya | S | P1 |
| 8 | **High** | Kolom warisan `sekolah_id` masih ada di 6 tabel, seluruhnya null | OpenAPI: `users`, `waste_records`, `sensor_readings`, `menu_uploads`, `sales_records`, `ai_predictions`; `maggot_batches` tidak | Ambiguitas skema (menyiratkan multi-tenant yang tidak ada); ruang & kejelasan query | Migrasi hapus kolom (aditif-balik: bisa `add column` lagi bila diperlukan) | S | P1 |
| 9 | **Medium** | Faktor emisi `0,52` tanpa rujukan | `schema.sql:85`; KPI publik `penghematanEmisiCo2e`=0,104 | Angka lingkungan publik tidak dapat diverifikasi | Dokumentasikan sumber faktor atau tandai estimasi indikatif | S | P1 |
| 10 | **Medium** | Label minggu tanpa tahun | `iotProcessor.js:5-14` → `Minggu 38`; seluruh 60 baris berlabel `Minggu 38` | Agregasi tren akan menabrak tahun saat data melewati satu tahun | Ubah ke format menyertakan tahun (`2026-M38`) | S | P1 |
| 11 | **Medium** | `sekolah_id`/`batch_id` null di semua telemetri | 32/32 null | Atribusi data ke batch tidak mungkin | Perbaiki pengisian `batch_id` (kode sudah mencoba, `iotProcessor.js:55-64`) & uji | M | P2 |
| 12 | **Low** | Migrasi tidak berversi | `schema.sql` + `migration_prod.sql` dijalankan manual; tidak ada tabel `schema_migrations` | Sulit mengetahui versi skema aktif | Tambahkan tabel versi migrasi | S | P2 |

---

## E. Skor Kesiapan Data

| Dimensi | Skor | Dasar |
|---|---:|---|
| Kelengkapan data | **15/100** | 0 panen, 0 menu, 0 penjualan; telemetri 0% terisi |
| Kualitas nilai | **10/100** | 90% baris nol; total 0,2 kg di ambang deteksi |
| Provenance & auditability | **0/100** | Tidak ada kolom asal data sama sekali |
| Konsistensi skema | **55/100** | Kolom baru ada, kolom warisan belum dibersihkan |
| Reliabilitas akuisisi | **70/100** | Penjadwalan 30 detik terbukti tepat; insert berjalan andal |
| Kesiapannya untuk dikutip riset | **15/100** | Belum ada satu klaim kinerja yang dapat didukung dari database |
| **Total (rata-rata)** | **≈ 27/100** | **Belum layak untuk klaim kinerja; sebagian besar dapat diperbaiki cepat** |

---

## F. Yang Bisa dan Tidak Bisa Diklaim (panduan untuk paper manager)

**Boleh diklaim, karena terbukti dari audit ini:**
- Arsitektur end-to-end **berfungsi**: perangkat → MQTT → backend → database, dengan penjadwalan telemetri yang tepat (**p50 = 30,0 detik**, sesuai setelan 30 detik).
- Perangkat menulis ke database secara andal selama periode uji (32 insert berurutan tanpa celah jadwal).
- Skema database sudah dimigrasikan (kolom `suhu_substrat_c`, `batch_id` tersedia).

**Belum boleh diklaim (dan sebaiknya disebut sebagai keterbatasan):**
- "Akurasi deteksi 92%" — tidak ada log ground truth vs prediksi di sistem mana pun.
- "Latency <2 detik" — tidak ada instrumentasi durasi; `Date.now()` hanya dipakai untuk cache 30 detik (`mqtt.js:91,98`) dan health check.
- "Monitoring real-time" — 32 baris telemetri berisi nol nilai sensor.
- "Galat load cell <1%" — tidak ada prosedur kalibrasi terekam; data justru berada di ambang deteksi.
- "Reduksi volume 82% / WRI" — tidak ada data `W0`/`Wt` tersimpan; `maggot_harvests` kosong.
- "Analitik menu & persentase makanan terbuang" — `menu_uploads` kosong sehingga korelasi menu tidak dapat dihitung; klasifikasi multi-kelas **berjalan**, tetapi akurasinya belum pernah diukur.

**Perlu diputuskan bersama paper manager:** apakah submisi dilakukan dengan (a) klaim yang dihedge + seluruh angka kinerja ditandai belum terukur, atau (b) menunda submisi sampai minimal pengukuran latency dan akurasi per kelas tersedia. Audit ini menyediakan bahan untuk **kedua** jalur; keputusannya milik tim penulis.

---

## G. Rencana Perbaikan (urutan eksekusi)

| # | Tindakan | Menutup temuan | Risiko | Rollback |
|---|---|---|---|---|
| 1 | Migrasi **provenance**: `sumber`, `is_simulated`, `estimasi_mode`, `confidence_rata_rata`, `model_versi` + tabel `waste_records_kelas` | 1 | Rendah (aditif) | `drop column`/`drop table` |
| 2 | **Isolasi mode mock**: jangan tulis baris bila `mode==='mock'`; arahkan ke tabel/inbox simulasi terpisah | 1 | Rendah | Kembalikan guard |
| 3 | **Validasi nilai**: tolak sesi `totalBeratKg ≤ 0`; tolak insert bila seluruh field sensor null; tandai `sensor_valid` | 2, 3 | Sedang (bisa mengurangi baris) | Kembalikan validasi |
| 4 | **Filter KPI**: `get_public_kpi()` hanya menghitung `is_simulated=false` + `berat_kg > 0` | 2 | Rendah | `create or replace` versi lama |
| 5 | **Label minggu bertahun** (`2026-M38`) dengan migrasi data lama | 10 | Sedang (mengubah nilai) | Simpan `minggu` lama di kolom arsip |
| 6 | **Bersihkan `sekolah_id`** dari 6 tabel | 8 | Sedang (perubahan skema) | `add column` kembali |
| 7 | **Instrumentasi latency** berjenjang + NTP di firmware | klaim latency | Sedang (butuh deploy) | Flag konfigurasi |
| 8 | **Protokol & skrip akurasi per kelas** (confusion matrix, baseline mayoritas-kelas) | klaim akurasi 92% | Rendah (alat baru) | — |
| 9 | **Kalibrasi load cell terekam** (5 massa acuan × 5 ulangan) | 4, klaim galat <1% | Rendah | — |
| 10 | **Worksheet WRI/ERS** (W0, Wt, t, ulangan, basis basah/kering) | klaim WRI | Rendah | — |

Tindakan 1-4 menutup seluruh temuan **Critical** dan berbiaya rendah. Tindakan 5-6 adalah pembersihan skema. Tindakan 7-10 adalah pengadaan bukti untuk angka yang saat ini belum dapat dipertanggungjawabkan.

---

## H. Rekomendasi untuk Paper Manager

1. **Tabel 4 dapat dilengkapi kolom `n` sekarang**, dengan angka jujur dari audit ini: 60 baris mentah (6 bermakna), 1 hari observasi limbah, 32 baris telemetri (0 nilai), 1 batch, 0 panen, 0 menu. Isi lebih baik daripada kosong, dan konsisten dengan semangat revisi yang menuntut keterbukaan.
2. **Klaim "monitoring real-time" perlu dilunakkan atau diperbaiki lebih dulu.** Audit membuktikan jalur datanya hidup, tetapi belum ada satu nilai sensor tersimpan. Kalimat yang aman: sistem telemetri teruji menyimpan data secara berkala (terbukti p50 30 detik), **sedangkan validasi nilai sensor masih dalam perbaikan**.
3. **Klaim akurasi 92% tidak dapat dipertahankan tanpa pengukuran per kelas.** Bukan berarti sistemnya biner — sistem sudah multi-kelas (Roboflow mengembalikan kelas spesifik). Yang belum ada adalah metrik evaluasinya. Rekomendasi: ganti angka 92% tunggal dengan confusion matrix + akurasi per kelas, atau tandai eksplisit sebagai target.
4. **Judul memuat "Fertilizer and Maggot Biomass" sementara `maggot_harvests` kosong.** Ini risiko paling mudah diprediksi akan ditanyakan reviewer. Pilih: isi data karakterisasi, atau pakai judul alternatif yang sudah disiapkan dokumen revisi.
5. **Faktor emisi 0,52 kg CO2e/kg limbah** perlu sumber, karena angka ini tayang di dashboard publik.

---

*Laporan ini dihasilkan dari pembacaan langsung database produksi secara read-only. Tidak ada data yang diubah. Seluruh angka dapat direproduksi dengan menjalankan ulang `node tools/audit/01-audit-integritas-data.mjs` dan `node tools/audit/02-verifikasi-schema-dan-bukti.mjs`.*
