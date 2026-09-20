# SPPG MBG — MBGCircular

Sistem pengelolaan limbah pangan sekolah dan budidaya maggot BSF (Black Soldier Fly)
berbasis AIoT. Menggabungkan deteksi visual sisa makanan, telemetri bobot dan sensor
lingkungan, serta biokonversi maggot dalam satu alur data.

## Arsitektur

```
ESP32-CAM (kamera + load cell)  ─┐
                                 ├─ MQTT ─► Mosquitto ─► Backend Express ─► Roboflow (inferensi)
ESP8266 (DHT/DS18B20/MQ-135)   ─┘                            │
                                                             ├─► Supabase (PostgreSQL + Storage)
                                                             └─► AI Service FastAPI (prediksi tren)

Frontend Next.js (Vercel) ──REST──► Backend         Dashboard publik ──REST──► Backend
```

| Komponen | Teknologi | Lokasi produksi |
|---|---|---|
| Frontend | Next.js 14 App Router, Tailwind, Recharts | Vercel |
| Backend | Express.js (Node 22) | Railway |
| AI Service | FastAPI (prediksi tren & korelasi menu) | Railway |
| Inferensi visual | Roboflow (dijalankan **di server**, bukan on-device) | Roboflow cloud |
| Database | Supabase (PostgreSQL + Storage) | Supabase |
| Broker MQTT | Mosquitto 2 | Railway |
| Perangkat | ESP32-CAM, ESP8266 | Lapangan |

> **Catatan:** ThingsBoard **tidak dipakai** pada sistem ini. Fungsinya (monitoring
> perangkat, telemetri, status online, kontrol) diimplementasikan sendiri melalui
> `backend/src/config/deviceRegistry.js`. Dashboard **Next.js** adalah satu-satunya
> antarmuka, bukan ThingsBoard.
>
> Sistem ini dirancang untuk **satu sekolah**, bukan multi-tenant.

> **Diagram lengkap** (koneksi, protokol, dan payload tiap hop) ada di
> `docs/FLOWCHART_ARSITEKTUR_AIOT.md` beserta berkas SVG/PNG-nya.

## Struktur folder

```
backend/     Express API, autentikasi, MQTT, pemanggilan Roboflow & AI service
frontend/    Next.js App Router (submodule git terpisah)
ai_service/  FastAPI: prediksi volume limbah & korelasi menu
firmware/    Sketch ESP32-CAM & ESP8266 + dokumentasi wiring
supabase/    schema.sql, migrasi (migrations/), dan seed
deploy/      Docker Compose, Caddy, konfigurasi Mosquitto (jalur VPS)
docs/        Dokumentasi teknis, laporan audit, dan draf paper
docs/assets/ Foto dokumentasi perangkat
tools/       Skrip audit, benchmark, dan validasi
```

## Role pengguna

| Role | Akses |
|---|---|
| `superadmin` | Seluruh dashboard, kontrol mode demo |
| `admin_sekolah` | Monitoring bilik maggot, input menu, batch maggot, penjualan, perangkat IoT |
| `dapur_mbg` | Korelasi menu, efisiensi limbah, pelaporan |

## Menjalankan secara lokal

### Backend

```bash
cd backend
cp .env.example .env      # lalu isi nilainya
npm install
npm run dev
```

Variabel wajib: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`,
`DEVICE_API_KEY`. Variabel lain beserta penjelasannya ada di `backend/.env.example`.

**Lokasi berkas `.env`.** Backend memuat variabel dari dua lokasi, dengan
prioritas berikut (yang pertama menang):

1. Variabel lingkungan proses (mis. diset oleh Railway) — tidak pernah ditimpa
2. `backend/.env` — khusus backend
3. `.env` di **akar repositori** — lokasi konfigurasi proyek ini

Saat start, backend mencetak ringkasan aman (daftar kunci yang terisi, **tanpa
nilainya**):

```
[env] berkas dimuat: ../.env (akar repo)
[env] variabel belum diatur: ROBOFLOW_API_KEY
```

Bila muncul `TIDAK ada berkas .env yang terbaca`, konfigurasi tidak termuat —
dashboard akan menampilkan data contoh tanpa kredensial Supabase.

**Endpoint kesehatan.**

| Endpoint | Fungsi |
|---|---|
| `GET /health` | Liveness — proses hidup. Tidak memeriksa dependensi |
| `GET /health/ready` | Readiness — status Supabase, MQTT, **dan kesegaran data**. 503 bila database tidak dapat dipakai |


### Frontend

```bash
cd frontend
npm install
npm run dev
```

Buat `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> Frontend adalah **git submodule** (repo terpisah). Clone dengan
> `git clone --recursive`, atau jalankan `git submodule update --init --recursive`.

