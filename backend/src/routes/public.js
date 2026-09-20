const express = require('express')
const supabase = require('../config/supabase')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')
const { log } = require('../config/observability')

const router = express.Router()

// Tanda migrasi 20260921 (agregasi SQL). Bila fungsi agregasi belum ada,
// endpoint memakai jalur cadangan agar dashboard tidak menampilkan error total.
let agregasiSqlTersedia = true

function catatMigrasiBelumDijalankan(nama, pesan) {
  if (agregasiSqlTersedia) {
    agregasiSqlTersedia = false
    log.warn(
      'fungsi agregasi SQL belum tersedia — jalankan supabase/migrations/20260921_agregasi_dan_state.sql',
      { fungsi: nama, error: pesan }
    )
  }
}

// ---------------------------------------------------------------------------
// KPI utama
// ---------------------------------------------------------------------------
router.get('/kpi', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.publicKpi)
  }

  const { data, error } = await supabase.rpc('get_public_kpi')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ---------------------------------------------------------------------------
// Limbah per kategori
//
// Sebelumnya endpoint ini mengambil SELURUH tabel waste_records lalu
// menjumlahkan di memori Node. Cara itu tidak akan bertahan ketika data
// bertambah. Kini agregasi dilakukan di database.
//
// Fungsi mengembalikan `persentase` sekaligus, sehingga frontend tidak perlu
// menghitung ulang dan tidak ada risiko selisih pembulatan antar tempat.
// ---------------------------------------------------------------------------
router.get('/waste-by-category', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.wasteByCategory)
  }

  const { data, error } = await supabase.rpc('get_public_waste_by_category')

  if (error) {
    catatMigrasiBelumDijalankan('get_public_waste_by_category', error.message)

    // Jalur cadangan berlapis. Tidak boleh mengasumsikan kolom provenance
    // sudah ada, karena justru ketiadaannyalah alasan jalur ini dipakai.
    //
    //   Lapis 1: saring data simulasi dan nilai nol (lebih akurat) — hanya
    //            berhasil bila kolom is_simulated sudah ada.
    //   Lapis 2: tanpa saringan apa pun, agar dashboard tetap tampil pada
    //            database yang belum dimigrasikan.
    let rows = null
    let errCadangan = null

    const lapis1 = await supabase
      .from('waste_records')
      .select('kategori, berat_kg')
      .eq('is_simulated', false)
      .gt('berat_kg', 0)

    if (!lapis1.error && Array.isArray(lapis1.data)) {
      rows = lapis1.data
    } else {
      const lapis2 = await supabase.from('waste_records').select('kategori, berat_kg')
      if (lapis2.error) {
        errCadangan = lapis2.error
      } else {
        rows = lapis2.data
      }
    }

    if (errCadangan) return res.status(500).json({ error: errCadangan.message })

    const grouped = {}
    for (const row of rows) {
      grouped[row.kategori] = (grouped[row.kategori] || 0) + Number(row.berat_kg)
    }
    const total = Object.values(grouped).reduce((a, b) => a + b, 0)
    return res.json(
      Object.entries(grouped).map(([kategori, beratKg]) => ({
        kategori,
        beratKg: Number(beratKg.toFixed(3)),
        persentase: total > 0 ? Number(((beratKg / total) * 100).toFixed(1)) : 0,
        jumlahRecords: null,
        catatan: 'dihitung dengan jalur cadangan; jalankan migrasi 20260921 untuk hasil akurat'
      }))
    )
  }

  res.json(data)
})

// ---------------------------------------------------------------------------
// Tren per periode: hari | minggu | bulan
// ---------------------------------------------------------------------------
router.get('/tren', async (req, res) => {
  const periode = ['hari', 'minggu', 'bulan'].includes(req.query.periode)
    ? req.query.periode
    : 'hari'

  if (isDemoActive() || !supabase) {
    // Data demo pada demoData.efficiencyTrend berbentuk { minggu, totalLimbahKg }.
    return res.json(
      demoData.efficiencyTrend.map((d) => ({
        periode: d.minggu,
        totalBeratKg: d.totalLimbahKg,
        jumlahRecords: null
      }))
    )
  }

  const { data, error } = await supabase.rpc('get_public_tren', { p_periode: periode })
  if (error) {
    catatMigrasiBelumDijalankan('get_public_tren', error.message)
    return res.status(503).json({
      error: 'Fitur tren belum tersedia. Jalankan migrasi 20260921_agregasi_dan_state.sql.'
    })
  }

  res.json(data)
})

// ---------------------------------------------------------------------------
// Cakupan & kualitas data
//
// Endpoint ini penting untuk kredibilitas: pembaca dashboard harus dapat
// mengetahui seberapa besar data di balik sebuah angka, dan apakah pernah ada
// data simulasi yang masuk.
// ---------------------------------------------------------------------------
router.get('/kualitas-data', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json({ mode: 'demo', catatan: 'Angka berasal dari data contoh, bukan data nyata.' })
  }

  const { data, error } = await supabase.rpc('get_public_kualitas_data')
  if (error) {
    catatMigrasiBelumDijalankan('get_public_kualitas_data', error.message)
    return res.status(503).json({
      error: 'Fitur cakupan data belum tersedia. Jalankan migrasi 20260921_agregasi_dan_state.sql.'
    })
  }

  res.json(data)
})

// ---------------------------------------------------------------------------
// Peringkat kategori (untuk evaluasi menu SPPG)
// ---------------------------------------------------------------------------
router.get('/peringkat-kategori', async (req, res) => {
  if (isDemoActive() || !supabase) {
    const total = demoData.wasteByCategory.reduce((a, d) => a + Number(d.beratKg), 0)
    return res.json(
      [...demoData.wasteByCategory]
        .sort((a, b) => b.beratKg - a.beratKg)
        .map((d, i) => ({
          peringkat: i + 1,
          kategori: d.kategori,
          beratKg: d.beratKg,
          persentase: total > 0 ? Number(((d.beratKg / total) * 100).toFixed(1)) : 0
        }))
    )
  }

  const { data, error } = await supabase.rpc('get_public_peringkat_kategori')
  if (error) {
    catatMigrasiBelumDijalankan('get_public_peringkat_kategori', error.message)
    return res.status(503).json({
      error: 'Fitur peringkat belum tersedia. Jalankan migrasi 20260921_agregasi_dan_state.sql.'
    })
  }

  res.json(data)
})

router.get('/education', (req, res) => {
  res.json(demoData.educationCards)
})

module.exports = router
