const express = require('express')
const multer = require('multer')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')
const aiService = require('../services/aiService')
const evaluateChamberConditions = require('../services/sensorEvaluationService')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.use(requireAuth, requireRole('admin_sekolah', 'superadmin'))

router.get('/monitoring', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.sensorReadings)
  }

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })

  if (!data) return res.json(null)

  const evaluasi = evaluateChamberConditions({
    suhuBilikC: data.suhu_bilik_c,
    kelembabanPersen: data.kelembaban_persen,
    kadarAmoniaPpm: data.kadar_amonia_ppm,
    suhuSubstratC: data.suhu_substrat_c
  })

  res.json({
    id: data.id,
    suhuBilikC: data.suhu_bilik_c,
    kelembabanPersen: data.kelembaban_persen,
    kadarAmoniaPpm: data.kadar_amonia_ppm,
    suhuSubstratC: data.suhu_substrat_c,
    estimasiBeratMaggotKg: data.estimasi_berat_maggot_kg,
    aman: evaluasi.aman,
    rekomendasi: evaluasi.rekomendasi,
    updatedAt: data.created_at
  })
})

router.get('/menu', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.menuUploads)
  }

  const { data, error } = await supabase
    .from('menu_uploads')
    .select('*')
    .order('tanggal', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/menu', upload.single('foto'), async (req, res) => {
  const { tanggal, nama, kalori, protein } = req.body

  if (!tanggal || !nama) {
    return res.status(400).json({ error: 'Tanggal dan nama menu wajib diisi' })
  }

  if (isDemoActive() || !supabase) {
    return res.json({
      id: `demo-menu-${Date.now()}`,
      tanggal,
      nama,
      kalori: Number(kalori) || 0,
      protein: Number(protein) || 0,
      fotoUrl: req.file ? 'demo-mode-foto-tidak-disimpan' : null
    })
  }

  let fotoUrl = null

  if (req.file) {
    const fileName = `${Date.now()}-${req.file.originalname}`
    const { error: uploadError } = await supabase.storage
      .from('menu-foto')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype })

    if (uploadError) return res.status(500).json({ error: uploadError.message })

    const { data: publicUrlData } = supabase.storage.from('menu-foto').getPublicUrl(fileName)
    fotoUrl = publicUrlData.publicUrl
  }

  const { data, error } = await supabase
    .from('menu_uploads')
    .insert({
      tanggal,
      nama,
      kalori: Number(kalori) || 0,
      protein: Number(protein) || 0,
      foto_url: fotoUrl
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/prediksi', async (req, res) => {
  const hasil = await aiService.getWastePrediction()
  res.json(hasil)
})

router.get('/penjualan', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.salesRecords)
  }

  const { data, error } = await supabase
    .from('sales_records')
    .select('*')
    .order('tanggal', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/penjualan', async (req, res) => {
  const { tanggal, jenis, beratKg, hargaPerKg } = req.body

  if (!tanggal || !jenis || !beratKg || !hargaPerKg) {
    return res.status(400).json({ error: 'Semua kolom penjualan wajib diisi' })
  }

  const total = Number(beratKg) * Number(hargaPerKg)

  if (isDemoActive() || !supabase) {
    return res.json({ id: `demo-jual-${Date.now()}`, tanggal, jenis, beratKg: Number(beratKg), hargaPerKg: Number(hargaPerKg), total })
  }

  const { data, error } = await supabase
    .from('sales_records')
    .insert({
      tanggal,
      jenis,
      berat_kg: beratKg,
      harga_per_kg: hargaPerKg,
      total
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