### Firmware

Kredensial WiFi dan MQTT **tidak** disimpan di repositori. Salin template lalu isi:

```bash
./firmware/siapkan-secrets.sh
# lalu isi nilai sebenarnya di firmware/<folder-sketch>/secrets.h
```

Setiap sketch membaca `secrets.h` dari folder sketch-nya sendiri, sehingga sketch
tetap dapat dikompilasi sendirian di Arduino IDE. File `secrets.h` ter-gitignore.

### Test

```bash
cd backend && npm test
```

## Setup database Supabase

Jalankan **secara berurutan** di SQL Editor Supabase:

1. `supabase/schema.sql` — membuat tabel (bila belum ada).

   > Perhatian: `schema.sql` adalah skema versi lama (masih memuat `sekolah_id`).
   > Untuk instalasi baru, gunakan `schema.sql` lalu lanjutkan ke migrasi.
2. `supabase/migrations/20260920_provenance.sql` — **wajib**: menambahkan
   provenance data, tabel `waste_record_kelas` dan `food_density`, serta
   memperbarui `get_public_kpi()` agar mengecualikan data simulasi.

   Rollback tersedia di `supabase/migrations/rollback/`.
3. `supabase/seed_prod_users.sql` — akun awal (superadmin, admin_sekolah, dapur_mbg).

   > **Keamanan:** kata sandi awal pada berkas seed sudah dipublikasikan di repositori
   > ini dan harus dianggap **bocor**. Ganti seluruh kata sandi akun sebelum sistem
   > menyimpan data nyata.
4. Buat bucket Storage `menu-foto` untuk foto menu MBG.

## Mode demo

`DEMO_MODE=true` membuat endpoint mengembalikan data contoh dan tidak memanggil
layanan eksternal. Superadmin dapat menyalakannya dari navbar
(`POST /api/demo/toggle`).

Hasil inferensi yang berasal dari mode mock (`mode: 'mock'`) **tidak disimpan** ke
tabel produksi secara default (`MOCK_ALLOW_PERSIST=false`), agar data simulasi tidak
tercampur dengan data nyata.

## Perkakas audit & pengukuran

```bash
# Audit integritas data (read-only)
node tools/audit/01-audit-integritas-data.mjs

# Benchmark latency rantai AIoT
ROBOFLOW_API_KEY=<kunci> node tools/benchmark/03-benchmark-latency.mjs --n=30

# Perbandingan metode pembagian berat (offline)
node tools/benchmark/04-bandingkan-metode-berat.mjs

# Akurasi deteksi per kelas
python3 tools/validasi/hitung-akurasi.py data-label.csv
```

Lihat `tools/README.md` untuk penjelasan lengkap.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| `docs/FLOWCHART_ARSITEKTUR_AIOT.md` | **Flowchart arsitektur AIoT**: koneksi antar komponen, protokol & port, payload tiap hop (diagram SVG/PNG/Mermaid) |
| `docs/AUDIT_PRODUCTION_READINESS.md` | Audit kesiapan produksi: temuan per layer, skor, roadmap 30/60/90 hari |
| `docs/AUDIT_INTEGRITAS_DATA.md` | Audit data produksi: kualitas, provenance, cakupan |
| `docs/paper/PAPER_MBGCircular_LENGKAP.md` | **Dokumen paper lengkap**: naskah (Bagian I), laporan audit (Bagian II), daftar perbaikan (Bagian III) |
| `docs/LAPORAN_PENGUKURAN_PAPER.md` | Hasil pengukuran latency (untuk paper) |
| `docs/VALIDASI_PENGUJIAN.md` | Protokol validasi akurasi, kalibrasi load cell, worksheet WRI |
| `docs/WEIGHT_ESTIMATION_DESIGN.md` | Desain estimasi berat berbasis citra |
| `docs/PUBLIC_DASHBOARD_PLAN.md` | Rencana dashboard publik & operasional |
| `docs/DEPLOY_PRODUCTION.md` | Panduan deploy produksi |
| `firmware/WIRING_PINOUT.md` | Pinout dan skema topik MQTT |

## Kontribusi

- Jalankan `npm test` sebelum mengirim perubahan.
- **Jangan pernah** menuliskan kredensial di berkas yang di-commit. CI akan
  menolak commit yang memuat nilai kredensial yang pernah bocor.
- Perubahan skema database harus disertai berkas migrasi + rollback di
  `supabase/migrations/`.
