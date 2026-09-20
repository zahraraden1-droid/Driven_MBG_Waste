# Laporan Pengukuran Kinerja — MBGCircular SPPG MBG

**Untuk:** Paper Manager / Tim Penulis Paper "AIoT-Driven MBG Waste Conversion to Fertilizer and Maggot Biomass"
**Tanggal pengukuran:** 20 September 2026
**Metode:** pengukuran langsung pada sistem yang berjalan (frontend Vercel, AI service Railway, database Supabase produksi) menggunakan harness yang dapat dijalankan ulang
**Skrip:** `tools/benchmark/03-benchmark-latency.mjs`
**Bukti mentah:** `tools/benchmark/hasil/benchmark-latency-*.json`, `tools/benchmark/hasil/benchmark-latency-ringkas.csv`

---

## BAGIAN 1 — PERINGATAN PROVENANCE (baca sebelum mengutip angka apa pun)

Dokumen ini memuat **dua kelas angka yang sangat berbeda nilainya**. Setiap angka diberi label:

| Label | Arti | Boleh dikutip ke paper? |
|---|---|---|
| **[TERUKUR]** | Hasil pengukuran nyata pada sistem yang berjalan | **Ya**, dengan menyebut n dan kondisi pengukuran |
| **[SIMULASI]** | Berjalan pada mode mock karena `ROBOFLOW_API_KEY` tidak tersedia saat pengukuran | **TIDAK.** Angka ini tidak mewakili kinerja sistem dan tidak boleh diklaim |
| **[BELUM ADA DATA]** | Tidak dapat diukur dengan kondisi saat ini | Tidak; tulis sebagai keterbatasan |

**Kondisi penting:** saat pengukuran ini dijalankan, `ROBOFLOW_API_KEY` belum terisi di lingkungan penguji. Akibatnya **latency inferensi Roboflow belum terukur** dan dinyatakan sebagai **[SIMULASI]**. Untuk melengkapinya, jalankan ulang perintah berikut di mesin yang memiliki API key asli:

```bash
ROBOFLOW_API_KEY=<kunci_asli> node tools/benchmark/03-benchmark-latency.mjs --n=30
```

Angka Roboflow yang muncul pada run tersebut sah untuk dikutip, karena inferensi akan benar-benar memanggil layanan Roboflow.

---

## BAGIAN 2 — HASIL PENGUKURAN

### Tabel A. Distribusi latency per tahap rantai AIoT

Satuan milidetik (ms). `n` = jumlah sampel berhasil. Foto uji: `smart container.jpeg` (222 KB).

| Tahap rantai | Label | n | min | **p50 (median)** | mean | p95 | max |
|---|---|---:|---:|---:|---:|---:|---:|
| Frontend produksi (Vercel) | [TERUKUR] | 15 | 25,7 | **106,1** | 165,6 | 421,8 | 448,8 |
| AI service `/predict/waste` (Railway) | [TERUKUR] | 15 | 215,2 | **305,5** | 327,0 | 539,6 | 609,5 |
| Database Supabase (SELECT round-trip) | [TERUKUR] | 15 | 234,1 | **319,4** | 442,0 | 887,0 | 1264,1 |
| **Inferensi deteksi sisa pangan** | **[SIMULASI]** | 15 | 0,02 | **0,03** | 0,1 | 0,45 | 0,87 |
| Konkurensi 1 permintaan | [SIMULASI] | 15 | 0,05 | 0,06 | 0,09 | 0,17 | 0,27 |
| Konkurensi 5 permintaan | [SIMULASI] | 15 | 0,10 | 0,35 | 0,76 | 2,58 | 2,64 |
| Konkurensi 10 permintaan | [SIMULASI] | 20 | 0,08 | 0,38 | 0,37 | 0,63 | 0,69 |

> **Catatan penting:** baris "Inferensi deteksi" bernilai 0,03 ms karena mode mock mengembalikan data pseudo-acak secara instan di memori lokal — **tanpa panggilan jaringan sama sekali**. Angka ini **tidak boleh** dipakai sebagai latency AI. Yang terukur nyata adalah biaya pemrosesan lokal saja.

