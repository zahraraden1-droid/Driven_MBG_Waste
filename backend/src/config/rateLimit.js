/*
 * Pembatas laju (rate limit) yang dapat dipakai ulang.
 *
 * MASALAH YANG DIPERBAIKI
 * Sebelumnya hanya `/api/auth/login` dan `/api/iot` yang dibatasi. Endpoint
 * lain — termasuk yang paling berat — terbuka tanpa batas:
 *   - /api/reports/csv        : menarik seluruh tabel limbah
 *   - /api/dapur-mbg/korelasi-menu : memanggil AI service + mengambil ribuan baris
 *   - /api/devices/:id/cmd    : mengirim perintah ke perangkat fisik
 *
 * Dampaknya bukan hanya beban server: perintah perangkat yang dibanjiri dapat
 * memicu reboot berulang atau penulisan EEPROM berkali-kali, yang merusak
 * perangkat secara fisik.
 *
 * CATATAN PENTING
 * Penyimpanan hitungan berada di memori proses. Pada mode multi-replika, batas
 * berlaku per replika, bukan gabungan. Untuk batas yang benar-benar global
 * diperlukan penyimpanan bersama (mis. Redis). Ini disengaja: menambah
 * dependensi eksternal hanya untuk rate limit belum sebanding manfaatnya pada
 * skala satu sekolah.
 */

const rateLimit = require('express-rate-limit')

function pesan(tulisan) {
  return { error: tulisan }
}

/**
 * Endpoint yang memicu pekerjaan berat (agregasi besar atau panggilan ke
 * layanan AI eksternal). Batasnya lebih ketat karena satu permintaan berbiaya
 * jauh lebih tinggi daripada permintaan biasa.
 */
const limiterBerat = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_BERAT || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: pesan(
    'Terlalu banyak permintaan untuk operasi ini. Coba lagi dalam satu menit.'
  )
})

/**
 * Perintah ke perangkat fisik. Dibatasi ketat karena dampaknya nyata:
 * perintah berulang dapat me-reboot perangkat atau menulis ulang kalibrasi
 * berkali-kali (menguras umur EEPROM/NVS).
 */
const limiterPerangkat = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PERANGKAT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: pesan(
    'Terlalu banyak perintah perangkat. Tunggu satu menit sebelum mencoba lagi.'
  )
})

/**
 * Endpoint baca biasa pada dashboard.
 */
const limiterBaca = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_BACA || 120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: pesan('Terlalu banyak permintaan. Coba lagi sebentar lagi.')
})

module.exports = { limiterBerat, limiterPerangkat, limiterBaca }
