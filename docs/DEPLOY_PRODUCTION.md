# Panduan Deploy PRODUCTION — SPPG MBG

Arsitektur produksi (opsi Railway):

```
Browser/Telepon
   │
   ▼ (HTTPS)
Frontend Next.js ──► Vercel (gratis)
   │
   ▼ (API via HTTPS)
Backend Express ──► Railway (long-running, selalu hidup)
   │      ▲
   │      │ MQTT
   ▼      │
Broker Mosquitto ◄── ESP32-CAM + ESP8266 (via MQTT/1883)
   │
   ▼
AI Service (FastAPI) — prediksi limbah & korelasi menu
   │
   ▼
Supabase (PostgreSQL + Storage menu-foto)
```

> **Kenapa backend tidak di Vercel?** Backend butuh proses yang selalu hidup
> untuk koneksi **MQTT persistent** (perangkat IoT) dan state `maintenanceMode`.
> Serverless Vercel mematikan proses setelah request — MQTT & mode pemeliharaan
> akan putus. Railway (atau VPS + Docker Compose) menjalankan proses terus-menerus.

Dua jalur deploy backend yang didukung:

| Jalur | Kapan dipakai |
|-------|---------------|
| **Railway** (3 service: backend, ai-service, mosquitto) | Tidak punya VPS, ingin cepat & otomatis HTTPS |
| **VPS + Docker Compose** (`deploy/docker-compose.prod.yml`) | Punya VPS, ingin broker di infrastruktur sendiri |

---

## 1. Prasyarat

| Kebutuhan | Status |
|-----------|--------|
| Akun Supabase (sudah terisi `rwnabetybudpyxpnydid`) | ✅ ada |
| Akun Railway | perlu (free credit $5) |
| Akun Vercel + repo GitHub | perlu |
| Roboflow API key + model | kamu isi sendiri |

---

## 2. Siapkan Supabase (sekali)

Jalankan di **SQL editor Supabase** secara berurutan:

1. `supabase/schema.sql` — buat tabel (jika belum pernah).
2. `supabase/migration_prod.sql` — perketat RLS + index (wajib, aman dijalankan ulang).
3. `supabase/seed_prod_users.sql` — akun superadmin/admin/dapur (sekali saja).

Pastikan Storage bucket `menu-foto` **Public ON** (Storage → menu-foto → Edit → Public bucket).

Akun default setelah seed: `superadmin@sekolah.id / SppgMbg@2026!` (dan `admin@sekolah.id`, `dapur@sekolah.id`). **Segera ganti setelah login pertama.**

---

## 3A. Deploy backend ke RAILWAY (jalur utama)

Buat 3 service dalam satu project Railway dari repo ini. Railway otomatis
mendeteksi Dockerfile di `backend/`, `ai_service/`, dan `deploy/mosquitto/`.

**Service 1 — `backend`** (root: `backend/`, Dockerfile ada)
   1. New Project → Deploy from GitHub → pilih repo.
   2. Railway mendeteksi `backend/Dockerfile` → build otomatis.
   3. Variables (Railway):
      ```
      PORT=4000
      NODE_ENV=production
      SUPABASE_URL=https://rwnabetybudpyxpnydid.supabase.co
      SUPABASE_SERVICE_ROLE_KEY=<dari Supabase>
      JWT_SECRET=<string acak panjang>
      FRONTEND_ORIGIN=https://driven-mbg-waste.vercel.app
      DEVICE_API_KEY=<kunci acak>
      DEMO_MODE=false
      AI_SERVICE_URL=https://aimbgcircular-b657.up.railway.app     # ganti <railway-app-url>
      MQTT_URL=mqtt://<mosquitto-service>.up.railway.app:1883
      MQTT_USERNAME=mbg_device
      MQTT_PASSWORD=<PasswordMQTT>
      MQTT_TOPIC_PREFIX=mbg
      ROBOFLOW_API_KEY=<isi>
      ROBOFLOW_MODEL=<isi>
      ROBOFLOW_VERSION=1
      ```
   4. Deployment → aktifkan `Network` (sticky) supaya MQTT tidak putus.

**Service 2 — `ai-service`** (root: `ai_service/`)
   - Variabel: tidak wajib; cukup `.env` default.

**Service 3 — `mosquitto`** (root: `deploy/mosquitto/`)
   - Membutuhkan `Dockerfile` untuk image `eclipse-mosquitto:2` +
     mount `mosquitto.conf` dan `passwd`. (File sudah disiapkan di repo, lihat catatan di bawah.)
   - Ekspos port `1883` ke publik: Settings → **TCP Proxy** ON (bukan HTTP).
     ESP akan konek ke `tcp://<mosquitto-service>.up.railway.app:1883`.

> **Catatan mosquitto di Railway:** skema network Railway berbeda dengan Docker Compose
> (volume/mount terbatas). Alternatif paling awet untuk kompetisi: pakai broker
> terkelola gratis **EMQX Cloud Serverless** atau **HiveMQ Cloud**, lalu isi
> `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` di service `backend`.
> Simulasi perangkat tanpa hardware: `mosquitto_pub` ke broker yang sama.

