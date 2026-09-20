const crypto = require('node:crypto')
const express = require('express')
const multer = require('multer')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')
const aiService = require('../services/aiService')
const evaluateChamberConditions = require('../services/sensorEvaluationService')
const { validasi, skema } = require('../config/validasi')
const { limiterBerat } = require('../config/rateLimit')

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
  const cek = validasi(skema.menuBaru, req.body)
  if (!cek.sukses) {
    return res.status(400).json({ error: cek.pesan })
  }
  const { tanggal, nama, kalori, protein } = cek.data

  // Validasi jenis berkas. Sebelumnya MIME dari klien dipercaya begitu saja dan
  // nama berkas dipakai mentah, sehingga berkas sembarang dapat masuk ke bucket
  // publik dengan nama yang tidak terkendali.
  if (req.file) {
    const mimeDiizinkan = ['image/jpeg', 'image/png', 'image/webp']
    if (!mimeDiizinkan.includes(req.file.mimetype)) {
      return res.status(415).json({
        error: `Jenis berkas tidak didukung (${req.file.mimetype}). Gunakan JPEG, PNG, atau WebP.`
      })
    }
  }

  if (isDemoActive() || !supabase) {
    return res.json({
      id: `demo-menu-${Date.now()}`,
      tanggal,
      nama,
      kalori: kalori ?? 0,
      protein: protein ?? 0,
      fotoUrl: req.file ? 'demo-mode-foto-tidak-disimpan' : null
    })
  }

  let fotoUrl = null

  if (req.file) {
    // Nama berkas dibuat sendiri dari nilai aman: waktu + ekstensi yang
    // diturunkan dari MIME yang sudah tervalidasi. Nama asli dari klien TIDAK
    // dipakai, sehingga tidak ada risiko path traversal maupun karakter aneh.
    const ekstensi =
      { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.file.mimetype] ||
      'bin'
    const fileName = `menu-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ekstensi}`

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
      kalori: kalori ?? 0,
      protein: protein ?? 0,
      foto_url: fotoUrl
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Memanggil AI service eksternal: dibatasi.
router.get('/prediksi', limiterBerat, async (req, res) => {
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
  // Validasi skema menggantikan pemeriksaan "truthy". Sebelumnya beratKg "-5"
  // lolos dan menghasilkan total NEGATIF yang tersimpan sebagai penjualan.
  const cek = validasi(skema.penjualanBaru, req.body)
  if (!cek.sukses) {
    return res.status(400).json({ error: cek.pesan })
  }
  const { tanggal, jenis, beratKg, hargaPerKg } = cek.data

  // total dihitung dari nilai yang sudah tervalidasi, bukan dari input mentah.
  const total = Number((beratKg * hargaPerKg).toFixed(2))

  if (isDemoActive() || !supabase) {
    return res.json({ id: `demo-jual-${Date.now()}`, tanggal, jenis, beratKg, hargaPerKg, total })
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
