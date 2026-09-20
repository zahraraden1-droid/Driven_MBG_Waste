'use strict'

/**
 * Test jejak audit.
 *
 * Prioritas pengujian:
 *   1. Nilai sensitif TIDAK boleh tersimpan ke jejak audit. Jejak audit dibaca
 *      manusia dan disimpan lama, sehingga kredensial yang bocor ke sana akan
 *      bertahan jauh lebih lama daripada di log.
 *   2. Kegagalan audit TIDAK boleh menggagalkan operasi utama. Bila database
 *      tidak tersedia, perintah perangkat tetap harus berjalan.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.LOG_LEVEL = 'error'

const { catatAudit, bersihkanDetail, auditTersedia } = require('../src/config/auditTrail')

// ---------------------------------------------------------------------------
// Penyensoran
// ---------------------------------------------------------------------------

test('menyensor password', () => {
  const h = bersihkanDetail({ password: 'rahasia123' })
  assert.equal(h.password, '[DISENSOR]')
})

test('menyensor berbagai variasi nama kredensial', () => {
  const h = bersihkanDetail({
    secret: 'a',
    mqttPassword: 'b',
    apiKey: 'c',
    api_key: 'd',
    authorization: 'Bearer xyz',
    token: 'e',
    aman: 'nilai-biasa'
  })

  for (const k of ['secret', 'mqttPassword', 'apiKey', 'api_key', 'authorization', 'token']) {
    assert.equal(h[k], '[DISENSOR]', `kolom ${k} harus disensor`)
  }
  assert.equal(h.aman, 'nilai-biasa', 'kolom biasa tidak boleh disensor')
})

test('menyensor kredensial yang bersarang di dalam objek', () => {
  const h = bersihkanDetail({ konfigurasi: { mqttPassword: 'rahasia', host: 'broker.local' } })
  assert.equal(h.konfigurasi.mqttPassword, '[DISENSOR]')
  assert.equal(h.konfigurasi.host, 'broker.local')
})

test('TIDAK menyensor array (mis. daftar id)', () => {
  const h = bersihkanDetail({ ids: ['a', 'b'], password: 'x' })
  assert.deepEqual(h.ids, ['a', 'b'])
  assert.equal(h.password, '[DISENSOR]')
})

test('nilai null dan primitif ditangani dengan aman', () => {
  assert.equal(bersihkanDetail(null), null)
  assert.equal(bersihkanDetail(undefined), null)
  assert.deepEqual(bersihkanDetail('teks'), { nilai: 'teks' })
  assert.deepEqual(bersihkanDetail(42), { nilai: '42' })
})

// ---------------------------------------------------------------------------
// Ketahanan: audit tidak boleh menggagalkan operasi utama
// ---------------------------------------------------------------------------

test('catatAudit TIDAK melempar error walau database tidak tersedia', async () => {
  // Di lingkungan test tidak ada Supabase. Fungsi harus menangani ini dengan
  // anggun — perintah perangkat tidak boleh gagal hanya karena audit gagal.
  const hasil = await catatAudit({
    req: null,
    aksi: 'uji.aksi',
    target: 'uji',
    detail: { nilai: 1 }
  })
  assert.ok(typeof hasil === 'object')
  assert.equal(hasil.tersimpan, false, 'tanpa database, audit tidak tersimpan')
})

test('catatAudit menerima req null tanpa error', async () => {
  await assert.doesNotReject(() =>
    catatAudit({ aksi: 'uji.tanpa.req', target: null, detail: null })
  )
})

test('catatAudit mengambil identitas pelaku dari req bila tersedia', async () => {
  // Tidak ada database, jadi kita hanya memastikan tidak melempar error
  // ketika req memuat data pengguna.
  const reqPalsu = {
    user: { id: 'u1', email: 'admin@sekolah.id', role: 'superadmin' },
    requestId: 'abc123',
    ip: '127.0.0.1'
  }
  await assert.doesNotReject(() =>
    catatAudit({ req: reqPalsu, aksi: 'uji.pelaku', target: 'x' })
  )
})

test('auditTersedia melaporkan status dengan benar', () => {
  // Tanpa Supabase, audit tidak dapat tersedia.
  assert.equal(auditTersedia(), false)
})
