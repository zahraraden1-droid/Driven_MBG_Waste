const express = require('express')
const supabase = require('../config/supabase')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')

const router = express.Router()

router.get('/kpi', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.publicKpi)
  }

  const { data, error } = await supabase.rpc('get_public_kpi')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/waste-by-category', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.wasteByCategory)
  }

  const { data, error } = await supabase
    .from('waste_records')
    .select('kategori, berat_kg')
  if (error) return res.status(500).json({ error: error.message })

  const grouped = {}
  for (const row of data) {
    grouped[row.kategori] = (grouped[row.kategori] || 0) + Number(row.berat_kg)
  }
  const result = Object.entries(grouped).map(([kategori, beratKg]) => ({ kategori, beratKg }))
  res.json(result)
})

router.get('/education', (req, res) => {
  res.json(demoData.educationCards)
})

module.exports = router