---

## 3B. Deploy backend ke VPS + Docker Compose (alternatif)

```bash
cd deploy
cp .env.prod.example .env     # bahan template
nano .env                     # isi: ROBFLOW key/model, FRONTEND_ORIGIN, dsb
./mosquitto/gen-passwd.sh     # generate file password broker
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps   # cek semua running
```

Periksa kesiapan:

```bash
curl http://localhost:4000/health
curl http://localhost:8000/health      # AI service
```

> `deploy/.env` sudah ada berisi nilai produksi yang aman (JWT/device key random).
> Tinggal isi `ROBOFLOW_API_KEY`, `ROBOFLOW_MODEL`, dan `FRONTEND_ORIGIN` dengan URL Vercel kamu.

### 4. Domain & HTTPS di VPS (Caddy)

- **Ada domain**: DNS A record → IP VPS, ganti `API_DOMAIN` di `deploy/Caddyfile`.
- **Tanpa domain**: set `API_DOMAIN = IP.IP.IP.IP.sslip.io`.

Firewall VPS buka: **80**, **443**, dan **1883** (MQTT untuk ESP).

> Di Railway, HTTPS otomatis disediakan untuk semua service (tidak perlu Caddy).

---

## 5. Deploy frontend ke Vercel

1. Push repo ke GitHub.
2. Import di Vercel → framework otomatis **Next.js**.
3. Set **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app/api   # atau IP VPS + Caddy
   NEXT_PUBLIC_SUPABASE_URL=https://rwnabetybudpyxpnydid.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key dari Supabase project>
   ```
4. Deploy. URL frontend jadi `https://driven-mbg-waste.vercel.app` (atau custom domain).

5. Kembali ke Railway service `backend`, set `FRONTEND_ORIGIN=https://driven-mbg-waste.vercel.app`,
   lalu redeploy.

---

## 6. Perangkat IoT (ESP)

Isi di kedua firmware (`firmware/*.ino`) sebelum flash:

| Konstanta | Nilai |
|-----------|-------|
| `WIFI_SSID` / `WIFI_PASS` | WiFi lokasi lomba/sekolah |
| `MQTT_SERVER` | alamat broker publik: IP VPS **atau** `<mosquitto>.up.railway.app` / EMQX |
| `MQTT_USER` / `MQTT_PASS` | cocokkan dengan `deploy/.env` / variabel Railway |
| `MQTT_PREFIX` | `mbg` |

Simulasi tanpa hardware: pakai MQTT client (`mosquitto_pub`) atau REST fallback.

---

## 7. Verifikasi end-to-end

- [ ] Login `superadmin@sekolah.id` → masuk dashboard.
- [ ] `GET /api/public/kpi` menampilkan angka asli (bukan data demo).
- [ ] `POST /api/iot/maggot-chamber` (JSON) → tersimpan ke Supabase + `aman:true`.
- [ ] Publish `mbg/maggot-chamber` via MQTT → balasan di `mbg/maggot-chamber/result`.
- [ ] Upload menu dengan foto → foto tampil (bucket public).
- [ ] `POST /api/iot/smart-container` (multipart) → `status:"sukses"`, deteksi Roboflow `mode:"roboflow"`.
- [ ] Download CSV tidak kosong.

---

## 8. Troubleshooting cepat

| Gejala | Cek |
|--------|-----|
| Login gagal di produksi | Jalankan `seed_prod_users.sql`; hash bcrypt benar |
| Frontend tak bisa fetch API | `FRONTEND_ORIGIN` di Railway/VPS harus = domain Vercel + redeploy |
| ESP tidak terhubung MQTT | TCP Proxy ON (Railway); firewall 1883 (VPS); kredensial MQTT sama |
| Foto Roboflow `mode:"mock"` | `ROBOFLOW_API_KEY`, `ROBOFLOW_MODEL` kosong/salah |
| Prediksi error | `AI_SERVICE_URL` harus alamat `ai-service` yang benar; cek log taxonomi service |
| Maintenance mode tidak berlaku | State in-memory; pastikan hanya 1 instance backend |
| Koneksi Supabase gagal | `SUPABASE_SERVICE_ROLE_KEY` (role: `service_role`) benar, bukan anon |

---

## 9. Keamanan akhir

- [ ] `JWT_SECRET` di Railway/VPS sudah random (bukan `fazil`/default).
- [ ] `DEVICE_API_KEY` kuat.
- [ ] `deploy/.env` dan `deploy/mosquitto/passwd` tidak pernah di-commit (sudah di `.gitignore`).
- [ ] Bucket `menu-foto` public hanya untuk gambar menu (data sensor tetap via API).
- [ ] Optional: pasang MQTT TLS (port 8883) bila lokasi lomba menggunakan jaringan publik.