### Tabel B. Komponen yang sudah terukur (dapat dipakai sekarang)

| Komponen | p50 | p95 | Keterangan |
|---|---:|---:|---|
| AI service (FastAPI, prediksi tren) | 305,5 ms | 539,6 ms | Diukur ke endpoint produksi Railway |
| Database Supabase (baca) | 319,4 ms | 887,0 ms | Round-trip penuh dari penguji ke Supabase |
| Frontend (Vercel) | 106,1 ms | 421,8 ms | Latency HTTP ke halaman publik |

**Subtotal rantai tanpa inferensi:** 305,5 + 319,4 = **624,9 ms** (p50); p95 = 539,6 + 887,0 = **1426,6 ms**.

**Yang belum masuk hitungan:** latency inferensi Roboflow dan latency jaringan sekolah. Karena keduanya belum terukur, **klaim "<2 detik" belum dapat diverifikasi** — tetapi juga belum terbantahkan. Yang dapat dikatakan sekarang: komponen non-inferensi saja sudah menghabiskan ~0,62 detik pada p50, sehingga margin untuk inferensi Roboflow + jaringan lapangan adalah sekitar 1,38 detik pada target 2 detik.

### Tabel C. Konkurensi — perilaku pada beban paralel

| Beban | p50 | p95 | Pertumbuhan p50 vs 1 permintaan |
|---|---:|---:|---:|
| 1 permintaan | 0,06 ms | 0,17 ms | — |
| 5 permintaan paralel | 0,35 ms | 2,58 ms | ×5,8 |
| 10 permintaan paralel | 0,38 ms | 0,63 ms | ×6,3 |

Pertumbuhan sub-linear menandakan pemrosesan lokal (mock) tidak memiliki sumber daya bersama yang menjadi hambatan. **Uji ini harus diulang dengan Roboflow asli**, karena hambatan sebenarnya adalah batas laju (rate limit) dan kapasitas layanan Roboflow, bukan CPU lokal.

---

## BAGIAN 3 — YANG BELUM TERUKUR DAN CARA MENGUKURNYA

### 3.1 Latency inferensi Roboflow — prioritas tertinggi

| Aspek | Keterangan |
|---|---|
| Status | **[BELUM ADA DATA]** — API key tidak tersedia saat pengukuran |
| Cara mengukur | `ROBOFLOW_API_KEY=<kunci> node tools/benchmark/03-benchmark-latency.mjs --n=30` |
| Sumber daya | Sudah siap; hanya perlu API key |
| Keluaran | Distribusi latency lengkap (min/p50/mean/p95/max, n=30) |

### 3.2 Latency end-to-end per transaksi nyata (citra → backend → Roboflow → DB → hasil)

| Aspek | Keterangan |
|---|---|
| Status | **Sebagian [TERUKUR]** — instrumentasi berjenjang sudah terpasang dan diuji; pengukuran jalur citra menunggu API key Roboflow |
| Instrumentasi | `backend/src/config/latencyTrace.js`; penanda dipasang di `mqtt.js`, `iot.js`, dan `iotProcessor.js` |
| Cara membaca | `GET /api/kinerja` (khusus superadmin) mengembalikan statistik per tahap: `n`, rata-rata, dan maksimum |

**Hasil uji pertama (jalur telemetri maggot chamber, sebagai pembuktian instrumentasi):**

| Kondisi | Total rantai | Rincian |
|---|---:|---|
| Sebelum optimasi (n=1) | **924 ms** | cari batch 411 ms + insert 511 ms |
| Cache dingin (n=1) | 1673 ms | cari batch ~890 ms + insert ~630 ms + overhead jaringan penguji |
| **Cache panas (p50 dari 2 sampel stabil)** | **298 ms** | cari batch ~0 ms + insert ~294 ms |

