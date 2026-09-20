const express = require('express')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')
const { log } = require('../config/observability')
const { limiterBerat } = require('../config/rateLimit')

const router = express.Router()

router.use(requireAuth, requireRole('dapur_mbg', 'admin_sekolah', 'superadmin'))

// Batas jumlah baris yang diekspor dalam satu permintaan. Sebelumnya endpoint
// ini memuat SELURUH tabel ke memori tanpa batas, sehingga seiring data
// bertambah permintaan ini dapat menghabiskan memori proses.
const MAKS_BARIS = Number(process.env.CSV_MAKS_BARIS || 50000)

/**
 * Membersihkan satu sel CSV.
 *
 * DUA MASALAH YANG DIPERBAIKI
 *
 * 1. Struktur CSV rusak. Versi lama hanya `row[h].join(',')` tanpa escaping,
 *    sehingga nilai yang memuat koma, tanda kutip, atau baris baru akan
 *    menggeser kolom dan merusak seluruh berkas.
 *
 * 2. CSV injection (formula injection). Bila sebuah sel dimulai dengan
 *    `=`, `+`, `-`, atau `@`, Excel/Google Sheets akan MENJALANKANNYA sebagai
 *    rumus. Nilai kategori berasal dari deteksi model, dan `catatan` berasal
 *    dari input pengguna — keduanya tidak boleh dipercaya. Contoh serangan:
 *    kategori bernilai `=HYPERLINK("http://jahat","klik")` akan menjadi tautan
 *    aktif saat laporan dibuka.
 *
 *    Penanganan: sel yang diawali karakter berbahaya diberi awalan kutip
 *    tunggal (') sehingga diperlakukan sebagai teks oleh spreadsheet.
 */
function selCsv(nilai) {
  if (nilai === null || nilai === undefined) return ''

  let teks = String(nilai)

  // Netralkan formula injection.
  if (/^[=+\-@\t\r]/.test(teks)) {
    teks = `'${teks}`
  }

  // Escaping standar CSV: bungkus dengan kutip ganda bila memuat pemisah,
  // kutip, atau baris baru; kutip ganda di dalamnya digandakan.
  if (/[",\n\r]/.test(teks)) {
    teks = `"${teks.replace(/"/g, '""')}"`
  }

  return teks
}

function toCsv(rows, kolom) {
  const headers = kolom || (rows.length ? Object.keys(rows[0]) : [])
  if (!headers.length) return ''
  const lines = [headers.map(selCsv).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => selCsv(row[h])).join(','))
  }
  // Baris baru di akhir berkas: standar yang diharapkan banyak alat.
  // Header tetap ditulis walau tidak ada data, agar pengguna tahu ekspor
  // berhasil dan dapat melihat nama kolomnya.
  return lines.join('\n') + '\n'
}

// Ekspor menarik banyak baris sekaligus: dibatasi agar tidak dibanjiri.
router.get('/csv', limiterBerat, async (req, res) => {
  // Filter periode opsional. Tanpa ini, permintaan selalu menarik seluruh
  // riwayat — mahal dan jarang yang dibutuhkan.
  const { dari, sampai } = req.query

  const formatTanggal = /^\d{4}-\d{2}-\d{2}$/
  if (dari && !formatTanggal.test(dari)) {
    return res.status(400).json({ error: 'Parameter "dari" harus berformat YYYY-MM-DD.' })
  }
  if (sampai && !formatTanggal.test(sampai)) {
    return res.status(400).json({ error: 'Parameter "sampai" harus berformat YYYY-MM-DD.' })
  }
  if (dari && sampai && dari > sampai) {
    return res.status(400).json({ error: 'Parameter "dari" tidak boleh melebihi "sampai".' })
  }

  let rows = isDemoActive() ? demoData.efficiencyTrend : []
  let terpotong = false

  if (!isDemoActive() && supabase) {
    // Filter periode disusun sebagai fungsi agar dapat diterapkan ke query
    // utama MAUPUN query cadangan. Sebelumnya filter hanya dipasang pada query
    // utama, sehingga ketika jalur cadangan terpakai (kolom provenance belum
    // ada), filter periode DIABAIKAN tanpa peringatan apa pun — pengguna
    // meminta satu bulan tetapi menerima seluruh riwayat.
    const terapkanFilter = (q) => {
      let hasil = q
      if (dari) hasil = hasil.gte('tanggal', dari)
      if (sampai) hasil = hasil.lte('tanggal', sampai)
      return hasil
    }

    const queryUtama = terapkanFilter(
      supabase
        .from('waste_records')
        .select('tanggal, minggu, kategori, berat_kg')
        .eq('is_simulated', false)
        .gt('berat_kg', 0)
        .order('tanggal', { ascending: true })
        .limit(MAKS_BARIS + 1)
    )

    // Pisahkan agar `data` dapat diisi ulang pada jalur cadangan sementara
    // `error` tetap const (hanya dibaca).
    const hasilUtama = await queryUtama
    let data = hasilUtama.data
    const error = hasilUtama.error

    if (error) {
      log.warn('ekspor CSV memakai jalur cadangan (provenance belum tersedia)', {
        requestId: req.requestId,
        error: error.message
      })

      const cadangan = await terapkanFilter(
        supabase
          .from('waste_records')
          .select('tanggal, minggu, kategori, berat_kg')
          .order('tanggal', { ascending: true })
          .limit(MAKS_BARIS + 1)
      )

      if (cadangan.error) return res.status(500).json({ error: cadangan.error.message })
      data = cadangan.data
    }

    rows = data || []

    if (rows.length > MAKS_BARIS) {
      terpotong = true
      rows = rows.slice(0, MAKS_BARIS)
    }

    rows = rows.map((r) => ({
      tanggal: r.tanggal,
      minggu: r.minggu,
      kategori: r.kategori,
      beratKg: r.berat_kg
    }))
  }

  const csv = toCsv(rows, ['tanggal', 'minggu', 'kategori', 'beratKg'])

  log.info('ekspor CSV', {
    requestId: req.requestId,
    jumlahBaris: rows.length,
    dari: dari || null,
    sampai: sampai || null,
    terpotong
  })

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-limbah.csv"')
  // Beri tahu pemanggil bila data dipotong, agar tidak disangka lengkap.
  if (terpotong) {
    res.setHeader('X-Data-Terpotong', `true; maksimum=${MAKS_BARIS}`)
  }
  // Awalan BOM agar Excel membaca UTF-8 dengan benar.
  res.send('\uFEFF' + csv)
})

module.exports = router
module.exports.selCsv = selCsv
module.exports.toCsv = toCsv
