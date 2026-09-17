# Panduan Backend Developer — SPPG MBG

Dokumen ini menjelaskan status backend Express.js, seluruh route, integrasi MQTT + Supabase,
serta **checklist verifikasi** agar kamu tahu apa yang harus diperbarui dan mana yang sudah sesuai.

---

## 1. Arsitektur backend

```
backend/src/
├── index.js                   (bootstrap Express + start MQTT)
├── config/
│   ├── supabase.js            (client service-role; null jika env kosong)
│   ├── demoMode.js            (flag mode demo)
│   ├── maintenanceMode.js     (flag mode pemeliharaan in-memory)
│   └── mqtt.js                (broker MQTT + subscribe topic perangkat)
├── middleware/
│   ├── auth.js                (JWT Bearer)
│   ├── roleCheck.js           (filter role)
│   └── deviceAuth.js          (x-device-api-key ATAU JWT admin)
├── routes/
│   ├── auth.js, public.js, demo.js, reports.js
│   ├── adminSekolah.js        (monitoring, menu, prediksi, penjualan)
│   ├── maggotBatches.js       (CRUD batch + status-siklus + panen)
│   ├── dapurMbg.js            (korelasi-menu, efisiensi, analisis-sisa)
│   └── iot.js                 (REST fallback device + maintenance-mode)
├── services/
│   ├── aiService.js           (panggil AI lokal :8000)
│   ├── roboflowService.js     (deteksi foto → Roboflow/mock)
│   ├── sensorEvaluationService.js (ambang batas sensor → aman/rekomendasi)
│   └── iotProcessor.js        (logika simpan data, dipakai REST + MQTT)
└── data/demoData.js           (data contoh mode demo)
```

**Alur data:**
1. Perangkat ESP kirim via **MQTT** (utama) → `config/mqtt.js` subscribe → `iotProcessor`.
2. Atau ESP/REST fallback → `routes/iot.js` → `iotProcessor`.
3. `iotProcessor` memproses (Roboflow + evaluasi sensor) dan **simpan ke Supabase**.
4. Frontend membaca hasil dari Supabase lewat route REST yang ada.

---

## 2. Daftar endpoint (status: SUDAH)

| Method | Path | Keterangan |
|--------|------|------------|
| POST | `/api/auth/login` | Login JWT (demo atau Supabase) |
| GET | `/api/auth/demo-accounts` | Daftar akun demo |
| GET | `/api/public/kpi`, `/api/public/waste-by-category`, `/api/public/education` | Data publik |
| GET | `/api/admin-sekolah/monitoring` | Sensor terbaru + `aman`/`rekomendasi` |
| GET/POST | `/api/admin-sekolah/menu`, `/api/admin-sekolah/prediksi`, `/api/admin-sekolah/penjualan` | Menu, prediksi, penjualan |
| GET/POST | `/api/admin-sekolah/batches` | Daftar & tambah batch |
| GET | `/api/admin-sekolah/batches/status-siklus` | Umur hari, fase, `perluPesanTelurBaru` |
| PUT | `/api/admin-sekolah/batches/:id/panen` | Tandai selesai panen |
| GET | `/api/dapur-mbg/analisis-sisa` | Total kg + peringkat % (tanpa rekomendasi) |
| GET | `/api/dapur-mbg/korelasi-menu`, `/efisiensi` | SPPG |
| GET | `/api/reports/csv` | Download CSV |
| GET/POST | `/api/demo/status`, `/api/demo/toggle` | Kontrol mode demo (superadmin) |
| POST | `/api/iot/smart-container` | REST fallback: multipart foto + beratKg |
| POST | `/api/iot/maggot-chamber` | REST fallback: JSON telemetri |
| GET/POST | `/api/iot/maintenance-mode` | Mode pemeliharaan (juga publish MQTT retained) |
| GET | `/health` | Health check |

---

## 3. Transport MQTT (utama perangkat)

`config/mqtt.js` subscribe:
- `${PREFIX}/smart-container/meta` (JSON beratKg) → cache meta terakhir (TTL 30 detik)
- `${PREFIX}/smart-container/foto` (byte JPEG) → proses → publish ke `…/smart-container/result`
- `${PREFIX}/maggot-chamber` (JSON telemetri) → proses → publish ke `…/maggot-chamber/result`

Maintenance publish retained di `${PREFIX}/maintenance` (dibaca semua perangkat). Prefix default `mbg`.

> Jika `MQTT_URL` kosong → `startMqtt()` menonaktifkan MQTT dan perangkat memakai REST fallback.
> Jika broker mati, `mqtt` package auto-reconnect (reconnectPeriod 5 detik).

---

