const express = require('express')
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

router.get('/csv', (req, res) => {
  const rows = isDemoActive() ? demoData.efficiencyTrend : []
  const csv = toCsv(rows)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-limbah.csv"')
  res.send(csv)
})

module.exports = router
