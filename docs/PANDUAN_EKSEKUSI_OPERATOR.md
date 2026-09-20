# Panduan Eksekusi — Langkah yang Diperlukan dari Operator

**Tujuan dokumen ini:** seluruh pekerjaan kode sudah selesai dan terverifikasi, tetapi
**belum berdampak di produksi** karena memerlukan tindakan operator. Dokumen ini
mengumpulkan seluruh langkah tersebut di satu tempat, berurutan, beserta cara
memverifikasi dan cara membatalkannya.

**Status saat dokumen ini dibuat:** 102 test backend + 9 test AI lulus · lint 0 error ·
4 migrasi lolos pemeriksa · frontend build sukses · kredensial bersih di repo.

---

## Ringkasan: apa yang harus dilakukan

| # | Tindakan | Dampak bila dilewati | Perkiraan waktu |
|---|---|---|---|
| 1 | Jalankan 4 migrasi database | Seluruh perbaikan data tidak berdampak; backend produksi akan **menolak start** | 15 menit |
| 2 | Set variabel lingkungan backend + frontend | CORS memblokir frontend; IoT fail-closed menolak perangkat | 10 menit |
| 3 | Commit & push perubahan frontend (submodule) | Vercel **masih menjalankan versi rentan**; 4 halaman publik baru tidak tayang | 10 menit |
| 4 | Rotasi kredensial yang bocor | Siapa pun pemegang kredensial lama dapat mengendalikan perangkat | 1-2 jam (+reflash) |
| 5 | ACL + TLS broker MQTT | Telemetri & kredensial melintas terbuka; satu perangkat dapat mengendalikan semua | 2-4 jam |
| 6 | Isi `AI_INTERNAL_KEY` | AI service tetap terbuka (peringatan muncul di log) | 5 menit |

**Penting — urutan wajib:** langkah 1 **sebelum** langkah 2. Backend versi baru
menjalankan pemeriksaan skema saat start dan akan berhenti bila migrasi belum
dijalankan (`SKEMA_ENFORCE`/`NODE_ENV=production`). Ini disengaja agar kegagalan
terjadi di awal, bukan setelah data hilang sebagian.

---

## Langkah 1 — Jalankan migrasi database

Buka **SQL Editor Supabase** dan jalankan **berurutan**:

1. `supabase/migrations/20260919_bootstrap_versi.sql` — tabel `schema_migrations`
2. `supabase/migrations/20260920_provenance.sql` — kolom provenance, `food_density`, `waste_record_kelas`, filter KPI
3. `supabase/migrations/20260921_agregasi_dan_state.sql` — fungsi agregasi publik, tabel `system_state`
4. `supabase/migrations/20260922_audit_log.sql` — tabel jejak audit

Semuanya **idempoten** (aman dijalankan berulang) dan **aditif** (tidak menghapus data).

### Verifikasi

```sql
-- Semua migrasi tercatat
select versi, keterangan from schema_migrations order by versi;

-- KPI publik kini memuat cakupan data
select get_public_kpi();

-- Fungsi agregasi tersedia
select * from get_public_waste_by_category();
select * from get_public_peringkat_kategori();
select get_public_kualitas_data();

-- Tabel baru ada
select to_regclass('public.system_state');
select to_regclass('public.audit_log');
select to_regclass('public.food_density');
```

### Membatalkan (rollback)

Setiap migrasi memiliki pasangannya di `supabase/migrations/rollback/`.

> **PERINGATAN:** rollback `20260920` **menghapus kolom provenance**, sehingga data
> simulasi kembali tidak dapat dipisahkan. Rollback `20260922` **menghapus seluruh
> jejak audit**. **Ekspor tabel `audit_log` lebih dulu** (Download CSV) sebelum
> menjalankan rollback `20260922`.

---

## Langkah 2 — Variabel lingkungan

### Backend (Railway → Variables)

Wajib diisi/diperiksa:

```
NODE_ENV=production
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
JWT_SECRET=<string acak ≥ 32 byte — BUKAN "fazil">
DEVICE_API_KEY=<kunci acak KUAT — ganti dari nilai lama>
FRONTEND_ORIGIN=https://<domain-vercel-anda>
AI_SERVICE_URL=https://<ai-service>.up.railway.app
AI_INTERNAL_KEY=<string acak — HARUS SAMA dengan di AI service>
MQTT_URL=mqtt://<broker>:1883
MQTT_USERNAME=<user>
MQTT_PASSWORD=<password>
MQTT_TOPIC_PREFIX=mbg
ROBOFLOW_API_KEY=<kunci asli>
ROBOFLOW_WORKFLOW_ID=<workflow id>
DEMO_MODE=false
```

Parameter baru yang mengubah perilaku (nilai default sudah aman, boleh dikosongkan):

