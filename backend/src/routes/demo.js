const express = require('express')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive, setDemoActive } = require('../config/demoMode')
const { log } = require('../config/observability')
const { catatAudit } = require('../config/auditTrail')

const router = express.Router()

router.get('/status', (req, res) => {
  res.json({ demoActive: isDemoActive() })
})

router.post('/toggle', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { active } = req.body

  // Validasi tipe. Sebelumnya nilai apa pun diterima lalu di-Boolean-kan,
  // sehingga string "false" justru menghasilkan true.
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Field "active" harus bernilai true atau false.' })
  }

  try {
    // setDemoActive kini menulis ke database (lihat config/stateStore.js),
    // sehingga state bertahan lintas deploy dan konsisten antar replika.
    const result = await setDemoActive(active, req.user?.email || req.user?.id || null)

    log.info('mode demo diubah', {
      requestId: req.requestId,
      aktif: result,
      oleh: req.user?.email || req.user?.id
    })

    await catatAudit({
      req,
      aksi: 'mode.demo',
      target: 'demo_mode',
      detail: { aktif: result },
      pesan: result ? 'Mode demo dinyalakan' : 'Mode demo dimatikan'
    })

    res.json({ demoActive: result })
  } catch (err) {
    log.error('gagal mengubah mode demo', {
      requestId: req.requestId,
      error: err.message
    })
    res.status(503).json({ error: err.message })
  }
})

module.exports = router
