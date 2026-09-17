const express = require('express')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')
const aiService = require('../services/aiService')

const router = express.Router()

router.use(requireAuth, requireRole('dapur_mbg', 'superadmin'))

router.get('/korelasi-menu', async (req, res) => {
  const hasil = await aiService.getMenuCorrelation()
  res.json(hasil)
})

router.get('/efisiensi', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.efficiencyTrend)
  }

  const { data, error } = await supabase
    .from('waste_records')
    .select('minggu, berat_kg')
    .order('minggu', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const grouped = {}
  for (const row of data) {
    grouped[row.minggu] = (grouped[row.minggu] || 0) + Number(row.berat_kg)
  }
  const result = Object.entries(grouped).map(([minggu, totalLimbahKg]) => ({ minggu, totalLimbahKg }))
  res.json(result)
})

const KATEGORI_LABEL = {
  nasi: 'Nasi',
  sayur: 'Sayur',
  lauk: 'Lauk',
  buah: 'Buah',
  lainnya: 'Lainnya'
}

function bangunPeringkat(sisaPerKategori) {
  const totalSisaKg = sisaPerKategori.reduce((sum, r) => sum + Number(r.beratKg), 0)
  const peringkatSisa = sisaPerKategori
    .map((r) => ({
      kategori: r.kategori,
      nama: KATEGORI_LABEL[r.kategori] || 'Lainnya',
      beratKg: Number(Number(r.beratKg).toFixed(1)),
      persentase: totalSisaKg > 0 ? Number(((Number(r.beratKg) / totalSisaKg) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.beratKg - a.beratKg)

  return { totalSisaKg: Number(Number(totalSisaKg).toFixed(1)), peringkatSisa }
}

router.get('/analisis-sisa', async (req, res) => {
  if (isDemoActive() || !supabase) {
    const demo = demoData.wasteByCategory.map((w) => ({ kategori: w.kategori.toLowerCase(), beratKg: w.beratKg }))
    return res.json(bangunPeringkat(demo))
  }

  const { data, error } = await supabase.from('waste_records').select('kategori, berat_kg')
  if (error) return res.status(500).json({ error: error.message })

  const grouped = {}
  for (const row of data) {
    const key = row.kategori || 'lainnya'
    grouped[key] = (grouped[key] || 0) + Number(row.berat_kg)
  }

  const sisaPerKategori = Object.entries(grouped).map(([kategori, beratKg]) => ({ kategori, beratKg }))
  res.json(bangunPeringkat(sisaPerKategori))
})

module.exports = router