```
# Skema perhitungan berat: luas_bbox_v1 (perilaku lama) | densitas_v2
SKEMA_BERAT=luas_bbox_v1
CONFIDENCE_THRESHOLD=0.4

# Hasil mode mock JANGAN disimpan ke tabel produksi
MOCK_ALLOW_PERSIST=false

# Batas laju
RATE_LIMIT_BERAT=20
RATE_LIMIT_PERANGKAT=30

# Cache batch aktif (ms) — menurunkan latency telemetri ~924 ms -> ~298 ms
BATCH_CACHE_MS=60000

# Batas baris ekspor CSV
CSV_MAKS_BARIS=50000
```

> **PENTING — `FRONTEND_ORIGIN`.** Pola wildcard `*.vercel.app` sudah **dihapus**.
> Hanya origin yang terdaftar di `FRONTEND_ORIGIN` atau `ALLOWED_EXTRA_ORIGINS`
> yang diizinkan. Bila nilainya salah, frontend akan diblokir CORS.
> Domain preview Vercel yang berubah-ubah dapat ditambahkan ke `ALLOWED_EXTRA_ORIGINS`.

### AI service (Railway → Variables)

```
AI_INTERNAL_KEY=<string acak — SAMA dengan backend>
AI_REQUIRE_AUTH=true
```

> **Urutan aman:** set `AI_INTERNAL_KEY` di **kedua** layanan lebih dulu, baru set
> `AI_REQUIRE_AUTH=true`. Selama `AI_REQUIRE_AUTH` belum `true`, AI service tetap
> melayani tanpa kunci (mode transisi) dan mencatat peringatan keamanan di log.

### Frontend (Vercel → Environment Variables)

