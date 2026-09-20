'use strict'

/**
 * Test untuk logika pembagian berat (roboflowService.hitungProportion).
 *
 * Tujuan utama: MENGUNCI perilaku skema lama `luas_bbox_v1` agar perbaikan
 * ke depannya tidak diam-diam mengubah angka yang sudah dilaporkan, sekaligus
 * memverifikasi skema baru `densitas_v2` benar-benar mempertimbangkan densitas
 * dan confidence.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  hitungProportion,
  mapClassToKategori,
  densitasUntuk
} = require('../src/services/roboflowService')

// Dua deteksi dengan luas IDENTIK tetapi confidence berbeda, dari kelas berbeda.
const deteksiUji = [
  { class: 'nasi', confidence: 0.96, width: 100, height: 100 },
  { class: 'Ayam_Goreng', confidence: 0.96, width: 100, height: 100 }
]

test('luas_bbox_v1: membagi berat proporsional luas dan MENGABAIKAN confidence', () => {
  const hasil = hitungProportion(deteksiUji, 1.0, { skemaBerat: 'luas_bbox_v1' })

  // Luas sama -> proporsi sama -> berat sama, tanpa memandang densitas kelas.
  assert.equal(hasil.deteksi.length, 2)
  assert.equal(hasil.deteksi[0].beratKg, 0.5)
  assert.equal(hasil.deteksi[1].beratKg, 0.5)
  assert.equal(hasil.skemaBerat, 'luas_bbox_v1')
})

test('luas_bbox_v1: confidence rendah TIDAK difilter (perilaku lama dipertahankan)', () => {
  const denganConfidenceRendah = [
    { class: 'nasi', confidence: 0.05, width: 100, height: 100 },
    { class: 'nasi', confidence: 0.99, width: 100, height: 100 }
  ]
  const hasil = hitungProportion(denganConfidenceRendah, 1.0, { skemaBerat: 'luas_bbox_v1' })

  assert.equal(hasil.deteksi.length, 2, 'kedua deteksi tetap dihitung pada skema lama')
  assert.equal(hasil.deteksi[0].beratKg, 0.5)
})

test('densitas_v2: densitas kelas yang lebih tinggi mendapat berat lebih besar', () => {
  const hasil = hitungProportion(deteksiUji, 1.0, { skemaBerat: 'densitas_v2' })

  // nasi (densitas 1.00) harus lebih berat daripada Ayam_Goreng (0.70).
  const nasi = hasil.deteksi.find((d) => d.kelas === 'nasi')
  const ayam = hasil.deteksi.find((d) => d.kelas === 'Ayam_Goreng')

  assert.ok(nasi.beratKg > ayam.beratKg, 'nasi harus lebih berat dari ayam goreng')
  assert.equal(Number((nasi.beratKg + ayam.beratKg).toFixed(3)), 1.0, 'total harus tetap 1 kg')
})

test('densitas_v2: deteksi di bawah ambang confidence disingkirkan', () => {
  const campuran = [
    { class: 'nasi', confidence: 0.95, width: 100, height: 100 },
    { class: 'nasi', confidence: 0.10, width: 100, height: 100 } // di bawah ambang 0.4
  ]
  const hasil = hitungProportion(campuran, 1.0, { skemaBerat: 'densitas_v2' })

  assert.equal(hasil.deteksi.length, 1, 'hanya deteksi di atas ambang yang dipakai')
  assert.equal(hasil.deteksi[0].beratKg, 1.0, 'seluruh berat jatuh ke deteksi yang valid')
})

test('luas berbeda: pembagian mengikuti luas pada skema lama', () => {
  const duaLuas = [
    { class: 'nasi', confidence: 0.9, width: 100, height: 100 }, // luas 10.000
    { class: 'nasi', confidence: 0.9, width: 50, height: 100 } // luas 5.000
  ]
  const hasil = hitungProportion(duaLuas, 3.0, { skemaBerat: 'luas_bbox_v1' })

  assert.equal(hasil.deteksi[0].beratKg, 2.0)
  assert.equal(hasil.deteksi[1].beratKg, 1.0)
})

test('total berat nol menghasilkan distribusi nol tanpa NaN', () => {
  const hasil = hitungProportion(deteksiUji, 0, { skemaBerat: 'luas_bbox_v1' })

  assert.equal(hasil.totalBeratKg, 0)
  for (const d of hasil.deteksi) {
    assert.equal(d.beratKg, 0)
    assert.ok(Number.isFinite(d.proporsi))
  }
})

test('confidenceRataRata dihitung sebagai provenance', () => {
  const hasil = hitungProportion(
    [
      { class: 'nasi', confidence: 0.9, width: 10, height: 10 },
      { class: 'nasi', confidence: 0.8, width: 10, height: 10 }
    ],
    1,
    { skemaBerat: 'luas_bbox_v1' }
  )
  assert.equal(hasil.confidenceRataRata, 0.85)
})

test('mapClassToKategori mengenali kelas nyata Roboflow', () => {
  assert.equal(mapClassToKategori('Ayam_Goreng'), 'lauk')
  assert.equal(mapClassToKategori('tempe'), 'lauk')
  assert.equal(mapClassToKategori('Kelengkeng'), 'buah')
  assert.equal(mapClassToKategori('nasi'), 'nasi')
  assert.equal(mapClassToKategori('cap_cai'), 'sayur')
  assert.equal(mapClassToKategori('tidak_dikenal'), 'lainnya')
})

test('densitasUntuk mengenali variasi nama kelas', () => {
  assert.equal(densitasUntuk('nasi'), 1.0)
  assert.equal(densitasUntuk('Ayam_Goreng'), 0.7)
  assert.equal(densitasUntuk('ayam_goreng_paha'), 0.7, 'pencocokan sebagian')
  assert.equal(densitasUntuk('kelas_asing'), 0.8, 'memakai default')
})