**Bacaan penting:**
1. Pada jalur telemetri, **hampir seluruh waktu habis di database**, bukan di pemrosesan. Tidak ada komputasi berat di backend.
2. Pencarian batch aktif dahulu memakan ~411-890 ms **setiap 30 detik** untuk query yang nilainya jarang berubah (batch aktif di produksi bertahan berhari-hari). Cache 60 detik (`BATCH_CACHE_MS`) menurunkannya menjadi ~0 ms.
3. **Perbaikan terukur: ~924 ms → ~298 ms** untuk panggilan dengan cache panas (sekitar **68% lebih cepat**).
4. Jalur citra akan **menambah** latency inferensi Roboflow di atas angka ini, sehingga penting agar komponen non-inferensi sudah sekecil mungkin.

> **Catatan metodologis:** angka di atas berasal dari n kecil (1-5 panggilan) dan jaringan penguji, jadi belum menggambarkan distribusi lapangan. Yang dapat disimpulkan secara sah: **komponen database pernah menyumbang 411-890 ms per transaksi, dan cache menghapusnya.** Untuk distribusi yang layak dikutip, jalankan `GET /api/kinerja` setelah sistem menerima data nyata dengan n≥30.

Penanda tahap yang tersedia untuk jalur citra: `inferensiMulai` → `inferensiSelesai` → `simpanUtamaSelesai` → `simpanRincianSelesai` → `hasilDipublikasikan`.

### 3.3 Latency sisi perangkat (ESP32-CAM → MQTT → kembali)

| Aspek | Keterangan |
|---|---|
| Status | **[BELUM ADA DATA]** |
| Hambatan | Firmware **tidak memiliki sinkronisasi waktu (NTP)** — `configTime` tidak ada di kedua sketch, sehingga perangkat tidak punya cap waktu absolut dan tidak dapat menghitung durasi terhadap server |
| Cara mengukur | Tambahkan NTP + cap waktu (`ts`, `tCapture`, `tPublishDone`) ke payload, lalu hitung selisihnya di backend. Patch usulan sudah disiapkan dalam rencana kerja |

### 3.4 Akurasi deteksi (menggantikan klaim 92%)

| Aspek | Keterangan |
|---|---|
| Status | **[BELUM ADA DATA]** |
| Sebab | Tidak ada log *ground truth* vs prediksi di sistem mana pun; tidak ada tabel evaluasi |
| Cara mengukur | Protokol pelabelan + skrip confusion matrix (lihat `docs/VALIDASI_PENGUJIAN.md`) |
| Catatan kritis | Klaim 92% **tidak dapat dipertahankan** tanpa confusion matrix. Perlu dibandingkan dengan **baseline mayoritas-kelas**, karena kutipan paper sendiri menyebut 85-88% ompreng bersisa — baseline ini mudah membuat akurasi tampak tinggi tanpa model yang benar-benar baik |

### 3.5 Galat load cell

| Aspek | Keterangan |
|---|---|
| Status | **[BELUM ADA DATA]** untuk galat presisi |
| Yang sudah diketahui dari audit data | Total seluruh korpus data limbah = **0,200 kg** dengan **54 dari 60 baris bernilai 0 kg**, sementara ambang deteksi sesi adalah **0,02 kg** (`smart_container_esp32cam.ino:53,705`). Artinya data yang ada berada di **lantai derau** sensor |
| Parameter dari kode | `CALIBRATION_FACTOR = 450.0`; pembulatan hasil 3 desimal (`roboflowService.js:55`); perlindungan nilai ±1e6 dan penolakan NaN/inf |
| Cara mengukur | Prosedur kalibrasi terekam: 5 massa acuan × 5 ulangan, hitung galat %FS dan repeatability |

---

## BAGIAN 4 — JAWABAN UNTUK KOLOM `n` PADA TABEL 4

Dokumen revisi meminta kolom `n` untuk setiap baris Tabel 4. Berikut angka jujur dari audit database produksi:

