# DEPLOY SEMUA — Langkah demi Langkah (Supabase → Backend → Frontend → IoT)

> Ikuti urutan ini. Jangan loncat — setiap langkah menjadi prasyarat langkah berikutnya.

---

## FASE 0 — Persiapan akun (10 menit)

| Akun | Untuk | Biaya |
|------|-------|-------|
| **GitHub** (`zahraraden1-droid` sudah ada) | hosting repo | gratis |
| **Supabase** (sudah ada `rwnabetybudpyxpnydid`) | database + storage | gratis (Free plan) |
| **Railway** | backend + ai-service + broker MQTT | free trial ~$5 |
| **Vercel** | frontend | gratuit gratis Hobby |
| **Roboflow** | deteksi foto sisa pangan | publik university/gratis |

Dari Supabase dashboard catat 3 nilai ini (masih akan dipakai di beberapa fase):
- Project URL: `https://rwnabetybudpyxpnydid.supabase.co` ✅ sudah
- `SUPABASE_ANON_KEY` (Settings → API → anon public)
- `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role)

---

## FASE 1 — Supabase (30 menit, sekali jalan)

1. Login https://supabase.com → project `rwnabetybudpyxpnydid`.
2. Menu **SQL Editor** → jalankan **berurutan** file dari repo `supabase/`:
   1. `schema.sql` — buat tabel (jalankan sekali; idempoten).
   2. `migration_prod.sql` — perketat RLS + index (aman diulang).
   3. `seed_prod_users.sql` — 3 akun awal.
3. Menu **Storage** → buat bucket `menu-foto` → Settings bucket → **Public bucket ON**.
4. Cek tabel: menu **Table Editor** → harus terlihat `users`, `maggot_batches`,
   `sensor_readings`, `waste_records`, dst.

**Hasil:** akun login awal:
```
superadmin@sekolah.id / SppgMbg@2026!
admin@sekolah.id     / SppgMbg@2026!
dapur@sekolah.id     / SppgMbg@2026!
```
> Ganti password segera setelah semua berjalan (hash bcrypt di tabel `users`).

**Verifikasi:** di SQL Editor jalankan `select * from users;` → 3 baris muncul, tanpa error RLS.

---

## FASE 2 — Push perubahan ke GitHub

Semua perubahan produksi ada di repo lokal, kirim ke GitHub:

```bash
cd "/home/nemesis/Documents/LOMBA/lomba sfft/Driven_MBG_Waste"
git add -A
git commit -m "chore: production setup (deploy, ai-service, hardening)"
git push origin main
```

Cek: https://github.com/zahraraden1-droid/Driven_MBG_Waste — `deploy/`, `ai_service/`, `docs/DEPLOY_PRODUCTION.md` terpush.

---

## FASE 3 — Deploy backend ke Railway (30-40 menit)

### 3.1 Buat project & 3 service

1. Login https://railway.app → **New Project** → **Deploy from GitHub repo** → pilih `Driven_MBG_Waste`.
2. Railway akan menskana dan menawarkan 3 service (pilih **Deploy** untuk ketiganya):
   | Service | Root | Build |
   |---------|------|-------|
   | `backend` | `backend/` | `backend/Dockerfile` |
   | `ai-service` | `ai_service/` | `ai_service/Dockerfile` |
   | `mosquitto` | `deploy/mosquitto/` | `deploy/mosquitto/Dockerfile` |
3. Pastikan di UI setiap service sudah:
   - Settings → **Root Directory** di-set ke folder tsb.
   - Deployments → **Build succeeded**, **Deploy succeeded**, status **Healthy**.

### 3.2 Isi Variables di service `backend`

Klik service **backend** → **Variables** → tambahkan:

```
NODE_ENV=production
SUPABASE_URL=https://rwnabetybudpyxpnydid.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<dari Supabase>
JWT_SECRET=<string acak min 32 char>
FRONTEND_ORIGIN=https://driven-mbg-waste.vercel.app
DEVICE_API_KEY=<kunci acak>
DEMO_MODE=false
AI_SERVICE_URL=https://aimbgcircular-b657.up.railway.app
MQTT_URL=mqtt://mbg_device:<MQTT_PASSWORD>@mosquitto.up.railway.app:1883
MQTT_USERNAME=mbg_device
MQTT_PASSWORD=<password MQTT acak>
MQTT_TOPIC_PREFIX=mbg
ROBOFLOW_API_KEY=<isi key>
ROBOFLOW_MODEL=<isi model id>
ROBOFLOW_VERSION=1
PORT=4000
```
Setelah simpan → tab **Deployments** → **Redeploy** (biar env terbaca).

> **Catatan URL service:** URL `.up.railway.app` yang baru muncul terlihat di **Settings → Networking** setiap service. Ganti `ai-service.up.railway.app` / `mosquitto.up.railway.app` sesuai punya kamu (format: `https://backend-xxxx.up.railway.app` dst). Untuk `MQTT_URL` pakai `mqtt://` (bukan `https://`).

