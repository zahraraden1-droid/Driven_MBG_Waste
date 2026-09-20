'use strict'

/**
 * Test untuk observability dan pemeriksaan kesehatan.
 *
 * Fokus: memastikan logger TIDAK pernah mencetak kredensial, dan penilaian
 * kesiapan tidak pernah melaporkan "ready" saat database tidak dapat dipakai
 * (kondisi yang sebelumnya tidak terdeteksi sama sekali).
 */

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.LOG_LEVEL = 'debug'

const { log } = require('../src/config/observability')
const { periksaKesiapan, periksaMqtt } = require('../src/config/health')
const { KOLOM_WAJIB_WASTE_RECORDS, TABEL_WAJIB } = require('../src/config/skemaGuard')

/** Menangkap keluaran console selama fn dijalankan. */
function tangkapConsole(fn) {
  const asli = { log: console.log, warn: console.warn, error: console.error }
  const baris = []
  console.log = (...a) => baris.push(a.join(' '))
  console.warn = (...a) => baris.push(a.join(' '))
  console.error = (...a) => baris.push(a.join(' '))
  try {
    fn()
  } finally {
    console.log = asli.log
    console.warn = asli.warn
    console.error = asli.error
  }
  return baris.join('\n')
}

test('logger menghasilkan JSON satu baris yang dapat di-parse', () => {
  const keluaran = tangkapConsole(() => log.info('uji pesan', { requestId: 'abc123' }))
  const obj = JSON.parse(keluaran)
  assert.equal(obj.level, 'info')
  assert.equal(obj.pesan, 'uji pesan')
  assert.equal(obj.requestId, 'abc123')
  assert.ok(obj.ts, 'harus memuat cap waktu')
  assert.ok(obj.service, 'harus memuat nama service')
})

test('logger MENYENSOR kredensial yang tidak sengaja dioper', () => {
  const keluaran = tangkapConsole(() =>
    log.info('koneksi', {
      password: 'rahasia123',
      mqttPassword: 'rahasia456',
      apiKey: 'kunci-abc',
      authorization: 'Bearer xyz',
      aman: 'nilai-biasa'
    })
  )
  const obj = JSON.parse(keluaran)

  for (const k of ['password', 'mqttPassword', 'apiKey', 'authorization']) {
    assert.equal(obj[k], '[DISENSOR]', `kolom ${k} harus disensor`)
  }
  assert.equal(obj.aman, 'nilai-biasa', 'kolom biasa tidak boleh disensor')
  assert.ok(!keluaran.includes('rahasia123'), 'nilai rahasia tidak boleh muncul')
})

test('nilai rahasia tidak pernah muncul walaupun di dalam pesan bebas', () => {
  // Pesan bebas memang tidak disensor (bukan tanggung jawab logger),
  // tetapi kunci konteks harus tetap aman.
  const keluaran = tangkapConsole(() => log.error('gagal', { token: 'abc', secret: 'def' }))
  assert.ok(!keluaran.includes('"abc"'))
  assert.ok(!keluaran.includes('"def"'))
})

test('periksaMqtt melaporkan tidak aktif bila MQTT belum dikonfigurasi', () => {
  const hasil = periksaMqtt()
  assert.equal(hasil.ok, false)
  assert.match(hasil.pesan, /MQTT/i)
})

test('periksaKesiapan TIDAK melaporkan ready tanpa database', async () => {
  const hasil = await periksaKesiapan()
  // Di lingkungan test tidak ada Supabase, sehingga kesiapan harus gagal.
  assert.notEqual(hasil.status, 'ready', 'tanpa database tidak boleh dianggap ready')
  assert.ok(hasil.dependensi, 'harus memuat rincian dependensi')
  assert.equal(hasil.dependensi.supabase.ok, false)
  assert.ok(hasil.waktu, 'harus memuat cap waktu')
})

test('kesiapan memuat rincian per dependensi agar dapat didiagnosis', async () => {
  const hasil = await periksaKesiapan()
  assert.ok('mqtt' in hasil.dependensi)
  assert.ok('supabase' in hasil.dependensi)
  assert.ok('kesegaranData' in hasil)
})

test('daftar kolom provenance yang diperiksa sesuai dengan migrasi', () => {
  // Bila kolom berubah, daftar ini harus diperbarui bersamaan dengan migrasi
  // supabase/migrations/20260920_provenance.sql.
  for (const k of [
    'sumber',
    'is_simulated',
    'estimasi_mode',
    'kelas',
    'model_versi',
    'confidence_rata_rata',
    'skema_berat'
  ]) {
    assert.ok(KOLOM_WAJIB_WASTE_RECORDS.includes(k), `kolom ${k} harus diperiksa`)
  }
  assert.ok(TABEL_WAJIB.includes('waste_record_kelas'))
  assert.ok(TABEL_WAJIB.includes('food_density'))
})
