/*
 * Pemuat variabel lingkungan.
 *
 * MASALAH YANG DIPERBAIKI
 * `dotenv.config()` tanpa argumen hanya membaca berkas `.env` di direktorat
 * kerja saat ini. Dokumentasi proyek menyuruh menjalankan `cd backend && npm run
 * dev`, sehingga yang dibaca adalah `backend/.env` — padahal berkas konfigurasi
 * berada di akar repositori (`.env`).
 *
 * Akibatnya backend berjalan TANPA kredensial Supabase dan TANPA konfigurasi
 * lain, secara diam-diam:
 *   "[skema] Supabase tidak dikonfigurasi; pemeriksaan skema dilewati."
 * Gejala yang terlihat: dashboard menampilkan data contoh, dan tidak ada
 * indikasi jelas bahwa penyebabnya adalah berkas env yang tidak terbaca.
 *
 * PERBAIKAN
 * Muat dengan urutan prioritas berikut (yang pertama menang):
 *   1. Variabel lingkungan proses (sudah diset, mis. oleh Railway) — tidak ditimpa.
 *   2. backend/.env   (khusus backend, bila ada)
 *   3. ../.env        (akar repositori — lokasi konfigurasi proyek ini)
 *
 * Modul ini TIDAK memuat berkas .env ke dalam repositori; hanya membaca.
 */

const path = require('node:path')
const fs = require('node:fs')
const dotenv = require('dotenv')

const AKAR_BACKEND = path.resolve(__dirname, '..', '..')
const KANDIDAT = [
  { label: 'backend/.env', path: path.join(AKAR_BACKEND, '.env') },
  { label: '../.env (akar repo)', path: path.resolve(AKAR_BACKEND, '..', '.env') }
]

const dimuat = []

for (const kandidat of KANDIDAT) {
  if (!fs.existsSync(kandidat.path)) continue

  const hasil = dotenv.config({ path: kandidat.path, override: false })
  if (hasil.error) {
    console.warn(`[env] gagal membaca ${kandidat.label}: ${hasil.error.message}`)
    continue
  }
  dimuat.push(kandidat.label)
}

// Ringkasan aman (tanpa nilai) agar operator dapat memastikan konfigurasi
// benar-benar terbaca. Hanya kunci yang ditampilkan, bukan isinya.
const KUNCI_PENTING = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'DEVICE_API_KEY',
  'MQTT_URL',
  'AI_SERVICE_URL',
  'ROBOFLOW_API_KEY',
  'DEMO_MODE',
  'NODE_ENV'
]

const terisi = KUNCI_PENTING.filter((k) => Boolean(process.env[k]))

module.exports = {
  dimuat,
  terisi,
  lapor: () => {
    if (dimuat.length === 0) {
      console.warn(
        '[env] TIDAK ada berkas .env yang terbaca. Salin backend/.env.example ke ' +
          'backend/.env atau letakkan .env di akar repositori.'
      )
    } else {
      console.log(`[env] berkas dimuat: ${dimuat.join(', ')}`)
    }
    const kosong = KUNCI_PENTING.filter((k) => !process.env[k])
    if (kosong.length) {
      console.warn(`[env] variabel belum diatur: ${kosong.join(', ')}`)
    }
  }
}