### 3.3 Buka port publik

- Service **backend**: **Networking** → domain `https://backend-xxxx.up.railway.app` otomatis aktif → **Public Networking ON**.
- Service **ai-service**: Networking → Public Networking ON.
- Service **mosquitto**: Networking → **Public Networking ON** → pilih **TCP** → port `1883` → otomatis tersedia URL `tcp://mosquitto-xxxx.up.railway.app:1883`. (Juga dilakukan TCP `9001` bila mau WS.)

### 3.4 Verifikasi backdoor

```bash
curl https://backend-xxxx.up.railway.app/health
# → {"status":"ok","waktu":"..."}

curl https://backend-xxxx.up.railway.app/api/public/kpi
# → angka asli (bukan demo)
```

Jika gagal, lihat **Deployment Logs** service backend.

---

## FASE 4 — Deploy frontend ke Vercel (10 menit)

1. https://vercel.com → **Add New Project** → import GitHub `Driven_MBG_Waste`.
2. **Framework Preset**: Next.js (otomatis). **Root Directory**: `frontend/`.
3. **Environment Variables** (Build):
   ```
   NEXT_PUBLIC_API_URL=https://backend-xxxx.up.railway.app/api
   NEXT_PUBLIC_SUPABASE_URL=https://rwnabetybudpyxpnydid.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key dari Supabase>
   ```
4. **Deploy**. Berhasil → URL `https://driven-mbg-waste.vercel.app`.

> ⚠️ Ganti `backend-xxxx` dengan URL Railway service backend kamu. Jika tidak,
> halaman akan memunculkan fetch error / data kosong. Setelah ganti → **Redeploy** Vercel.

5. Kembali ke Railway service `backend` → Variables → cek `FRONTEND_ORIGIN` sudah
   `https://driven-mbg-waste.vercel.app` (bila Vercel memakai domain custom, gunakan domain itu). Redeploy backend.

---

## FASE 5 — Perangkat IoT (ESP)

Edit `firmware/smart_container_esp32cam/smart_container_esp32cam.ino` dan
`firmware/maggot_chamber_esp8266/maggot_chamber_esp8266.ino`:

```cpp
const char* WIFI_SSID = "NamaWiFi";          // WiFi lokasi
const char* WIFI_PASS = "PasswordWifi";
const char* MQTT_SERVER = "mosquitto-xxxx.up.railway.app";  // atau IP VPS
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "mbg_device";
const char* MQTT_PASS = "<password MQTT sama dengan Railway>";
const char* MQTT_PREFIX = "mbg";
```

Flash kedua board (Arduino IDE):
- ESP32-CAM: → selalu pastikan `esp_camera` inklusi benar; pakai Borard "AI Thinker ESP32-CAM".
- ESP8266: NodeMCU.

### Uji tanpa hardware
Install MQTT client di PC lalu publish seperti perangkat:
```bash
mosquitto_pub -h mosquitto-xxxx.up.railway.app -p 1883 -u mbg_device -P <pass> \
  -t "mbg/maggot-chamber" -m '{"suhuBilikC":29,"kelembabanPersen":65,"kadarAmoniaPpm":10,"suhuSubstratC":33}'
```
Backend akan membalas di topic `mbg/maggot-chamber/result` dan menyimpan di Supabase.

---

## FASE 6 — Verifikasi end-to-end (checklist)

- [ ] `https://driven-mbg-waste.vercel.app` terbuka, KPI angka asli.
- [ ] Login `superadmin@sekolah.id` berhasil (bukan demo).
- [ ] Dashboard admin → 5 sensor tampil (dari simulasi/ESP).
- [ ] Ranking sisa makanan menampilkan data dari Roboflow.
- [ ] Foto menu upload tampil (bucket `menu-foto` public).
- [ ] `https://backend-xxxx.up.railway.app/health` OK.
- [ ] `mosquitto_pub` round-trip terbalas di `.../result`.

---

## Troubleshooting cepat

| Gejala | Kemungkinan |
|--------|-------------|
| Frontend data kosong | `NEXT_PUBLIC_API_URL` salah / belum redeploy Vercel |
| Login gagal | FASE 1 belum lengkap; RLS menghalangi (cek supabase log di SQL editor) |
| ESP tidak konek | Port 1883 TCP belum dibuka di Networking; kredensial MQTT beda |
| Foto jadi `mode:"mock"` | `ROBOFLOW_API_KEY`/`ROBOFLOW_MODEL` kosong |
| KPI angka demo | `DEMO_MODE` masih `true` di Railway backend |
| MQTT connect fail di backend | `MQTT_URL`/credential salah; cek Deployment Logs backend |

---

## Selesai 🎉
Ketika semua checklist hijau, sistem siap pakai produksi.