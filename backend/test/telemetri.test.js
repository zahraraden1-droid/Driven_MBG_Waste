'use strict'

/**
 * Test untuk label minggu ISO dan validasi payload telemetri.
 *
 * Kasus `2026-09-19` dikunci berdasarkan DATA PRODUKSI NYATA: baris lama
 * berlabel "Minggu 38", dan label baru harus setara secara semantik
 * yaitu "2026-M38" (bukan M39 atau tahun lain).
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const { isoWeekLabel, processChamber } = require('../src/services/iotProcessor')

test('isoWeekLabel menyertakan tahun', () => {
  const label = isoWeekLabel('2026-09-19')
  assert.ok(/^\d{4}-M\d{2}$/.test(label), `format salah: ${label}`)
  assert.equal(label, '2026-M38', 'harus sama dengan label lama "Minggu 38" untuk 2026')
})

test('isoWeekLabel menabrak tahun dengan benar di awal Januari', () => {
  // 1 Januari 2027 (Jumat) masih termasuk minggu ISO terakhir 2026.
  assert.equal(isoWeekLabel('2027-01-01'), '2026-M53')
})

test('isoWeekLabel menangani tanggal tidak valid tanpa melempar error', () => {
  assert.equal(isoWeekLabel('bukan-tanggal'), null)
  assert.equal(isoWeekLabel(''), null)
})

test('label minggu berbeda tahun untuk tanggal yang sama di minggu ke-1', () => {
  const a = isoWeekLabel('2026-01-01')
  const b = isoWeekLabel('2027-01-04')
  assert.notEqual(a, b, 'label harus dapat dibedakan antar tahun')
})

test('processChamber MENOLAK payload yang seluruh sensor bernilai null', async () => {
  const hasil = await processChamber({
    batchId: null,
    suhuBilikC: null,
    kelembabanPersen: null,
    kadarAmoniaPpm: null,
    suhuSubstratC: null,
    beratMaggotPanenKg: null
  })

  assert.equal(hasil.tersimpan, false, 'payload kosong tidak boleh disimpan')
  assert.match(String(hasil.alasan), /kosong|null/i)
})

test('processChamber mengevaluasi kondisi aman dari nilai sensor valid', async () => {
  const hasil = await processChamber({
    batchId: null,
    suhuBilikC: 28,
    kelembabanPersen: 70,
    kadarAmoniaPpm: 5,
    suhuSubstratC: 32,
    beratMaggotPanenKg: 1.2
  })

  // Tanpa Supabase terkonfigurasi di lingkungan test, fungsi hanya mengevaluasi.
  assert.equal(hasil.aman, true, 'kondisi dalam rentang ideal harus dinilai aman')
})

test('processChamber menandai kondisi di luar rentang sebagai perlu perhatian', async () => {
  const hasil = await processChamber({
    batchId: null,
    suhuBilikC: 40, // di atas 32
    kelembabanPersen: 50, // di bawah 60
    kadarAmoniaPpm: 30, // di atas 15
    suhuSubstratC: 40, // di atas 36
    beratMaggotPanenKg: 1.2
  })

  assert.equal(hasil.aman, false)
  assert.ok(typeof hasil.rekomendasi === 'string' && hasil.rekomendasi.length > 0)
})

// ---------------------------------------------------------------------------
// Regresi: nilai kosong TIDAK boleh diperlakukan sebagai pembacaan 0.
//
// Sebelum diperbaiki, `Number(null) === 0` membuat sensor yang tidak terbaca
// dinilai sebagai 0 °C / 0 %, sehingga sistem mengeluarkan rekomendasi palsu
// seperti "suhu bilik terlalu dingin" dan "kelembaban saat ini 0%".
// ---------------------------------------------------------------------------

test('evaluasi: semua sensor null TIDAK menghasilkan rekomendasi palsu', async () => {
  const hasil = await processChamber({
    batchId: null,
    suhuBilikC: null,
    kelembabanPersen: null,
    kadarAmoniaPpm: null,
    suhuSubstratC: null,
    beratMaggotPanenKg: null
  })

  assert.equal(hasil.tersimpan, false, 'payload kosong tidak disimpan')
  assert.equal(
    hasil.rekomendasi,
    null,
    'tanpa data tidak boleh ada rekomendasi — dulu muncul "suhu 0°C"'
  )
})

test('evaluasi: string kosong juga dianggap tidak ada nilai', async () => {
  const hasil = await processChamber({
    batchId: null,
    suhuBilikC: '',
    kelembabanPersen: '',
    kadarAmoniaPpm: '',
    suhuSubstratC: '',
    beratMaggotPanenKg: null
  })

  assert.equal(hasil.rekomendasi, null)
})

test('evaluasi: nilai 0 yang ASLI tetap dinilai sebagai kondisi bermasalah', async () => {
  // Berbeda dari null: 0 adalah pembacaan sah yang memang di luar rentang ideal.
  const hasil = await processChamber({
    batchId: null,
    suhuBilikC: 0,
    kelembabanPersen: 70,
    kadarAmoniaPpm: 5,
    suhuSubstratC: 31,
    beratMaggotPanenKg: null
  })

  assert.equal(hasil.aman, false, '0 °C harus dinilai sebagai kondisi dingin')
  assert.match(String(hasil.rekomendasi), /dingin/i)
})
