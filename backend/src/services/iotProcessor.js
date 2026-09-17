const supabase = require('../config/supabase')
const { detectFoodWaste } = require('./roboflowService')
const evaluateChamberConditions = require('./sensorEvaluationService')

function isoWeekLabel(tanggal) {
  const d = new Date(`${tanggal}T00:00:00`)
  const dayNum = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dayNum + 3)
  const firstThursday = new Date(d.getFullYear(), 0, 4)
  const firstDayNum = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3)
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000))
  return `Minggu ${week}`
}

async function processSmartContainer(imageBuffer, totalBeratKg) {
  const hasil = await detectFoodWaste(imageBuffer, totalBeratKg)

  if (supabase) {
    const tanggal = new Date().toISOString().slice(0, 10)
    const minggu = isoWeekLabel(tanggal)
    const rows = hasil.deteksi.map((d) => ({
      tanggal,
      minggu,
      kategori: d.kategori,
      berat_kg: d.beratKg
    }))

    const { error } = await supabase.from('waste_records').insert(rows)
    if (error) {
      return { status: 'gagal', message: error.message, totalBeratKg, deteksi: [] }
    }
  }

  return {
    status: 'sukses',
    message: 'Selesai! Terima Kasih',
    totalBeratKg,
    mode: hasil.mode,
    deteksi: hasil.deteksi
  }
}

async function processChamber({
  batchId,
  suhuBilikC,
  kelembabanPersen,
  kadarAmoniaPpm,
  suhuSubstratC,
  beratMaggotPanenKg
}) {
  const evaluasi = evaluateChamberConditions({ suhuBilikC, kelembabanPersen, kadarAmoniaPpm, suhuSubstratC })

  if (supabase) {
    const { error } = await supabase.from('sensor_readings').insert({
      suhu_bilik_c: suhuBilikC,
      kelembaban_persen: kelembabanPersen,
      kadar_amonia_ppm: kadarAmoniaPpm,
      suhu_substrat_c: suhuSubstratC,
      estimasi_berat_maggot_kg: beratMaggotPanenKg,
      batch_id: batchId || null
    })

    if (error) {
      return { aman: false, tersimpan: false, rekomendasi: error.message }
    }
  }

  return { aman: evaluasi.aman, rekomendasi: evaluasi.rekomendasi, tersimpan: true }
}

module.exports = { processSmartContainer, processChamber }