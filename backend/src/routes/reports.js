const express = require('express')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')

const router = express.Router()

router.use(requireAuth, requireRole('dapur_mbg', 'admin_sekolah', 'superadmin'))

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => row[h]).join(','))
  }
  return lines.join('\n')
}

router.get('/csv', async (req, res) => {
  let rows = isDemoActive() ? demoData.efficiencyTrend : []

  if (!isDemoActive() && supabase) {
    const { data, error } = await supabase
      .from('waste_records')
      .select('tanggal, minggu, kategori, berat_kg')
      .order('tanggal', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    rows = (data || []).map((r) => ({
      tanggal: r.tanggal,
      minggu: r.minggu,
      kategori: r.kategori,
      beratKg: r.berat_kg
    }))
  }

  const csv = toCsv(rows)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-limbah.csv"')
  res.send(csv)
})

module.exports = router
