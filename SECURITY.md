# Kebijakan Keamanan

**Proyek:** SPPG MBG — MBGCircular (AIoT pengelolaan limbah pangan sekolah + budidaya maggot BSF)

Dokumen ini menjelaskan cara melaporkan kerentanan dan praktik keamanan yang berlaku di repositori ini.

---

## Melaporkan Kerentanan

**Jangan** membuka issue publik untuk kerentanan keamanan.

Laporkan secara privat kepada pemelihara proyek dengan menyertakan:

1. Deskripsi kerentanan dan dampaknya.
2. Langkah reproduksi (perintah, permintaan HTTP, atau berkas).
3. Komponen terdampak (backend / frontend / firmware / database / broker).
4. Usulan perbaikan bila ada.

Sertakan **hanya** informasi yang diperlukan. Jangan menyertakan kredensial produksi
dalam laporan; gunakan nilai contoh.

---

## Status Kredensial: PERNAH BOCOR — WAJIB DIROTASI

Bagian ini penting dan harus dibaca sebelum menganggap sistem aman.

Sejumlah kredensial **pernah tersimpan di source code, dokumentasi, dan riwayat git**
repositori ini. Nilai-nilai tersebut harus dianggap **BOCOR** dan **wajib dirotasi**:

| Kredensial | Di mana pernah muncul | Status |
|---|---|---|
| Kata sandi WiFi lokasi | Sketch firmware (`WIFI_PASS`) | sudah dipindah ke `secrets.h`; **nilai belum dirotasi** |
| Kata sandi MQTT | Sketch firmware, `WIRING_PINOUT.md`, catatan env manual (sudah dihapus dari folder) | sudah dipindah ke `secrets.h`; **nilai belum dirotasi** |
| `DEVICE_API_KEY` | `backend/.env.example`, dokumentasi | placeholder sudah diganti; **nilai produksi belum dirotasi** |
| Kata sandi akun produksi | `supabase/seed_prod_users.sql` (hash **dan** kata sandinya sebagai komentar), `docs/DEPLOY_*.md` | berkas sudah dibersihkan dan tidak lagi memuat hash siap pakai; **hash lama masih ada di riwayat git (commit `6b82e39`) sehingga kata sandi WAJIB diganti** |
| `JWT_SECRET` | Berkembang: pernah bernilai lemah | **perlu dipastikan acak ≥ 32 byte** |

Pembersihan dokumen **tidak** menghapus kebocoran: nilai lama masih ada di riwayat git
dan mungkin sudah tercatat di tempat lain. Satu-satunya perbaikan yang benar adalah
**mengganti nilainya**. Lihat `docs/AUDIT_PRODUCTION_READINESS.md` bagian E untuk urutan
rotasi.

---

## Praktik yang Berlaku

### Kredensial

- Kredensial **tidak pernah** ditulis ke berkas yang di-commit. Berkas yang
  ter-gitignore: `.env`, `deploy/.env`, `secrets.h`, `deploy/mosquitto/passwd`.
  Catatan: berkas `ENV_VARIABLES.txt` (catatan env manual berisi kredensial terbuka)
  sudah dihapus dari folder proyek karena isinya duplikat dan nilai efektifnya
  tersimpan di `.env`, `deploy/.env`, dan `secrets.h`.
- Firmware membaca kredensial dari `secrets.h` di folder sketch (lihat
  `firmware/secrets.h.example`). CI **menolak** commit yang memuat nilai kredensial
  yang pernah bocor.
- Backend memuat variabel dari `backend/.env` dan `.env` akar repositori.
- **Jangan** menuliskan kredensial di dokumentasi, komentar kode, atau keluaran log.
  Logger backend otomatis menyensor field yang namanya mengandung
  `password`/`secret`/`token`/`api_key`/`authorization`.

### Akses

