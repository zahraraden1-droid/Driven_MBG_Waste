# Tools — Audit, Benchmark & Validasi

Perkakas pendukung untuk audit produksi, pengukuran kinerja, dan validasi data
MBGCircular. Semua skrip di sini **dapat dijalankan ulang** dan hasilnya dipakai
sebagai bukti pada dokumen di `docs/`.

## Prinsip

| Prinsip | Penerapan |
|---|---|
| **Read-only terhadap produksi** | Skrip audit hanya memakai `GET`/`SELECT`. Tidak ada `INSERT`/`UPDATE`/`DELETE` ke database produksi. |
| **Label provenance** | Setiap angka hasil diberi label `[TERUKUR]`, `[SIMULASI]`, atau `[BELUM ADA DATA]` agar tidak salah dikutip. |
| **Tidak menulis kredensial** | Kredensial dibaca dari `.env` (ter-gitignore) dan tidak pernah ikut ke berkas hasil. |
| **Hasil ter-gitignore** | Folder `hasil/` tidak di-commit karena memuat data produksi. |

## Struktur

```
tools/
├── audit/
│   ├── 01-audit-integritas-data.mjs      Audit read-only data produksi
│   ├── 02-verifikasi-schema-dan-bukti.mjs Verifikasi skema & kumpulkan bukti
│   └── hasil/                            (ter-gitignore)
├── benchmark/
│   ├── 03-benchmark-latency.mjs          Distribusi latency rantai AIoT
│   ├── 04-bandingkan-metode-berat.mjs    Perbandingan metode pembagian berat
│   └── hasil/                            (ter-gitignore)
└── validasi/
    └── hitung-akurasi.py                 Confusion matrix + baseline mayoritas
```

## Cara menjalankan

### 1. Audit integritas data (aman, non-invasif)

```bash
node tools/audit/01-audit-integritas-data.mjs
node tools/audit/02-verifikasi-schema-dan-bukti.mjs
```

Menghasilkan: inventaris tabel, deteksi pola data simulasi, statistik nilai
sensor, cakupan data, dan berkas CSV bukti.

Kredensial dibaca dari `.env` di root repo (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`). Bila tidak ada, skrip berhenti dengan pesan jelas.

### 2. Benchmark latency

```bash
# Tanpa API key: tahap inferensi ditandai [SIMULASI]
node tools/benchmark/03-benchmark-latency.mjs --n=20

# Dengan API key: inferensi terukur sungguhan [TERUKUR]
ROBOFLOW_API_KEY=<kunci> node tools/benchmark/03-benchmark-latency.mjs --n=30

# Rantai end-to-end lewat backend LOKAL (menulis ke DB yang dipakai backend itu)
E2E=1 node tools/benchmark/03-benchmark-latency.mjs --n=20
```

> **Perhatian pada `E2E=1`:** tahap ini memanggil endpoint `POST` yang **menulis**
> ke database yang dikonfigurasi backend lokal. Jalankan hanya terhadap database
> uji, bukan produksi.

Menghasilkan: distribusi `min/p50/mean/p95/max` beserta `n` untuk setiap tahap.

### 3. Perbandingan metode pembagian berat (offline)

```bash
node tools/benchmark/04-bandingkan-metode-berat.mjs
```

Memakai keluaran Roboflow **asli** di
`backend/test/fixtures/roboflow-predictions.json`. Membandingkan metode yang
berjalan sekarang (`luas_bbox_v1`) dengan usulan (`densitas_v2`), plus analisis
sensitivitas parameter.

Tidak memanggil API maupun database.

### 4. Akurasi per kelas (setelah data berlabel tersedia)

```bash
python3 tools/validasi/hitung-akurasi.py data-label.csv --keluaran hasil-akurasi.txt
```

Format CSV: kolom `kebenaran` dan `prediksi`. Menghitung confusion matrix,
precision, recall, F1, macro-F1, **dan baseline mayoritas-kelas** — yang terakhir
wajib agar angka akurasi tidak menyesatkan. Lihat protokol lengkapnya di
`docs/VALIDASI_PENGUJIAN.md`.

## Dokumen yang memakai hasil skrip ini

| Dokumen | Skrip terkait |
|---|---|
| `docs/AUDIT_INTEGRITAS_DATA.md` | 01, 02 |
| `docs/LAPORAN_PENGUKURAN_PAPER.md` | 03 |
| `docs/WEIGHT_ESTIMATION_DESIGN.md` | 04 |
| `docs/VALIDASI_PENGUJIAN.md` | hitung-akurasi.py |
| `docs/AUDIT_PRODUCTION_READINESS.md` | 01, 02, 03, 04 |

## Menjalankan test backend

```bash
cd backend && npm test
```

16 test mencakup: perilaku rumus pembagian berat (mengunci metode lama agar tidak
berubah diam-diam), label minggu ISO bertahun, dan validasi payload telemetri.