```
NEXT_PUBLIC_API_URL=https://<backend>/api
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

### Verifikasi

```bash
curl -s https://<backend>/health          # {"status":"ok",...}
curl -s https://<backend>/health/ready    # status: ready | degraded | not-ready
```

Perhatikan log backend saat start:

```
[env] berkas dimuat: ../.env (akar repo)
[skema] OK: kolom provenance dan tabel pendukung tersedia.
{"pesan":"server berjalan",...}
```

Bila muncul `[skema] MASALAH SKEMA TERDETEKSI`, **Langkah 1 belum dijalankan**.

---

## Langkah 3 — Commit & push frontend (submodule)

`frontend` adalah **git submodule** ke repositori terpisah. Perubahan berikut berada di
sana dan **belum di-commit**, sehingga Vercel masih menjalankan versi lama:

- Upgrade `next` 14.2.5 → **15.5.24** + React 19 (menutup **1 critical + 2 high**)
- 4 halaman publik baru: `/publik/peringkat`, `/publik/transparansi`, `/publik/status`, `/publik/privasi`
- `ErrorNotice`, `useMuatBanyak`, perbaikan `MaintenanceModeToggle`, `error.js`, `loading.js`

```bash
cd frontend
git status
git add -A
git commit -m "keamanan: naikkan next ke 15.5.24 + React 19; tambah halaman publik & penanganan galat"
git push origin main
```

Lalu di repo induk:

```bash
cd ..
git add frontend
git commit -m "chore: perbarui submodule frontend (next 15.5.24, halaman publik, penanganan galat)"
git push
```

### Verifikasi

Buka `<domain-vercel>/publik/status` — halaman baru harus tampil.
Jalankan `npm audit` di folder `frontend` — **critical harus 0**.

---

## Langkah 4 — Rotasi kredensial yang bocor (Critical)

Kredensial berikut **pernah tercatat di source code, dokumentasi, dan riwayat git**,
sehingga harus dianggap **bocor**. Membersihkan dokumen **tidak** menghapus kebocoran.

| Kredensial | Di mana pernah muncul | Tindakan |
|---|---|---|
| Kata sandi WiFi lokasi | Sketch firmware lama | Ganti kata sandi WiFi; perbarui `firmware/*/secrets.h`; **reflash** |
| Kata sandi MQTT | Sketch firmware, `WIRING_PINOUT.md`, catatan env manual (sudah dihapus) | Ganti di broker + `deploy/.env` + Railway + `secrets.h`; **reflash** |
| `DEVICE_API_KEY` | `backend/.env.example`, dokumentasi | Ganti di Railway + `secrets.h`; **reflash** |
| Kata sandi akun produksi | `seed_prod_users.sql`, `docs/DEPLOY_*.md` | Ganti kata sandi 3 akun |
| `JWT_SECRET` | Pernah bernilai lemah (`fazil`) | Pastikan acak ≥ 32 byte; menggantinya **mencabut semua token aktif** |

### Prosedur aman

1. **Buat nilai baru** untuk semuanya (acak, ≥ 32 byte). Simpan di pengelola kata sandi.
2. **Ganti di broker & backend lebih dulu**, verifikasi sistem masih berjalan.
3. **Reflash perangkat** dengan `secrets.h` yang baru. Lakukan satu perangkat lebih
   dulu, pastikan muncul di dashboard, baru lanjutkan yang lain.
4. **Ganti kata sandi akun** lewat SQL (hash bcrypt) atau endpoint yang tersedia.
5. **Jangan** menuliskan nilai baru di dokumen yang di-commit.

### Verifikasi

```sql
select nama, email, role from users;
-- pastikan hash berubah
```

```bash
# perangkat harus tetap terhubung setelah reflash
# buka /admin-sekolah/perangkat → status Online
```

> **BLOKIR OPERASIONAL:** tidak ada OTA pada firmware. Setiap rotasi kredensial
> memerlukan akses fisik ke setiap unit. Karena itu **OTA adalah prasyarat** untuk
> pengelolaan kredensial berkelanjutan, dan tercatat sebagai item roadmap 60 hari.

---

## Langkah 5 — ACL dan TLS broker MQTT (Critical)

**Kondisi saat ini:** broker memakai autentikasi kata sandi, tetapi **tanpa `acl_file`**
dan **tanpa TLS**. Akibatnya satu kredensial `mbg_device` dapat:
- mengakses topik perintah **semua** perangkat;
- memicu `reboot`, mengubah `set_scale_factor` (memanipulasi berat panen), dan
  mengubah `set_r0` (memanipulasi alarm amonia);
- menyadap telemetri dan foto karena lalu lintas tidak terenkripsi.

### Tindakan

1. Buat **satu user MQTT per perangkat** (mis. `mbg_container_01`, `mbg_chamber_01`).
2. Buat `acl_file` yang membatasi tiap user hanya pada topiknya sendiri:

```
# contoh struktur — sesuaikan nama topik
user mbg_container_01
topic readwrite mbg/smart-container/#
topic read mbg/maintenance

user mbg_chamber_01
topic readwrite mbg/maggot-chamber/#
topic read mbg/maintenance

# backend boleh membaca semua dan menulis ke topik perintah
user mbg_backend
topic readwrite mbg/#
```

3. Aktifkan TLS pada port **8883** dengan sertifikat yang sah; matikan listener
   plaintext 1883 setelah semua perangkat pindah.
4. Firmware perlu diubah memakai `WiFiClientSecure` + CA ter-pin, lalu **di-reflash**.

### Verifikasi

```bash
# kredensial lama harus DITOLAK
mosquitto_pub -h <broker> -p 8883 --cafile ca.pem \
  -u mbg_device -P '<password_lama>' -t mbg/smart-container/cmd -m '{"cmd":"status"}'
# harapkan: Connection Refused / not authorised

# kredensial perangkat hanya boleh topiknya sendiri
mosquitto_pub -h <broker> -p 8883 --cafile ca.pem \
  -u mbg_chamber_01 -P '<password>' -t mbg/smart-container/cmd -m '{}'
# harapkan: ditolak ACL
```

---

## Langkah 6 — Verifikasi akhir menyeluruh

```bash
# 1) Backend sehat dan dependensi terhubung
curl -s https://<backend>/health/ready | jq

# 2) Tidak ada lagi data simulasi masuk
curl -s https://<backend>/api/public/kualitas-data | jq
#    'adaDataSimulasi' dan 'jumlahBarisSimulasi' harus terlihat jelas

# 3) Ekspor CSV menghormati filter periode
curl -s "https://<backend>/api/reports/csv?dari=2026-09-01&sampai=2026-09-30" \
  -H "Authorization: Bearer <token>" | head -3

# 4) Jejak audit aktif (setelah ada tindakan operator)
curl -s https://<backend>/api/audit -H "Authorization: Bearer <token_superadmin>" | jq

# 5) Statistik latency
curl -s https://<backend>/api/kinerja -H "Authorization: Bearer <token_superadmin>" | jq
```

---

## Daftar centang

- [ ] 4 migrasi dijalankan & tercatat di `schema_migrations`
- [ ] `get_public_kpi()` memuat `cakupanData`
- [ ] Backend start tanpa peringatan skema
- [ ] `FRONTEND_ORIGIN` benar; frontend dapat memanggil API
- [ ] `DEVICE_API_KEY` baru; perangkat tetap terhubung
- [ ] `AI_INTERNAL_KEY` sama di backend & AI service; `AI_REQUIRE_AUTH=true`
- [ ] Frontend di-commit & di-push; `npm audit` critical = 0
- [ ] Halaman `/publik/status` tayang
- [ ] Kata sandi WiFi, MQTT, device key, dan 3 akun sudah dirotasi
- [ ] `acl_file` aktif; TLS 8883 aktif; 1883 dimatikan
- [ ] `JWT_SECRET` acak ≥ 32 byte

---

## Yang belum termasuk dokumen ini

| Item | Alasan |
|---|---|
| OTA firmware | Memerlukan perubahan platform (partisi ganda) + reflash bertahap |
| Watchdog, LWT, QoS 1, NTP di firmware | Memerlukan reflash; direncanakan satu paket dengan OTA |
| Perintah bertanda tangan (HMAC) | Bergantung pada ACL selesai lebih dulu |
| Kalibrasi densitas & akurasi model | Memerlukan pengumpulan data lapangan — lihat `docs/VALIDASI_PENGUJIAN.md` |
| Keputusan atribusi angka WRI 81,78-82,29% | Keputusan penulis paper, bukan teknis |

---

*Dokumen ini tidak memuat kredensial. Seluruh nilai contoh harus diganti dengan nilai
asli yang dibuat sendiri dan disimpan di pengelola kata sandi.*