## 4. Yang harus dikembangkan / diperbarui berikutnya

1. **Uji produksi + harden auth.**
   - Di production, interface MQTT ke broker terkelola (EMQX/HiveMQ) dan bisa memakai TLS `mqtts://`.
   - `MQTT_USERNAME`/`MQTT_PASSWORD` harus diisi; hindari broker publik untuk data sekolah.
2. **Supabase migration.** `supabase/schema.sql` memakai `create table if not exists` — **membuat ulang tabel
   yang lama tidak otomatis** (mis. `maggot_batches` yang kolomnya sudah diganti `batch_kode`,
   `berat_telur_gram`, `biaya_beli`, `status`). Siapkan `ALTER TABLE` migrasi untuk project yang sudah ada:
   - tambah kolom `batch_kode`, `berat_telur_gram`, `biaya_beli`, `status`
   - aktifkan RLS + policy pada `maggot_batches`.
3. **Reliability sensor.** Pertimbangkan memory store/Redis untuk `maintenanceMode` agar berbagi
   state antar instance jika scale-out; saat ini in-memory (satu proses).
4. **Validasi input** — endpoint IoT sebisa mungkin divalidasi (angka, enumerasi kategori, TTL foto).
5. **Observer/perawatan:** status-siklus saat ini membaca 2 reading terakhir untuk deteksi “berat naik”.
   Kalau dirasa kurang akurat, pertimbangkan statistik window waktu (mis. 1 jam terakhir).

---

## 5. Variabel lingkungan

`.env` (root proyek, dibaca backend saat `npm run dev` di folder `backend`):

```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=ganti-dengan-secret-panjang
AI_SERVICE_URL=http://localhost:8000
DEMO_MODE=false
FRONTEND_ORIGIN=http://localhost:3000
DEVICE_API_KEY=sppg-mbg-iot-secure-key-2026
ROBOFLOW_API_KEY=
ROBOFLOW_MODEL=
ROBOFLOW_VERSION=1
MQTT_URL=mqtt://broker.emqx.io:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC_PREFIX=mbg
```

Salinan bersih di `backend/.env.example`.

---

## 6. Checklist verifikasi backend (coret jika sudah sesuai)

**A. Boot & health**
- [ ] `cd backend && npm install && npm run dev` jalan tanpa error.
- [ ] `curl localhost:4000/health` → `{"status":"ok",...}`.
- [ ] Log `MQTT terhubung ke …` muncul jika `MQTT_URL` terisi.

**B. Mode demo (DEMO_MODE=true)**
- [ ] `GET /api/dapur-mbg/analisis-sisa` → `{ totalSisaKg, peringkatSisa[] }` terurut menurun.
- [ ] `GET /api/admin-sekolah/batches/status-siklus` → punya `batchAktif`, `peringatan`, `semuaBatch`.
- [ ] `POST /api/admin-sekolah/batches` (body batchKode/tanggalMulai/beratTelurGram) → tersimpan/demo.

**C. REST IoT lossless**
- [ ] `POST /api/iot/maggot-chamber` suhu 28°C, amonia 10 → `{ aman:true, rekomendasi:null }`.
- [ ] `POST /api/iot/maggot-chamber` amonia 22 → `rekomendasi` berisi peringatan (aman:false).
- [ ] `POST /api/iot/smart-container` (multipart `foto` + `beratKg`) → `status:"sukses"` + `deteksi[]`.

**D. MQTT round-trip**
- [ ] Publikasikan `mbg/maggot-chamber` → terima balasan di `mbg/maggot-chamber/result`.
- [ ] Publikasikan `mbg/smart-container/meta` lalu `…/foto` → terima `…/smart-container/result`.
- [ ] `POST /api/iot/maintenance-mode { aktif:true }` → pesan retained muncul di subscriber `mbg/maintenance`.

**E. Supabase (mode nyata)**
- [ ] Tabel `maggot_batches` (kolom baru) + `sensor_readings` (sudah ada `suhu_substrat_c`, `batch_id`) ada.
- [ ] RLS aktif + policy `service role penuh akses` pada `maggot_batches`.
- [ ] Insert `waste_records` dari smart container berhasil (cek tanpa error) + bucket `menu-foto` ada.

---

## 7. Catatan penting

- `iotProcessor` adalah satu-satunya tempat logika simpan data; REST dan MQTT memanggil fungsi yang sama
  sehingga hasil konsisten.
- Sistem kini **single-instance sekolah** — tidak ada `sekolah_id` di skema, topic MQTT, maupun JWT.
  `req.user` hanya membawa `id`, `role`, dan `nama`.
- Endpoint IoT dilindungi `deviceAuth` (header `x-device-api-key` ATAU JWT admin).