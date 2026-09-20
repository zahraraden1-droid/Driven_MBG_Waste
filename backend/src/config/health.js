/*
 * Pemeriksaan kesehatan dependensi.
 *
 * Sebelumnya /health hanya mengembalikan { status: 'ok' } tanpa memeriksa
 * apa pun, sehingga orchestrator menganggap layanan sehat walaupun database
 * atau MQTT sudah mati — dan itu pernah terjadi tanpa terdeteksi (32 baris
 * telemetri tersimpan tanpa satu pun nilai sensor).
 *
 * Dua endpoint dengan tanggung jawab berbeda:
 *   /health        liveness  -> proses hidup. TIDAK memeriksa dependensi.
 *   /health/ready  readiness -> dependensi benar-benar dapat dipakai.
 *
 * Pemisahan ini penting: bila readiness dipakai sebagai liveness, layanan
 * akan di-restart berulang hanya karena database sedang lambat.
 */

const supabase = require('./supabase')
const { getClient } = require('./mqtt')

async function periksaSupabase(timeoutMs = 4000) {
  if (!supabase) {
    return { ok: false, pesan: 'Supabase tidak dikonfigurasi' }
  }
  const mulai = Date.now()
  try {
    const hasil = await Promise.race([
      supabase.from('waste_records').select('id').limit(1),
      new Promise((_, tolak) =>
        setTimeout(() => tolak(new Error('timeout')), timeoutMs)
      )
    ])
    if (hasil.error) {
      return { ok: false, pesan: hasil.error.message, durasiMs: Date.now() - mulai }
    }
    return { ok: true, durasiMs: Date.now() - mulai }
  } catch (err) {
    return { ok: false, pesan: err.message, durasiMs: Date.now() - mulai }
  }
}

function periksaMqtt() {
  const client = getClient()
  if (!client) {
    return { ok: false, pesan: 'MQTT tidak diaktifkan (MQTT_URL kosong)' }
  }
  return {
    ok: Boolean(client.connected),
    pesan: client.connected ? 'terhubung' : 'terputus'
  }
}

/**
 * Ringkasan kesegaran data: apakah sistem masih menerima data.
 * Ini menangkap kondisi "proses hidup tetapi tidak ada data masuk", yang
 * TIDAK terdeteksi oleh health check biasa.
 */
async function periksaKesegaranData() {
  if (!supabase) return null
  try {
    const [sensor, waste] = await Promise.all([
      supabase
        .from('sensor_readings')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('waste_records')
        .select('created_at')
        .eq('is_simulated', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])
    const terakhirSensor = sensor.data?.created_at || null
    const terakhirLimbah = waste.data?.created_at || null
    const umur = (iso) =>
      iso ? Math.round((Date.now() - new Date(iso).getTime()) / 1000) : null
    return {
      sensorTerakhir: terakhirSensor,
      sensorUmurDetik: umur(terakhirSensor),
      limbahNyataTerakhir: terakhirLimbah,
      limbahUmurDetik: umur(terakhirLimbah)
    }
  } catch {
    return null
  }
}

/**
 * Menjalankan seluruh pemeriksaan dan mengembalikan status agregat.
 * status: 'ready' | 'degraded' | 'not-ready'
 */
async function periksaKesiapan() {
  const [db, mqtt, kesegaran] = await Promise.all([
    periksaSupabase(),
    Promise.resolve(periksaMqtt()),
    periksaKesegaranData()
  ])

  let status = 'ready'
  if (!db.ok) status = 'not-ready'
  // MQTT mati berarti perangkat tidak dapat mengirim data: terdegradasi,
  // tetapi proses masih dapat melayani permintaan HTTP.
  else if (!mqtt.ok) status = 'degraded'

  return {
    status,
    dependensi: { supabase: db, mqtt },
    kesegaranData: kesegaran,
    waktu: new Date().toISOString()
  }
}

module.exports = { periksaKesiapan, periksaSupabase, periksaMqtt, periksaKesegaranData }
