'use strict'

/**
 * Test validasi input.
 *
 * Kasus-kasus di bawah adalah nilai yang DAHULU LOLOS dengan pemeriksaan
 * "truthy" dan berakhir di database sebagai data tidak sah. Test ini mengunci
 * perbaikannya agar tidak kembali.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const { validasi, skema } = require('../src/config/validasi')

test('menolak berat telur NEGATIF (dahulu lolos karena "-5" bernilai truthy)', () => {
  const h = validasi(skema.batchBaru, {
    batchKode: 'B-001',
    tanggalMulai: '2026-09-19',
    beratTelurGram: '-5'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /lebih besar dari 0/i)
})

test('menolak berat telur bukan angka (dahulu lolos lalu menjadi NaN di DB)', () => {
  const h = validasi(skema.batchBaru, {
    batchKode: 'B-001',
    tanggalMulai: '2026-09-19',
    beratTelurGram: 'abc'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /angka/i)
})

test('menolak tanggal yang tidak ada di kalender', () => {
  const h = validasi(skema.batchBaru, {
    batchKode: 'B-001',
    tanggalMulai: '2026-02-31',
    beratTelurGram: '10'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /kalender|tidak valid/i)
})

test('menolak format tanggal yang salah', () => {
  const h = validasi(skema.batchBaru, {
    batchKode: 'B-001',
    tanggalMulai: '19-09-2026',
    beratTelurGram: '10'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /YYYY-MM-DD/)
})

test('menerima masukan yang sah dan mengubah tipe string menjadi angka', () => {
  const h = validasi(skema.batchBaru, {
    batchKode: '  B-001  ',
    tanggalMulai: '2026-09-19',
    beratTelurGram: '5.5',
    biayaBeli: '10000'
  })
  assert.equal(h.sukses, true)
  assert.equal(h.data.batchKode, 'B-001', 'spasi tepi harus dipangkas')
  assert.equal(h.data.beratTelurGram, 5.5, 'harus dikonversi menjadi number')
  assert.equal(h.data.biayaBeli, 10000)
})

test('biaya beli opsional dan default 0', () => {
  const h = validasi(skema.batchBaru, {
    batchKode: 'B-001',
    tanggalMulai: '2026-09-19',
    beratTelurGram: '5'
  })
  assert.equal(h.sukses, true)
  assert.equal(h.data.biayaBeli, 0)
  assert.equal(h.data.catatan, null)
})

test('menolak penjualan dengan berat NEGATIF (dahulu menghasilkan total negatif)', () => {
  const h = validasi(skema.penjualanBaru, {
    tanggal: '2026-09-19',
    jenis: 'segar',
    beratKg: '-2',
    hargaPerKg: '50000'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /lebih besar dari 0/i)
})

test('menolak jenis penjualan di luar daftar yang diizinkan', () => {
  const h = validasi(skema.penjualanBaru, {
    tanggal: '2026-09-19',
    jenis: 'basah',
    beratKg: '2',
    hargaPerKg: '50000'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /segar|kering/i)
})

test('menerima penjualan yang sah', () => {
  const h = validasi(skema.penjualanBaru, {
    tanggal: '2026-09-19',
    jenis: 'kering',
    beratKg: '1.5',
    hargaPerKg: '60000'
  })
  assert.equal(h.sukses, true)
  assert.equal(h.data.beratKg, 1.5)
  assert.equal(h.data.hargaPerKg, 60000)
})

test('menolak menulis pesan galat yang menyebut SEMUA masalah sekaligus', () => {
  const h = validasi(skema.penjualanBaru, {
    tanggal: 'salah',
    jenis: 'segar',
    beratKg: '-1',
    hargaPerKg: 'abc'
  })
  assert.equal(h.sukses, false)
  // Tiga field bermasalah seharusnya dilaporkan bersamaan.
  assert.ok(h.pesan.split('.').length >= 3, `pesan terlalu pendek: ${h.pesan}`)
})

test('telemetri: menerima payload null dari sensor yang gagal', () => {
  // Firmware mengirim null bila sensor gagal — ini SAH dan harus diterima,
  // agar backend dapat menolaknya di lapisan validasi nilai, bukan validasi tipe.
  const h = validasi(skema.telemetriChamber, {
    batchId: '',
    suhuBilikC: null,
    kelembapanPersen: null,
    kadarAmoniaPpm: null,
    suhuSubstratC: null,
    beratMaggotPanenKg: null
  })
  assert.equal(h.sukses, true)
})

test('telemetri: menolak nilai sensor di luar rentang wajar', () => {
  const h = validasi(skema.telemetriChamber, {
    suhuBilikC: '9999'
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /rentang|wajar/i)
})

test('telemetri: menolak nilai sensor negatif', () => {
  const h = validasi(skema.telemetriChamber, {
    kadarAmoniaPpm: '-3'
  })
  assert.equal(h.sukses, false)
})

test('telemetri: field tidak dikenal DIBIARKAN lewat agar firmware lama tetap bekerja', () => {
  const h = validasi(skema.telemetriChamber, {
    suhuBilikC: '28.5',
    fieldBaruDariFirmware: 'sesuatu'
  })
  assert.equal(h.sukses, true, 'field asing tidak boleh menggagalkan telemetri')
  assert.equal(h.data.fieldBaruDariFirmware, 'sesuatu')
})

test('telemetri: nilai sensor sah dikonversi menjadi angka', () => {
  const h = validasi(skema.telemetriChamber, {
    suhuBilikC: '28.5',
    kelembabanPersen: '70',
    kadarAmoniaPpm: '8.3',
    suhuSubstratC: '31',
    beratMaggotPanenKg: '0.42'
  })
  assert.equal(h.sukses, true)
  assert.equal(h.data.suhuBilikC, 28.5)
  assert.equal(h.data.beratMaggotPanenKg, 0.42)
})

test('menu: kalori kosong diperlakukan sebagai null, bukan NaN', () => {
  const h = validasi(skema.menuBaru, {
    tanggal: '2026-09-19',
    nama: 'Nasi Ayam',
    kalori: '',
    protein: ''
  })
  assert.equal(h.sukses, true)
  assert.equal(h.data.kalori, null)
  assert.equal(h.data.protein, null)
})

test('menu: nama wajib diisi', () => {
  const h = validasi(skema.menuBaru, {
    tanggal: '2026-09-19',
    nama: '   '
  })
  assert.equal(h.sukses, false)
  assert.match(h.pesan, /wajib diisi/i)
})

test('id batch: menolak ID yang bukan UUID', () => {
  assert.equal(validasi(skema.idUuid, 'abc-123').sukses, false)
  assert.equal(
    validasi(skema.idUuid, 'e982467c-60b9-4660-9b52-aae8476eb96c').sukses,
    true
  )
})
