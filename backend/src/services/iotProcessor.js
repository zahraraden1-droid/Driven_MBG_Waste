const crypto = require('node:crypto')
const supabase = require('../config/supabase')
const { detectFoodWaste, SKEMA_BERAT, CONFIDENCE_THRESHOLD } = require('./roboflowService')
const evaluateChamberConditions = require('./sensorEvaluationService')
const { tandai, selesaikan } = require('../config/latencyTrace')

const NODE_ENV = process.env.NODE_ENV || 'development'

// Apakah hasil mode 'mock' boleh disimpan ke tabel produksi?
// Default: TIDAK. Sebelum perbaikan ini, hasil mock disimpan apa adanya
// sehingga data simulasi bercampur dengan data nyata tanpa jejak. Izinkan
// hanya bila secara sadar diaktifkan lewat env (mis. untuk demo/staging).
const MOCK_ALLOW_PERSIST = process.env.MOCK_ALLOW_PERSIST === 'true'

/**
 * Label minggu ISO-8601 yang MENYERTAKAN TAHUN.
 * Sebelumnya hanya "Minggu 38", sehingga Minggu 1/2026 dan Minggu 1/2027
 * bertabrakan ketika dashboard mengelompokkan tren per label minggu.
 */
function isoWeekLabel(tanggal) {
  const d = new Date(`${tanggal}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null

  // Algoritma minggu ISO: Kamis pada minggu tsb menentukan tahunnya.
  const hari = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const hariKe = (hari.getUTCDay() + 6) % 7 // Senin = 0
  hari.setUTCDate(hari.getUTCDate() - hariKe + 3)

  const tahunISO = hari.getUTCFullYear()
  const kamisPertama = new Date(Date.UTC(tahunISO, 0, 4))
  const hariKeKamis = (kamisPertama.getUTCDay() + 6) % 7
  kamisPertama.setUTCDate(kamisPertama.getUTCDate() - hariKeKamis + 3)

  const minggu =
    1 + Math.round((hari.getTime() - kamisPertama.getTime()) / (7 * 24 * 3600 * 1000))
  return `${tahunISO}-M${String(minggu).padStart(2, '0')}`
}

async function processSmartContainer(imageBuffer, totalBeratKg, trace = null) {
  // Instrumentasi berjenjang: menandai tahap utama rantai pemrosesan sehingga
  // distribusi latency dapat dihitung dari data, bukan dari satu kali
  // pengukuran manual. Aman dipanggil tanpa trace (pemanggil lama).
  tandai(trace, 'inferensiMulai')
  const hasil = await detectFoodWaste(imageBuffer, totalBeratKg)
  tandai(trace, 'inferensiSelesai')

  const beratTotal = Number(totalBeratKg)
  const mode = hasil.mode
  const isSimulated = mode !== 'roboflow'

  const lanjutSimpan = () => {
    if (!supabase) return { boleh: false, alasan: 'Supabase tidak dikonfigurasi' }
    if (!Number.isFinite(beratTotal) || beratTotal <= 0) {
      return { boleh: false, alasan: 'totalBeratKg tidak valid atau nol (load cell gagal dibaca)' }
    }
    if (!hasil.deteksi || hasil.deteksi.length === 0) {
      return { boleh: false, alasan: 'tidak ada deteksi' }
    }
    if (isSimulated && !MOCK_ALLOW_PERSIST) {
      return {
        boleh: false,
        alasan: `hasil mode '${mode}' tidak disimpan (${hasil.catatan || 'tanpa keterangan'})`
      }
    }
    return { boleh: true }
  }

  const keputusan = lanjutSimpan()

  if (keputusan.boleh) {
    const tanggal = new Date().toISOString().slice(0, 10)
    const minggu = isoWeekLabel(tanggal)
    // Satu sesi penimbangan = satu sesi_id, dipakai untuk mengelompokkan
    // rincian per kelas di tabel waste_record_kelas.
    const sesiId = crypto.randomUUID()

    const rows = hasil.deteksi.map((d) => ({
      tanggal,
      minggu,
      kategori: d.kategori,
      berat_kg: d.beratKg,
      // --- provenance ---
      sumber: mode === 'roboflow' ? 'roboflow' : 'mock',
      is_simulated: isSimulated,
      estimasi_mode: mode,
      kelas: d.kelas ? String(d.kelas) : null,
      model_versi: hasil.modelVersi || null,
      confidence_rata_rata: hasil.confidenceRataRata,
      skema_berat: hasil.skemaBerat || SKEMA_BERAT
    }))

    const { error } = await supabase.from('waste_records').insert(rows)
    tandai(trace, 'simpanUtamaSelesai')
    if (error) {
      selesaikan(trace, { sukses: false, keterangan: `insert gagal: ${error.message}` })
      return { status: 'gagal', message: error.message, totalBeratKg: beratTotal, deteksi: [] }
    }

    // Rincian per kelas (tabel opsional; kegagalan di sini tidak menggagalkan sesi)
    const rincian = hasil.deteksi.map((d) => ({
      sesi_id: sesiId,
      tanggal,
      minggu,
      kelas: d.kelas ? String(d.kelas) : null,
      kategori: d.kategori,
      berat_kg: d.beratKg,
      proporsi: d.proporsi,
      confidence: d.confidence,
      luas_piksel: d.luasPiksel,
      skema_berat: hasil.skemaBerat || SKEMA_BERAT,
      is_simulated: isSimulated
    }))
    const { error: errRincian } = await supabase.from('waste_record_kelas').insert(rincian)
    tandai(trace, 'simpanRincianSelesai')
    if (errRincian) {
      console.warn(
        '[processSmartContainer] rincian per kelas gagal disimpan (kegagalan ini tidak menggagalkan sesi):',
        errRincian.message
      )
    }
  }

  // Tutup pelacakan latency. Keterangan membedakan sesi yang tersimpan dari
  // yang ditolak (mis. karena data simulasi), agar statistik tidak mencampur
  // keduanya.
  selesaikan(trace, {
    sukses: true,
    keterangan: keputusan.boleh ? `tersimpan (${mode})` : `tidak disimpan: ${keputusan.alasan}`
  })

  return {
    status: 'sukses',
    message: 'Selesai! Terima Kasih',
    totalBeratKg: beratTotal,
    mode,
    tersimpan: keputusan.boleh,
    catatanSimpan: keputusan.boleh ? null : keputusan.alasan,
    skemaBerat: hasil.skemaBerat || SKEMA_BERAT,
    catatan: hasil.catatan || null,
    deteksi: hasil.deteksi
  }
}

// ---------------------------------------------------------------------------
// Cache batch aktif.
//
// Alasan: pengukuran nyata menunjukkan pencarian batch aktif memakan ~411 ms
// dari total ~924 ms rantai telemetri, padahal nilainya jarang berubah
// (batch aktif di produksi bertahan berhari-hari). Setiap siklus telemetri
// (30 detik) mengulang query yang sama tanpa manfaat.
//
// Cache ini TIDAK mengubah kebenaran data: bila batch berganti atau cache
// kedaluwarsa, nilai dibaca ulang dari database. Bila pembacaan gagal, cache
// lama TIDAK dipakai — lebih baik batch_id null daripada tertaut ke batch yang
// salah.
// ---------------------------------------------------------------------------
const TTL_BATCH_MS = Number(process.env.BATCH_CACHE_MS || 60000)
let cacheBatch = { id: undefined, waktu: 0 }

async function ambilBatchAktif() {
  const sekarang = Date.now()
  if (cacheBatch.id !== undefined && sekarang - cacheBatch.waktu < TTL_BATCH_MS) {
    return cacheBatch.id
  }

  const { data, error } = await supabase
    .from('maggot_batches')
    .select('id')
    .neq('status', 'selesai_panen')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    // Jangan pakai nilai cache lama bila pembacaan gagal.
    console.warn('[processChamber] gagal membaca batch aktif:', error.message)
    return null
  }

  const id = data && data.length ? data[0].id : null
  cacheBatch = { id, waktu: sekarang }
  return id
}

/** Mengosongkan cache batch (dipakai test dan saat batch ditandai panen). */
function kosongkanCacheBatch() {
  cacheBatch = { id: undefined, waktu: 0 }
}

async function processChamber({
  batchId,
  suhuBilikC,
  kelembabanPersen,
  kadarAmoniaPpm,
  suhuSubstratC,
  beratMaggotPanenKg
}, trace = null) {
  const evaluasi = evaluateChamberConditions({ suhuBilikC, kelembabanPersen, kadarAmoniaPpm, suhuSubstratC })

  // Validasi kelengkapan: jangan simpan baris yang seluruh nilai sensornya kosong.
  // Sebelum perbaikan ini, payload berisi null tetap disimpan sehingga database
  // berisi baris tanpa satu pun pengukuran (terbukti: 32 dari 32 baris null).
  const nilai = {
    suhu_bilik_c: suhuBilikC,
    kelembaban_persen: kelembabanPersen,
    kadar_amonia_ppm: kadarAmoniaPpm,
    suhu_substrat_c: suhuSubstratC,
    estimasi_berat_maggot_kg: beratMaggotPanenKg
  }
  const adaNilai = Object.values(nilai).some(
    (v) => v !== null && v !== undefined && Number.isFinite(Number(v))
  )

  if (!adaNilai) {
    selesaikan(trace, {
      sukses: false,
      keterangan: 'tidak disimpan: seluruh nilai sensor kosong (payload null)'
    })
    return {
      aman: false,
      tersimpan: false,
      alasan: 'tidak disimpan: seluruh nilai sensor kosong (payload null)',
      rekomendasi: evaluasi.rekomendasi
    }
  }

  if (supabase) {
    tandai(trace, 'cariBatchMulai')
    let batchTerpakai = batchId || null
    if (!batchTerpakai) {
      batchTerpakai = await ambilBatchAktif()
    }
    tandai(trace, 'cariBatchSelesai')

    const { error } = await supabase.from('sensor_readings').insert({
      ...nilai,
      batch_id: batchTerpakai
    })
    tandai(trace, 'simpanSelesai')

    if (error) {
      selesaikan(trace, { sukses: false, keterangan: `insert gagal: ${error.message}` })
      return { aman: false, tersimpan: false, rekomendasi: error.message }
    }
  }

  selesaikan(trace, { sukses: true, keterangan: 'telemetri tersimpan' })

  return {
    aman: evaluasi.aman,
    rekomendasi: evaluasi.rekomendasi,
    tersimpan: true,
    // Ambang confidence yang sedang berlaku, diteruskan agar dapat diaudit
    ambangConfidence: CONFIDENCE_THRESHOLD
  }
}

module.exports = {
  processSmartContainer,
  processChamber,
  isoWeekLabel,
  kosongkanCacheBatch,
  MOCK_ALLOW_PERSIST,
  NODE_ENV
}
