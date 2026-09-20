'use strict'

/**
 * Test untuk pelacakan latency berjenjang.
 *
 * Fokus pada dua hal:
 *   1. Perhitungan durasi antar tahap benar (inilah dasar angka latency yang
 *      akan dilaporkan).
 *   2. Aman dipanggil TANPA trace — banyak pemanggil lama tidak meneruskan
 *      trace, dan itu tidak boleh menyebabkan error.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.LOG_LEVEL = 'error' // senyapkan log selama test

const {
  buatTrace,
  tandai,
  durasi,
  selesaikan,
  ringkasan,
  terakhir,
  reset,
  KAPASITAS
} = require('../src/config/latencyTrace')

test('trace baru memiliki id dan waktu mulai', () => {
  const t = buatTrace('uji')
  assert.ok(t.id, 'harus memiliki id')
  assert.equal(t.nama, 'uji')
  assert.ok(t.mulai > 0)
  assert.deepEqual(t.tahap, {})
})

test('tandai mencatat waktu tahap', () => {
  const t = buatTrace('uji')
  tandai(t, 'mulai')
  assert.ok(t.tahap.mulai > 0)
})

test('durasi menghitung selisih antar dua tahap', async () => {
  const t = buatTrace('uji')
  tandai(t, 't1')
  await new Promise((r) => setTimeout(r, 25))
  tandai(t, 't2')

  const d = durasi(t, 't2', 't1')
  assert.ok(d >= 20, `durasi harus minimal 20 ms, dapat ${d}`)
  assert.ok(d < 500, 'durasi tidak masuk akal')
})

test('durasi dari awal bila tahap awal tidak disebut', () => {
  const t = buatTrace('uji')
  tandai(t, 't1')
  const d = durasi(t, 't1')
  assert.ok(d >= 0)
})

test('selesaikan menghitung total dan rincian antar tahap', async () => {
  const t = buatTrace('uji')
  tandai(t, 'a')
  await new Promise((r) => setTimeout(r, 20))
  tandai(t, 'b')
  await new Promise((r) => setTimeout(r, 20))
  tandai(t, 'c')

  const hasil = selesaikan(t, { sukses: true, keterangan: 'ok' })

  assert.ok(hasil.totalMs >= 35, `total harus >= 35 ms, dapat ${hasil.totalMs}`)
  assert.equal(hasil.sukses, true)
  assert.equal(hasil.keterangan, 'ok')
  assert.ok(hasil.rincianMs.a >= 0)
  assert.ok(hasil.rincianMs.b >= 15)
  assert.ok(hasil.rincianMs.c >= 15)
  assert.equal(hasil.rincianMs.total, hasil.totalMs)
})

test('selesaikan TIDAK melempar error saat trace null', () => {
  assert.equal(selesaikan(null), null)
})

test('tandai dan durasi aman dipanggil tanpa trace', () => {
  assert.doesNotThrow(() => tandai(null, 'x'))
  assert.equal(durasi(null, 'x'), null)
})

test('durasi mengembalikan null untuk tahap yang tidak ada', () => {
  const t = buatTrace('uji')
  assert.equal(durasi(t, 'tidakAda'), null)
})

test('ringkasan mencatat statistik per tahap', () => {
  reset()
  const t = buatTrace('uji')
  tandai(t, 'a')
  tandai(t, 'b')
  selesaikan(t, { sukses: true })

  const r = ringkasan()
  assert.equal(r.total, 1)
  assert.equal(r.berhasil, 1)
  assert.equal(r.gagal, 0)
  assert.equal(r.tingkatKeberhasilan, 100)
  assert.ok(r.perTahap.a, 'harus memuat tahap a')
  assert.ok(r.perTahap.total, 'harus memuat total')
  assert.equal(typeof r.perTahap.a.rataRataMs, 'number')
  assert.equal(typeof r.perTahap.a.maksMs, 'number')
})

test('ringkasan menghitung tingkat keberhasilan dengan benar', () => {
  reset()
  const t1 = buatTrace('uji')
  selesaikan(t1, { sukses: true })
  const t2 = buatTrace('uji')
  selesaikan(t2, { sukses: false })

  const r = ringkasan()
  assert.equal(r.total, 2)
  assert.equal(r.berhasil, 1)
  assert.equal(r.gagal, 1)
  assert.equal(r.tingkatKeberhasilan, 50)
})

test('terakhir mengembalikan trace terbaru lebih dulu', () => {
  reset()
  const a = buatTrace('pertama')
  selesaikan(a)
  const b = buatTrace('kedua')
  selesaikan(b)

  const daftar = terakhir(10)
  assert.equal(daftar.length, 2)
  assert.equal(daftar[0].nama, 'kedua', 'trace terbaru harus di depan')
})

test('buffer dibatasi kapasitasnya', () => {
  reset()
  for (let i = 0; i < KAPASITAS + 25; i++) {
    selesaikan(buatTrace(`t${i}`))
  }
  const daftar = terakhir(KAPASITAS + 100)
  assert.ok(
    daftar.length <= KAPASITAS,
    `buffer tidak boleh melebihi ${KAPASITAS}, dapat ${daftar.length}`
  )
})

test('reset mengosongkan buffer dan statistik', () => {
  const t = buatTrace('uji')
  selesaikan(t)
  reset()
  assert.equal(terakhir(10).length, 0)
  assert.equal(ringkasan().total, 0)
})
