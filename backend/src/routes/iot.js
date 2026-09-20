const express = require('express')
const multer = require('multer')
const allowDeviceOrAdmin = require('../middleware/deviceAuth')
const { isMaintenanceActive, setMaintenanceActive } = require('../config/maintenanceMode')
const { publish, maintenanceTopic } = require('../config/mqtt')
const { processSmartContainer, processChamber } = require('../services/iotProcessor')
const { log } = require('../config/observability')
const { buatTrace, tandai } = require('../config/latencyTrace')
const { validasi, skema } = require('../config/validasi')
const { catatAudit } = require('../config/auditTrail')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

router.use(allowDeviceOrAdmin)

router.post('/smart-container', upload.single('foto'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'gagal', message: 'Foto belum diterima dari ESP32-CAM' })
  }

  const trace = buatTrace('smart-container-via-rest')
  const { beratKg } = req.body
  const hasil = await processSmartContainer(req.file.buffer, Number(beratKg) || 0, trace)
  tandai(trace, 'hasilDisiapkan')

  if (hasil.status === 'gagal') {
    return res.status(500).json(hasil)
  }
  res.json(hasil)
})

router.post('/maggot-chamber', async (req, res) => {
  const cek = validasi(skema.telemetriChamber, req.body)
  if (!cek.sukses) {
    // 400: payload cacat (mis. suhu bukan angka). Berbeda dari 422 di bawah,
    // yang berarti payload sah tetapi tidak memuat nilai apa pun.
    log.warn('telemetri ditolak validasi', {
      requestId: req.requestId,
      pesan: cek.pesan
    })
    return res.status(400).json({ error: cek.pesan })
  }

  // Catat field yang tidak dikenal, tanpa menolaknya. Firmware yang sudah
  // terpasang tidak boleh berhenti karena mengirim field tambahan, tetapi
  // penyimpangan penamaan field perlu terlihat sebelum menjadi bug senyap.
  const dikenal = new Set([
    'batchId',
    'suhuBilikC',
    'kelembapanPersen',
    'kadarAmoniaPpm',
    'suhuSubstratC',
    'beratMaggotPanenKg'
  ])
  const asing = Object.keys(req.body || {}).filter((k) => !dikenal.has(k))
  if (asing.length) {
    log.warn('telemetri memuat field tidak dikenal', {
      requestId: req.requestId,
      field: asing
    })
  }

  const trace = buatTrace('maggot-chamber-via-rest')
  const hasil = await processChamber(cek.data, trace)
  if (hasil.tersimpan === false) {
    // 422 (bukan 500): payload diterima tetapi tidak dapat diproses karena
    // seluruh nilai sensor kosong. Perangkat perlu membedakan keduanya.
    return res.status(422).json(hasil)
  }
  res.json(hasil)
})

router.get('/maintenance-mode', (req, res) => {
  res.json({ aktif: isMaintenanceActive() })
})

router.post('/maintenance-mode', async (req, res) => {
  const { aktif: nilai } = req.body

  if (typeof nilai !== 'boolean') {
    return res.status(400).json({ error: 'Field "aktif" harus bernilai true atau false.' })
  }

  try {
    // State kini disimpan di database agar bertahan lintas deploy.
    const aktif = await setMaintenanceActive(nilai, req.user?.email || req.user?.id || null)

    // Pesan retained: perangkat yang baru terhubung akan langsung menerimanya.
    publish(maintenanceTopic(), JSON.stringify({ aktif }), { retain: true })

    log.info('mode pemeliharaan diubah', {
      requestId: req.requestId,
      aktif,
      oleh: req.user?.email || req.user?.id || 'perangkat'
    })

    await catatAudit({
      req,
      aksi: 'mode.pemeliharaan',
      target: 'maintenance_mode',
      detail: { aktif, oleh: req.user?.email || 'perangkat' },
      pesan: aktif ? 'Mode pemeliharaan dinyalakan' : 'Mode pemeliharaan dimatikan'
    })

    res.json({ aktif })
  } catch (err) {
    log.error('gagal mengubah mode pemeliharaan', {
      requestId: req.requestId,
      error: err.message
    })
    res.status(503).json({ error: err.message })
  }
})

module.exports = router