| Permukaan | Mekanisme | Catatan |
|---|---|---|
| API untuk manusia | JWT bearer (8 jam) | Disimpan di `localStorage` klien |
| API publik | tanpa autentikasi | Hanya agregat; **tidak boleh** memuat data pribadi siswa |
| API perangkat (REST) | header `x-device-api-key` | Fail-closed: bila kunci kosong di produksi, akses ditolak (503) |
| Database | `service_role` key dari backend | Menembus RLS; RLS bukan kontrol utama di sini |
| Broker MQTT | user/password | **Belum ada ACL per perangkat** — lihat di bawah |

### Data pribadi (UU PDP No. 27 Tahun 2022)

Sistem merekam citra ompreng siswa. Aturan yang berlaku:

- **Tidak ada** foto, nama, NIS, atau kelas siswa yang boleh diekspos ke endpoint publik.
- Skema database saat ini tidak memuat PII siswa (hanya agregat kategori, bobot, cap waktu).
- Bucket `menu-foto` bersifat publik: pastikan **hanya** foto menu yang masuk, bukan
  foto ompreng siswa.
- Kebijakan retensi citra perlu ditetapkan dan dijalankan.

---

## Risiko yang Diketahui dan Belum Ditutup

Daftar jujur mengenai apa yang **belum** aman pada saat dokumen ini ditulis. Rincian
beserta rencana perbaikannya ada di `docs/AUDIT_PRODUCTION_READINESS.md`.

| # | Risiko | Tingkat |
|---|---|---|
| 1 | Kredensial pernah bocor dan **belum dirotasi** | **Critical** |
| 2 | Broker MQTT **tanpa ACL**: satu kredensial dapat mengakses topik perintah semua perangkat, termasuk `set_scale_factor` dan `reboot` | **Critical** |
| 3 | Perangkat menerima perintah dari publisher mana pun (tidak ada tanda tangan perintah) | **Critical** |
| 4 | MQTT **tanpa TLS**: kredensial dan telemetri melintas dalam bentuk terbuka | **Critical** |
| 5 | Tidak ada OTA: perbaikan firmware butuh akses fisik ke setiap unit | High |
| 6 | Token JWT tidak dapat dicabut dan berlaku 8 jam | Medium |
| 7 | Tidak ada audit trail untuk tindakan operator (ubah kalibrasi, reboot, panen) | Medium |

### Status yang sudah ditutup

| Item | Cara ditutup |
|---|---|
| **AI service terbuka tanpa autentikasi** | Shared-secret lewat header `X-Internal-Key` (`ai_service/app/main.py`). Rollout aman: kunci kosong → layanan tetap melayani + peringatan; kunci terisi → header wajib; `AI_REQUIRE_AUTH=true` → tolak start bila kunci belum diatur. Diuji 9 test unit + 6 test integrasi HTTP |
| **Endpoint IoT fail-open** | `deviceAuth.js` menolak akses (503) di produksi bila `DEVICE_API_KEY` kosong |
| **CORS menerima semua `*.vercel.app`** | Allowlist eksplisit; diuji menolak origin asing |
| **Kredensial tertanam di source firmware** | Dipindah ke `secrets.h` (ter-gitignore) + CI menolak commit berisi nilai lama |
| **Kerentanan Next.js (1 critical + 2 high)** | Naik ke `next@15.5.24` + React 19; `npm audit` critical → 0 |
| **Input tidak divalidasi (berat negatif lolos)** | Skema zod di seluruh endpoint tulis; diuji lewat HTTP |

---

## Yang Diminta dari Kontributor

1. **Jangan pernah** menuliskan kredensial di berkas yang di-commit, termasuk di
   komentar, dokumentasi, atau pesan commit.
2. Jalankan `cd backend && npm test` dan `npm run lint` sebelum mengirim perubahan.
3. Perubahan skema database **wajib** disertai berkas migrasi **dan** rollback di
   `supabase/migrations/`, serta lolos `python3 tools/validasi/periksa-migrasi.py`.
4. Perubahan yang menyentuh autentikasi, otorisasi, atau kanal perangkat agar
   dijelaskan dampaknya terhadap butir-butir pada tabel risiko di atas.
