const express = require('express')
const multer = require('multer')
const allowDeviceOrAdmin = require('../middleware/deviceAuth')
const { isMaintenanceActive, setMaintenanceActive } = require('../config/maintenanceMode')
const { publish, maintenanceTopic } = require('../config/mqtt')
const { processSmartContainer, processChamber } = require('../services/iotProcessor')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

router.use(allowDeviceOrAdmin)

router.post('/smart-container', upload.single('foto'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'gagal', message: 'Foto belum diterima dari ESP32-CAM' })
  }

  const { beratKg } = req.body
  const hasil = await processSmartContainer(req.file.buffer, Number(beratKg) || 0)

  if (hasil.status === 'gagal') {
    return res.status(500).json(hasil)
  }
  res.json(hasil)
})

router.post('/maggot-chamber', async (req, res) => {
  const hasil = await processChamber(req.body)
  if (hasil.tersimpan === false) {
    return res.status(500).json(hasil)
  }
  res.json(hasil)
})

router.get('/maintenance-mode', (req, res) => {
  res.json({ aktif: isMaintenanceActive() })
})

router.post('/maintenance-mode', (req, res) => {
  const aktif = setMaintenanceActive(req.body.aktif)
  publish(maintenanceTopic(), JSON.stringify({ aktif }), { retain: true })
  res.json({ aktif })
})

module.exports = router