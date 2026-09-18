const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')
const supabase = require('../config/supabase')

const AI_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

async function callLocalAi(path, payload) {
  const response = await fetch(`${AI_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`AI service merespon dengan status ${response.status}`)
  }

  return response.json()
}

async function getWastePrediction() {
  if (isDemoActive()) {
    return demoData.aiPrediction
  }

  let riwayat = []
  let batches = []

  if (supabase) {
    const { data: waste, error } = await supabase
      .from('waste_records')
      .select('minggu, berat_kg')

    if (!error && Array.isArray(waste)) {
      const grouped = {}
      for (const r of waste) {
        const k = r.minggu || 'Belum dikelompokkan'
        grouped[k] = (grouped[k] || 0) + Number(r.berat_kg)
      }
      riwayat = Object.entries(grouped).map(([minggu, totalLimbahKg]) => ({ minggu, totalLimbahKg }))
    }

    const { data: batchRows } = await supabase
      .from('maggot_batches')
      .select('batch_kode, tanggal_mulai, status')
      .order('created_at', { ascending: false })
      .limit(20)

    if (Array.isArray(batchRows)) {
      batches = batchRows.map((b) => ({
        batchKode: b.batch_kode,
        tanggalMulai: b.tanggal_mulai,
        status: b.status
      }))
    }
  }

  try {
    return await callLocalAi('/predict/waste', { riwayat, batches })
  } catch (err) {
    return { error: true, message: err.message }
  }
}

async function getMenuCorrelation() {
  if (isDemoActive()) {
    return demoData.aiCorrelationTable
  }

  let menu = []
  let waste = []

  if (supabase) {
    const { data: menuRows } = await supabase
      .from('menu_uploads')
      .select('tanggal, nama')
      .order('tanggal', { ascending: false })
      .limit(90)

    if (Array.isArray(menuRows)) {
      menu = menuRows.map((m) => ({ tanggal: m.tanggal, nama: m.nama }))
    }

    const { data: wasteRows } = await supabase
      .from('waste_records')
      .select('tanggal, kategori, berat_kg')
      .order('tanggal', { ascending: false })
      .limit(5000)

    if (Array.isArray(wasteRows)) {
      waste = wasteRows.map((w) => ({
        tanggal: w.tanggal,
        kategori: w.kategori,
        berat_kg: Number(w.berat_kg)
      }))
    }
  }

  try {
    return await callLocalAi('/analyze/menu-correlation', { menu, waste })
  } catch (err) {
    return { error: true, message: err.message }
  }
}

module.exports = { getWastePrediction, getMenuCorrelation }