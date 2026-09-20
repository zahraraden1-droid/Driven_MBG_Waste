'use strict'

/**
 * Test keamanan & ketahanan ekspor CSV.
 *
 * Dua hal yang diuji:
 *   1. CSV injection (formula injection). Nilai yang diawali `=`, `+`, `-`,
 *      atau `@` akan DIEKSEKUSI sebagai rumus oleh Excel/Google Sheets.
 *      Nilai kategori berasal dari deteksi model, dan catatan berasal dari
 *      input pengguna — keduanya tidak boleh dipercaya.
 *   2. Escaping struktur CSV. Tanpa escaping, nilai yang memuat koma atau
 *      tanda kutip akan menggeser kolom dan merusak seluruh berkas.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const { selCsv, toCsv } = require('../src/routes/reports')

// ---------------------------------------------------------------------------
// Helper: membaca kembali satu sel seperti yang dilakukan spreadsheet
// ---------------------------------------------------------------------------

/**
 * Mengurai satu sel CSV hasil selCsv() menjadi nilai sebagaimana yang akan
 * dibaca spreadsheet: kutip pembungkus dilepas, kutip ganda dikembalikan
 * menjadi satu.
 *
 * Diperlukan karena sel yang memuat koma ATAU kutip akan dibungkus kutip ganda
 * (aturan CSV), sehingga karakter pertama pada berkas bisa berupa `"` dan
 * bukan `'`. Yang harus diuji adalah NILAI yang terbaca, bukan bentuk mentahnya.
 */
function nilaiTerbaca(sel) {
  let s = String(sel)
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"')
  }
  return s
}

// ---------------------------------------------------------------------------
// CSV injection
// ---------------------------------------------------------------------------

test('menetralkan serangan HYPERLINK yang diawali "="', () => {
  const jahat = '=HYPERLINK("http://jahat.example","klik saya")'
  const terbaca = nilaiTerbaca(selCsv(jahat))

  assert.ok(terbaca.startsWith("'="), `harus diawali kutip tunggal, dapat: ${terbaca}`)
  assert.ok(
    !/^[=+\-@\t\r]/.test(terbaca),
    'nilai yang terbaca TIDAK boleh dimulai dengan karakter pemicu rumus'
  )
  assert.ok(terbaca.includes('HYPERLINK'), 'isi aslinya tetap ada sebagai teks')
})

test('menetralkan nilai yang diawali "+"', () => {
  assert.ok(nilaiTerbaca(selCsv('+1+1')).startsWith("'"), 'harus dinetralkan')
})

test('menetralkan nilai yang diawali "-" (mis. rumus pengurangan)', () => {
  assert.ok(nilaiTerbaca(selCsv('-2+3')).startsWith("'"), 'harus dinetralkan')
})

test('menetralkan nilai yang diawali "@"', () => {
  assert.ok(nilaiTerbaca(selCsv('@SUM(A1:A9)')).startsWith("'"), 'harus dinetralkan')
})

test('menetralkan DDE payload yang memakai karakter kontrol', () => {
  assert.ok(nilaiTerbaca(selCsv('\t=cmd|\' /c calc\'!A0')).startsWith("'"), 'harus dinetralkan')
})

test('nilai berbahaya yang juga memuat koma tetap aman setelah diurai', () => {
  // Kasus gabungan: formula + koma. Sel akan dibungkus kutip ganda oleh aturan
  // CSV, sehingga yang menentukan keamanan adalah nilai setelah diurai.
  const terbaca = nilaiTerbaca(selCsv('=cmd|"/c calc"!A0,x'))
  assert.ok(!/^[=+\-@\t\r]/.test(terbaca), `tidak boleh diawali pemicu rumus: ${terbaca}`)
  assert.ok(terbaca.startsWith("'"), 'harus ada penetralan')
})

test('TIDAK mengubah nilai normal (tidak ada positif palsu berlebihan)', () => {
  assert.equal(selCsv('nasi'), 'nasi')
  assert.equal(selCsv('sayur'), 'sayur')
  assert.equal(selCsv('2026-09-19'), '2026-09-19')
  assert.equal(selCsv('2026-M38'), '2026-M38')
  assert.equal(selCsv('0.021'), '0.021')
})

test('angka negatif tetap terbaca sebagai angka oleh manusia', () => {
  // Nilai negatif sah secara data; yang penting tidak dieksekusi sebagai rumus.
  const hasil = selCsv(-5)
  assert.ok(hasil.startsWith("'"), 'dinetralkan agar tidak dieksekusi')
  assert.ok(hasil.includes('-5'), 'nilainya tetap terlihat')
})

// ---------------------------------------------------------------------------
// Escaping struktur CSV
// ---------------------------------------------------------------------------

test('membungkus nilai yang memuat koma', () => {
  assert.equal(selCsv('nasi, sayur'), '"nasi, sayur"')
})

test('menggandakan tanda kutip di dalam nilai', () => {
  assert.equal(selCsv('menu "spesial"'), '"menu ""spesial"""')
})

test('membungkus nilai yang memuat baris baru', () => {
  const hasil = selCsv('baris1\nbaris2')
  assert.ok(hasil.startsWith('"') && hasil.endsWith('"'))
})

test('null dan undefined menjadi sel kosong', () => {
  assert.equal(selCsv(null), '')
  assert.equal(selCsv(undefined), '')
})

// ---------------------------------------------------------------------------
// Seluruh berkas
// ---------------------------------------------------------------------------

test('toCsv menghasilkan header dan baris yang benar', () => {
  const csv = toCsv(
    [
      { tanggal: '2026-09-19', minggu: '2026-M38', kategori: 'nasi', beratKg: 0.021 },
      { tanggal: '2026-09-19', minggu: '2026-M38', kategori: 'sayur', beratKg: 0.073 }
    ],
    ['tanggal', 'minggu', 'kategori', 'beratKg']
  )

  const baris = csv.trim().split('\n')
  assert.equal(baris.length, 3, 'header + 2 baris')
  assert.equal(baris[0], 'tanggal,minggu,kategori,beratKg')
  assert.equal(baris[1], '2026-09-19,2026-M38,nasi,0.021')
})

test('toCsv menetralkan serangan pada data, bukan hanya pada sel', () => {
  const csv = toCsv(
    [{ kategori: '=1+1', beratKg: 1 }],
    ['kategori', 'beratKg']
  )
  assert.ok(csv.includes("'=1+1"), 'formula harus dinetralkan di dalam berkas')
})

test('toCsv tanpa data tetapi dengan kolom tetap menulis header', () => {
  // Perilaku disengaja: berkas tanpa data tetap memuat header, agar pengguna
  // tahu ekspor berhasil dijalankan dan dapat melihat nama kolomnya.
  // Sebelumnya berkas benar-benar kosong sehingga terkesan ekspor gagal.
  assert.equal(toCsv([], ['tanggal', 'minggu', 'kategori', 'beratKg']), 'tanggal,minggu,kategori,beratKg\n')
})

test('toCsv tanpa data DAN tanpa kolom mengembalikan string kosong', () => {
  assert.equal(toCsv([]), '')
})

test('toCsv mempertahankan kolom yang diminta walau data tidak memuatnya', () => {
  const csv = toCsv([{ a: 1 }], ['a', 'b'])
  const baris = csv.trim().split('\n')
  assert.equal(baris[0], 'a,b')
  assert.equal(baris[1], '1,', 'kolom yang tidak ada menjadi sel kosong')
})
