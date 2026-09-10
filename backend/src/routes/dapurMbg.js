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
  const hasil = await aiService.getMenuCorrelation(req.query.sekolahId)
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

router.get('/sekolah', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.schools)
  }

  const { data, error } = await supabase.from('schools').select('id, nama, kontak')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
