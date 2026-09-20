/*
 * Rute internal: statistik latency.
 *
 * TUJUAN
 * Menyediakan distribusi latency rantai pemrosesan, sehingga klaim seperti
 * "latency <2 detik" pada paper dapat diperiksa terhadap data nyata, bukan
 * berdasarkan satu kali pengukuran manual.
 *
 * KEAMANAN
 * Data ini mengungkap struktur internal (tahap pemrosesan, waktu, tingkat
 * kegagalan). Karena itu akses DIBATASI pada superadmin, tidak pernah publik.
 *
 * CATATAN
 * Angka berasal dari buffer di memori dan ter-reset setiap proses dimulai
 * ulang (deploy/restart). Untuk analisis jangka panjang, data ini perlu ditulis
 * ke tabel tersendiri.
 */

const express = require('express')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { ringkasan, terakhir, reset } = require('../config/latencyTrace')

const router = express.Router()

router.use(requireAuth, requireRole('superadmin'))

// Ringkasan agregat per tahap: n, rata-rata, maksimum.
router.get('/', (req, res) => {
  res.json({
    ...ringkasan(),
    caraMembaca: {
      perTahap: 'Durasi antar penanda, bukan durasi absolut sejak proses mulai.',
      n: 'Jumlah sampel. Laporkan n bersama angka latency, jangan angka tunggal.',
      catatan:
        'Buffer di memori; reset saat deploy. Angka ini untuk diagnosis operasional dan tidak mewakili seluruh riwayat sistem.'
    }
  })
})

// Trace terakhir secara rinci, untuk menelusuri satu permintaan tertentu.
router.get('/terakhir', (req, res) => {
  const jumlah = Number(req.query.n || 20)
  res.json(terakhir(Number.isFinite(jumlah) ? jumlah : 20))
})

// Mengosongkan buffer. Berguna sebelum menjalankan pengukuran terkontrol,
// mis. saat mengukur satu sesi pengujian tertentu.
router.post('/reset', (req, res) => {
  reset()
  res.json({ ok: true, pesan: 'Buffer latency dikosongkan.' })
})

module.exports = router
