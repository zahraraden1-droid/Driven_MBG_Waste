const express = require('express')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')

const router = express.Router()

router.use(requireAuth, requireRole('admin_sekolah', 'superadmin'))

function hitungUmurHari(tanggalMulai) {
  const mulai = new Date(`${tanggalMulai}T00:00:00`)
  const hariIni = new Date()
  hariIni.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((hariIni - mulai) / (24 * 3600 * 1000)))
}

function hitungFase(umurHari) {
  if (umurHari <= 3) return { fase: 'Inkubasi', statusSaran: 'inkubasi' }
  if (umurHari <= 14) return { fase: 'Larva Aktif', statusSaran: 'aktif_makan' }
  if (umurHari <= 18) return { fase: 'Menjelang Prepupa/Matang', statusSaran: 'siap_panen' }
  return { fase: 'Siap Panen', statusSaran: 'siap_panen' }
}

function nullish(val) {
  return val === null || val === undefined ? 0 : Number(val)
}

router.get('/', async (req, res) => {
  if (isDemoActive() || !supabase) {
    return res.json(demoData.maggotBatches)
  }

  const { data, error } = await supabase
    .from('maggot_batches')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { batchKode, tanggalMulai, beratTelurGram, biayaBeli, catatan } = req.body

  if (!batchKode || !tanggalMulai || !beratTelurGram) {
    return res.status(400).json({ error: 'Kode batch, tanggal mulai, dan berat telur wajib diisi' })
  }

  const payload = {
    batch_kode: batchKode,
    tanggal_mulai: tanggalMulai,
    berat_telur_gram: Number(beratTelurGram),
    biaya_beli: Number(biayaBeli) || 0,
    status: 'inkubasi',
    catatan: catatan || null
  }

  if (isDemoActive() || !supabase) {
    return res.json({ id: `demo-batch-${Date.now()}`, ...payload, created_at: new Date().toISOString() })
  }

  const { data, error } = await supabase.from('maggot_batches').insert(payload).select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/status-siklus', async (req, res) => {
  if (isDemoActive() || !supabase) {
    const semuaBatch = demoData.maggotBatches.map((b) => {
      const umurHari = hitungUmurHari(b.tanggalMulai)
      const { fase } = hitungFase(umurHari)
      return { ...b, umurHari, fase, perluPesanTelurBaru: umurHari >= 15 }
    })
    const batchAktif = semuaBatch.find((b) => b.status !== 'selesai_panen') || null
    const peringatan = {
      perluPesanTelurBaru: batchAktif ? batchAktif.umurHari >= 15 : false,
      umurHari: batchAktif ? batchAktif.umurHari : 0,
      alasan: batchAktif && batchAktif.umurHari >= 15 ? `Batch ${batchAktif.batchKode} sudah berumur ${batchAktif.umurHari} hari (memasuki masa prepupa/siap panen)` : null
    }
    return res.json({ batchAktif, peringatan, semuaBatch })
  }

  const { data: batches, error } = await supabase
    .from('maggot_batches')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const { data: riwayatSens, error: errSens } = await supabase
    .from('sensor_readings')
    .select('estimasi_berat_maggot_kg, created_at')
    .order('created_at', { ascending: false })
    .limit(2)

  if (errSens) return res.status(500).json({ error: errSens.message })

  const beratMeningkat = riwayatSens && riwayatSens.length >= 2
    ? nullish(riwayatSens[0].estimasi_berat_maggot_kg) > nullish(riwayatSens[1].estimasi_berat_maggot_kg)
    : false

  const semuaBatch = batches.map((b) => {
    const umurHari = hitungUmurHari(b.tanggal_mulai)
    const { fase } = hitungFase(umurHari)
    return {
      id: b.id,
      batchKode: b.batch_kode,
      tanggalMulai: b.tanggal_mulai,
      beratTelurGram: nullish(b.berat_telur_gram),
      biayaBeli: nullish(b.biaya_beli),
      status: b.status,
      catatan: b.catatan,
      umurHari,
      fase,
      perluPesanTelurBaru: umurHari >= 15 || beratMeningkat
    }
  })

  const batchAktif = semuaBatch.find((b) => b.status !== 'selesai_panen') || null

  let peringatan = { perluPesanTelurBaru: false, umurHari: 0, alasan: null }
  if (batchAktif) {
    const alasan = []
    if (batchAktif.umurHari >= 15) {
      alasan.push(`Batch ${batchAktif.batchKode} sudah berumur ${batchAktif.umurHari} hari (memasuki masa prepupa/siap panen)`)
    }
    if (beratMeningkat) {
      alasan.push('Berat maggot di wadah atas meningkat menandakan maggot matang mulai bermigrasi')
    }
    peringatan = {
      perluPesanTelurBaru: batchAktif.perluPesanTelurBaru,
      umurHari: batchAktif.umurHari,
      alasan: alasan.length ? alasan.join('. ') + '.' : null
    }
  }

  res.json({ batchAktif, peringatan, semuaBatch })
})

router.put('/:id/panen', async (req, res) => {
  const { id } = req.params

  if (isDemoActive() || !supabase) {
    return res.json({ id, status: 'selesai_panen' })
  }

  const { data, error } = await supabase
    .from('maggot_batches')
    .update({ status: 'selesai_panen' })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router