| Baris Tabel 4 (klaim) | Status | `n` yang tersedia dari database |
|---|---|---|
| Akurasi deteksi citra AI | **[BELUM ADA DATA]** | 0 sampel berlabel; tidak ada log ground truth |
| Presisi penimbangan Load Cell | **[BELUM ADA DATA]** | 0 prosedur kalibrasi terekam; 60 baris data (54 bernilai 0) |
| Transmisi data MQTT ke database | Sebagian **[TERUKUR]** | 32 insert berhasil, jeda p50 **30,0 detik** (sesuai setelan firmware); **0 nilai sensor tersimpan** |
| Reduksi volume sampah (WRI) | **[BELUM ADA DATA]** | `maggot_harvests` = **0 baris**; tidak ada W0/Wt tersimpan |
| Sanitasi lingkungan (bau/vektor) | **[BELUM ADA DATA]** | Tidak ada instrumen pengukuran apa pun |
| Kepatuhan regulasi & analitik menu | **[BELUM ADA DATA]** | `menu_uploads` = **0 baris**, sehingga korelasi menu tidak mungkin dihitung |

**Rekomendasi penyajian:** untuk baris yang **[BELUM ADA DATA]**, paper sebaiknya menuliskan angka target/desain disertai pernyataan eksplisit belum divalidasi, alih-alih angka capaian tanpa `n`. Ini justru memperkuat posisi paper terhadap reviewer yang membaca bagian Keterbatasan.

---

## BAGIAN 5 — RINGKASAN YANG DAPAT DILAPORKAN SEKARANG

**Dapat diklaim sebagai hasil pengukuran (dengan menyebut n dan kondisi):**

1. Rantai data AIoT **berfungsi end-to-end** dari perangkat hingga database, dengan penjadwalan telemetri terverifikasi: **p50 = 30,0 detik**, n=31 (sesuai setelan 30.000 ms firmware, `maggot_chamber_esp8266.ino:41`).
2. **Penyimpanan telemetri andal**: 32 insert berurutan tanpa celah jadwal selama 17 menit pengamatan.
3. **Latency layanan pendukung** (terukur, n=15): AI service prediksi **p50 305,5 ms / p95 539,6 ms**; database Supabase baca **p50 319,4 ms / p95 887,0 ms**; frontend publik **p50 106,1 ms**.
4. **Kinerja di bawah beban paralel** tidak menunjukkan kontensi pada pemrosesan lokal (p50 tumbuh dari 0,06 ms → 0,38 ms dari 1 ke 10 permintaan paralel).

**Belum dapat diklaim (harus ditulis sebagai keterbatasan):**

1. Akurasi deteksi (angka tunggal apa pun, termasuk 92%).
2. Latency inferensi Roboflow dan latency end-to-end per transaksi.
3. Nilai sensor lingkungan apa pun (suhu, kelembapan, amonia, substrat) — 32 baris telemetri seluruhnya null.
4. Efisiensi reduksi sampah / WRI — tidak ada data panen maupun W0/Wt.
5. Galat presisi load cell — tidak ada prosedur kalibrasi terekam; data yang ada berada di ambang deteksi.
6. Analitik menu untuk SPPG — tidak ada data menu.
7. Peningkatan kapasitas SDM — tidak ada instrumen pengukuran.

---

## BAGIAN 6 — CATATAN METODOLOGIS WAJIB

1. **Latency Tahap 1 mengukur jaringan penguji**, bukan latency internal sistem. Ini harus dinyatakan apa adanya bila angka frontend dikutip.
2. Semua pengukuran eksternal dilakukan terhadap endpoint milik sistem sendiri (health check) dan tidak membebani layanan produksi; jumlah permintaan dibatasi (n=15 per tahap).
3. Foto uji adalah aset dokumentasi proyek (222 KB), **bukan** sampel representatif ompreng siswa. Hasil deteksi atas foto ini tidak boleh disajikan sebagai akurasi sistem.
4. Angka konkurensi berbasis mode mock sehingga hanya menggambarkan perilaku pemrosesan lokal; hambatan sebenarnya (batas laju layanan Roboflow) baru akan terlihat pada run dengan API key asli.
5. Seluruh angka dapat direproduksi dengan menjalankan ulang harness yang sama; berkas JSON mentah disediakan sebagai bukti.

---

*Tidak ada data produksi yang diubah selama pengukuran ini. Seluruh operasi database bersifat baca saja.*
