const express = require('express')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const registry = require('../config/deviceRegistry')
const { publishCommand } = require('../config/mqtt')
const demoData = require('../data/demoData')
const { limiterPerangkat } = require('../config/rateLimit')
const { catatAudit } = require('../config/auditTrail')

const router = express.Router()

const ALLOWED_CMDS = {
  'smart-container': ['status', 'tare', 'set_scale_factor', 'reboot'],
  'maggot-chamber': ['status', 'tare', 'set_scale_factor', 'set_r0', 'set_interval', 'reboot']
}

router.use(requireAuth, requireRole('admin_sekolah', 'superadmin'))

router.get('/', (req, res) => {
  if (isDemoActive()) {
    return res.json(demoData.devices)
  }
  res.json(registry.getDevices())
})

// Perintah fisik (termasuk reboot & tulis kalibrasi): dibatasi ketat.
router.post('/:id/cmd', limiterPerangkat, async (req, res) => {
  const { id } = req.params
  const { cmd, value } = req.body || {}

  const allowed = ALLOWED_CMDS[id]
  if (!allowed) return res.status(404).json({ error: 'Perangkat tidak dikenal' })
  if (!allowed.includes(cmd)) return res.status(400).json({ error: 'Perintah tidak valid untuk perangkat ini' })

  const payload = { cmd }
  if (value !== undefined && value !== null && value !== '') payload.value = Number(value)

  if (isDemoActive()) {
    const device = demoData.devices.find((d) => d.id === id)
    if (device) {
      device.cmdResult = {
        perangkat: id,
        cmd,
        ok: true,
        catatan: 'Demo: perintah disimulasikan',
        waktu: new Date().toISOString()
      }
    }
    return res.json({ terkirim: true, ke: id, cmd, value: payload.value, mode: 'demo' })
  }

  const terkirim = publishCommand(id, payload)

  // Jejak audit: perintah perangkat dapat mengubah perilaku fisik
  // (reboot, tare, set_scale_factor), sehingga WAJIB tercatat siapa dan kapan.
  await catatAudit({
    req,
    aksi: 'perangkat.perintah',
    target: id,
    detail: { cmd, value: payload.value ?? null },
    berhasil: terkirim,
    pesan: terkirim ? null : 'MQTT tidak aktif atau perangkat belum terhubung'
  })

  if (!terkirim) {
    return res.json({ terkirim: false, pesan: 'MQTT tidak aktif atau perangkat belum terhubung' })
  }
  res.json({ terkirim: true, ke: id, cmd, value: payload.value })
})

module.exports = router