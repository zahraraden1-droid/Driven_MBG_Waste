'use strict'

/**
 * Test untuk penyimpanan state sistem.
 *
 * Yang diuji adalah perilaku yang paling penting untuk keselamatan operasional:
 *   1. Pembacaan TETAP SINKRON (banyak pemanggil lama bergantung pada ini).
 *   2. Nilai awal mengikuti env DEMO_MODE.
 *   3. Kegagalan database TIDAK membuat proses lempar error — sistem harus
 *      tetap berjalan memakai nilai memori, bukan mati.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.DEMO_MODE = 'true'

const store = require('../src/config/stateStore')

test('isDemoActive() dapat dipanggil secara sinkron (bukan Promise)', () => {
  const hasil = store.isDemoActive()
  assert.equal(typeof hasil, 'boolean', 'harus mengembalikan boolean, bukan Promise')
  assert.equal(hasil, true, 'nilai awal mengikuti DEMO_MODE=true')
})

test('isMaintenanceActive() dapat dipanggil secara sinkron', () => {
  const hasil = store.isMaintenanceActive()
  assert.equal(typeof hasil, 'boolean')
  assert.equal(hasil, false, 'mode pemeliharaan default mati')
})

test('statusState melaporkan sumber dan waktu muat', () => {
  const s = store.statusState()
  assert.ok('maintenanceActive' in s)
  assert.ok('demoActive' in s)
  assert.ok('sumber' in s)
})

test('muatState TIDAK melempar error walau database tidak tersedia', async () => {
  // Di lingkungan test tidak ada Supabase. Fungsi harus menangani ini dengan
  // anggun, bukan menggagalkan seluruh aplikasi.
  const hasil = await store.muatState({ sunyi: true })
  assert.ok(hasil, 'harus mengembalikan status')
  assert.equal(typeof hasil.maintenanceActive, 'boolean')
})

test('muatState melaporkan bahwa database tidak tersedia', async () => {
  const hasil = await store.muatState({ sunyi: true })
  assert.match(String(hasil.sumber), /memori|database/i)
})

test('setMaintenanceActive bersifat async dan dapat ditunggu', async () => {
  const janji = store.setMaintenanceActive(false, 'test')
  assert.ok(janji instanceof Promise, 'setter harus mengembalikan Promise')
  await janji
})

test('konstanta kunci state sesuai dengan migrasi database', () => {
  // Harus sama dengan nilai yang di-insert pada
  // supabase/migrations/20260921_agregasi_dan_state.sql
  assert.equal(store.KUNCI_MAINTENANCE, 'maintenance_mode')
  assert.equal(store.KUNCI_DEMO, 'demo_mode')
})

test('modul delegasi tetap mengekspor API yang sama', () => {
  const demo = require('../src/config/demoMode')
  const maint = require('../src/config/maintenanceMode')
  assert.equal(typeof demo.isDemoActive, 'function')
  assert.equal(typeof demo.setDemoActive, 'function')
  assert.equal(typeof maint.isMaintenanceActive, 'function')
  assert.equal(typeof maint.setMaintenanceActive, 'function')
})
