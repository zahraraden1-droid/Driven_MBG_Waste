#!/usr/bin/env node
/**
 * 04-bandingkan-metode-berat.mjs
 * ---------------------------------------------------------------------------
 * PERBANDINGAN KUANTITATIF metode pembagian berat, memakai KELUARAN ROBOFLOW ASLI
 * dari tim (backend/test/fixtures/roboflow-predictions.json).
 *
 * Yang dibandingkan:
 *   A. luas_bbox_v1  (metode yang berjalan sekarang)
 *        berat_i = total * luas_i / sum(luas)          <- confidence diabaikan
 *   B. densitas_v2   (usulan)
 *        berat_i = total * s_i / sum(s_j)
 *        s_i = densitas(kelas_i) * (w_i*h_i)^gamma * c_i^beta
 *
 * Mengapa ini perlu: metode saat ini MEMBERI BERAT PER SATUAN LUAS YANG SAMA
 * untuk semua jenis makanan. Padahal 1 kg ayam goreng dan 1 kg nasi menempati
 * luas gambar yang berbeda. Perbandingan ini menunjukkan besarnya perbedaan
 * yang timbul, sebagai dasar kalibrasi (BUKAN sebagai klaim bahwa metode baru
 * lebih akurat — akurasi hanya dapat dibuktikan dengan data berlabel).
 *
 * SIFAT: offline. Tidak memanggil API, tidak menyentuh database.
 *
 * Jalankan: node tools/benchmark/04-bandingkan-metode-berat.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(__dirname, 'hasil')
fs.mkdirSync(OUT_DIR, { recursive: true })

const FIXTURE = path.join(
  REPO_ROOT, 'backend', 'test', 'fixtures', 'roboflow-predictions.json'
)

// Salinan parameter dari backend/src/services/roboflowService.js dan
// supabase/migrations/20260920_provenance.sql (tabel food_density).
// Nilai ini BELUM TERVALIDASI dan hanya untuk menunjukkan besaran perbedaan.
const DENSITAS = {
  nasi: 1.0,
  rice: 1.0,
  tempe: 0.95,
  tahu: 0.9,
  ayam_goreng: 0.7,
  ayam: 0.7,
  ikan: 0.75,
  telur: 0.95,
  cap_cai: 0.55,
  sayur: 0.55,
  kelengkeng: 0.65,
  pisang: 0.65,
  buah: 0.65
}
const DENSITAS_DEFAULT = 0.8

function densitasUntuk(kelas) {
  const key = String(kelas || '').toLowerCase().replace(/\s+/g, '_')
  if (DENSITAS[key] !== undefined) return DENSITAS[key]
  for (const [k, v] of Object.entries(DENSITAS)) if (key.includes(k)) return v
  return DENSITAS_DEFAULT
}

function kategoriUntuk(kelas) {
  const n = String(kelas || '').toLowerCase()
  const aturan = [
    ['nasi', ['nasi', 'rice', 'karbo', 'putih']],
    ['sayur', ['sayur', 'capcai', 'cap_cai', 'cah', 'buncis', 'bayam', 'kangkung', 'vegetable', 'wortel', 'brokoli', 'sawi', 'bungkus', 'oseng', 'tumis']],
    ['lauk', ['lauk', 'ayam', 'ikan', 'tempe', 'tahu', 'telur', 'egg', 'meat', 'protein', 'rendang', 'goreng', 'kembung', 'teri', 'bakar']],
    ['buah', ['buah', 'fruit', 'pisang', 'melon', 'apel', 'jeruk', 'semangka', 'kelengkeng', 'anggur', 'mangga', 'pepaya', 'jambu', 'salak', 'rambutan']]
  ]
  for (const [kat, pola] of aturan) if (pola.some((k) => n.includes(k))) return kat
  return 'lainnya'
}

// --- Metode A: perilaku saat ini ---
function metodeLuas(preds, total) {
  const luas = preds.map((p) => Number(p.width) * Number(p.height))
  const jumlah = luas.reduce((a, b) => a + b, 0)
  return preds.map((p, i) => ({
    kelas: p.class,
    kategori: kategoriUntuk(p.class),
    confidence: Number(p.confidence) || 0,
    luasPiksel: luas[i],
    proporsi: jumlah > 0 ? luas[i] / jumlah : 0,
    beratKg: total * (jumlah > 0 ? luas[i] / jumlah : 0)
  }))
}

// --- Metode B: usulan berbasis densitas ---
function metodeDensitas(preds, total, { gamma = 1.0, beta = 0.0, theta = 0.4 } = {}) {
  const dipakai = preds.filter((p) => (Number(p.confidence) || 0) >= theta)
  const s = dipakai.map((p) => {
    const luas = Number(p.width) * Number(p.height)
    const conf = Math.max(0, Math.min(1, Number(p.confidence) || 0))
    const c = Math.max(0, conf - theta) / (1 - theta)
    return densitasUntuk(p.class) * Math.pow(luas, gamma) * Math.pow(c, beta)
  })
  const jumlah = s.reduce((a, b) => a + b, 0)
  return dipakai.map((p, i) => {
    const luas = Number(p.width) * Number(p.height)
    return {
      kelas: p.class,
      kategori: kategoriUntuk(p.class),
      confidence: Number(p.confidence) || 0,
      densitas: densitasUntuk(p.class),
      luasPiksel: luas,
      proporsi: jumlah > 0 ? s[i] / jumlah : 0,
      beratKg: total * (jumlah > 0 ? s[i] / jumlah : 0)
    }
  })
}

function agregatPerKategori(hasil) {
  const m = new Map()
  for (const d of hasil) {
    m.set(d.kategori, (m.get(d.kategori) || 0) + d.beratKg)
  }
  return m
}

// --- Jalankan ---
if (!fs.existsSync(FIXTURE)) {
  console.error(`ERROR: fixture tidak ditemukan di ${FIXTURE}`)
  process.exit(1)
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
const preds = fixture.predictions
const TOTAL = 1.0 // acuan 1 kg dari load cell agar proporsi mudah dibaca

console.log('='.repeat(100))
console.log('PERBANDINGAN METODE PEMBAGIAN BERAT — memakai keluaran Roboflow ASLI tim')
console.log('='.repeat(100))
console.log(`Jumlah deteksi : ${preds.length}`)
console.log(`Total berat    : ${TOTAL} kg (acuan load cell)`)
console.log(`Rentang confidence: ${Math.min(...preds.map(p => p.confidence)).toFixed(3)} – ${Math.max(...preds.map(p => p.confidence)).toFixed(3)}`)
console.log('')

const A = metodeLuas(preds, TOTAL)
const B = metodeDensitas(preds, TOTAL, { gamma: 1.0, beta: 0.0, theta: 0.4 })
const C = metodeDensitas(preds, TOTAL, { gamma: 1.5, beta: 0.0, theta: 0.4 })

function tabelPerDeteksi(nama, hasil) {
  console.log(`--- ${nama} ---`)
  console.log(
    'kelas'.padEnd(14) +
      'kategori'.padEnd(11) +
      'conf'.padStart(7) +
      'densitas'.padStart(10) +
      'luas_px'.padStart(10) +
      'proporsi'.padStart(10) +
      'berat_kg'.padStart(10)
  )
  for (const d of hasil) {
    console.log(
      String(d.kelas).padEnd(14) +
        String(d.kategori).padEnd(11) +
        d.confidence.toFixed(3).padStart(7) +
        (d.densitas !== undefined ? d.densitas.toFixed(2) : '-').padStart(10) +
        String(d.luasPiksel).padStart(10) +
        (d.proporsi * 100).toFixed(1).padStart(9) + '%' +
        d.beratKg.toFixed(4).padStart(10)
    )
  }
  const total = hasil.reduce((a, d) => a + d.beratKg, 0)
  console.log(`  TOTAL = ${total.toFixed(4)} kg (harus sama dengan acuan, membuktikan normalisasi benar)`)
  console.log('')
}

tabelPerDeteksi('A. luas_bbox_v1 (BERJALAN SEKARANG)', A)
tabelPerDeteksi('B. densitas_v2 (gamma=1.0, beta=0)', B)
tabelPerDeteksi('C. densitas_v2 (gamma=1.5, beta=0)', C)

// Perbandingan per kategori
const katA = agregatPerKategori(A)
const katB = agregatPerKategori(B)
const katC = agregatPerKategori(C)
const semuaKat = [...new Set([...katA.keys(), ...katB.keys(), ...katC.keys()])].sort()

console.log('='.repeat(100))
console.log('PERBANDINGAN PER KATEGORI (acuan total 1 kg)')
console.log('='.repeat(100))
console.log(
  'kategori'.padEnd(12) +
    'A luas_v1'.padStart(12) +
    'B dens_v2'.padStart(12) +
    'C dens_v2(g1.5)'.padStart(18) +
    'selisih B-A'.padStart(14) +
    'selisih %'.padStart(12)
)
const barisPerbandingan = []
for (const k of semuaKat) {
  const a = katA.get(k) || 0
  const b = katB.get(k) || 0
  const c = katC.get(k) || 0
  const selisih = b - a
  const persen = a > 0 ? (selisih / a) * 100 : null
  console.log(
    k.padEnd(12) +
      a.toFixed(4).padStart(12) +
      b.toFixed(4).padStart(12) +
      c.toFixed(4).padStart(18) +
      (selisih >= 0 ? '+' : '') + selisih.toFixed(4).padStart(13) +
      (persen === null ? '   (baru)' : ((persen >= 0 ? '+' : '') + persen.toFixed(1) + '%').padStart(12))
  )
  barisPerbandingan.push({ kategori: k, A: a, B: b, C: c, selisih: selisih, selisih_persen: persen })
}

// Analisis sensitivitas gamma
console.log('')
console.log('='.repeat(100))
console.log('ANALISIS SENSITIVITAS: pengaruh eksponen ukuran (gamma) terhadap proporsi nasi')
console.log('='.repeat(100))
console.log('gamma'.padEnd(10) + 'proporsi nasi'.padStart(16) + 'proporsi ayam'.padStart(16) + 'catatan'.padStart(34))
for (const gamma of [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]) {
  const h = metodeDensitas(preds, TOTAL, { gamma, beta: 0.0 })
  const nasi = h.find((d) => d.kelas === 'nasi')
  const ayam = h.find((d) => d.kelas === 'Ayam_Goreng')
  const catatan =
    gamma === 1.0
      ? 'asumsi lama: luas sebanding massa'
      : gamma === 1.5
        ? 'asumsi 3D isotropik (volume ~ panjang^3)'
        : ''
  console.log(
    String(gamma).padEnd(10) +
      ((nasi.proporsi * 100).toFixed(2) + '%').padStart(16) +
      ((ayam.proporsi * 100).toFixed(2) + '%').padStart(16) +
      catatan.padStart(34)
  )
}

// Contoh pengaruh pembobotan confidence
console.log('')
console.log('='.repeat(100))
console.log('ANALISIS SENSITIVITAS: pengaruh pembobotan confidence (beta)')
console.log('='.repeat(100))
const predsDenganLemah = [
  ...preds,
  { class: 'nasi', confidence: 0.42, width: 300, height: 300, x: 0, y: 0 } // deteksi besar tapi lemah
]
console.log('Skenario: ditambahkan satu deteksi "nasi" berluas BESAR (300x300) tetapi confidence rendah (0.42)')
console.log('beta'.padEnd(10) + 'berat deteksi lemah'.padStart(22) + 'catatan'.padStart(40))
for (const beta of [0.0, 0.5, 1.0, 2.0]) {
  const h = metodeDensitas(predsDenganLemah, TOTAL, { gamma: 1.0, beta })
  // Deteksi lemah adalah entri nasi terakhir
  const kandidat = h.filter((d) => d.kelas === 'nasi')
  const lemah = kandidat[kandidat.length - 1]
  console.log(
    String(beta).padEnd(10) +
      ((lemah.proporsi * 100).toFixed(2) + '%').padStart(22) +
      (beta === 0 ? 'confidence diabaikan (sama seperti metode lama)' : 'semakin besar beta, semakin ditekan').padStart(40)
  )
}

// Simpan hasil
const keluaran = {
  dijalankan_pada: new Date().toISOString(),
  sumber_data: 'backend/test/fixtures/roboflow-predictions.json (keluaran Roboflow asli tim)',
  total_acuan_kg: TOTAL,
  parameter: { densitas: DENSITAS, densitas_default: DENSITAS_DEFAULT },
  metode_A_luas_bbox_v1: A,
  metode_B_densitas_v2_gamma1: B,
  metode_C_densitas_v2_gamma1_5: C,
  perbandingan_per_kategori: barisPerbandingan,
  peringatan:
    'Nilai densitas BELUM TERVALIDASI. Perbandingan ini menunjukkan besaran perbedaan antar metode, BUKAN bukti bahwa metode baru lebih akurat. Akurasi hanya dapat dibuktikan dengan data ground truth (lihat docs/VALIDASI_PENGUJIAN.md).'
}
const outFile = path.join(OUT_DIR, 'perbandingan-metode-berat.json')
fs.writeFileSync(outFile, JSON.stringify(keluaran, null, 2), 'utf8')

// Simpan CSV bukti
const csv = ['kelas,kategori,confidence,densitas,luas_piksel,proporsi_A,berat_A_kg,proporsi_B,berat_B_kg']
for (let i = 0; i < A.length; i++) {
  csv.push(
    [
      A[i].kelas,
      A[i].kategori,
      A[i].confidence,
      densitasUntuk(A[i].kelas),
      A[i].luasPiksel,
      A[i].proporsi.toFixed(6),
      A[i].beratKg.toFixed(6),
      B[i].proporsi.toFixed(6),
      B[i].beratKg.toFixed(6)
    ].join(',')
  )
}
fs.writeFileSync(path.join(OUT_DIR, 'perbandingan-metode-berat.csv'), csv.join('\n') + '\n', 'utf8')

console.log('')
console.log('='.repeat(100))
console.log('CATATAN PENTING UNTUK PAPER')
console.log('='.repeat(100))
console.log('  1. Kedua metode mempertahankan TOTAL berat (dari load cell); yang berbeda')
console.log('     hanyalah DISTRIBUSI antar kategori. Ini penting: integritas total terjaga.')
console.log('  2. Nilai densitas di atas BELUM TERVALIDASI. Angka perbandingan ini')
console.log('     menunjukkan BESARAN PERBEDAAN, bukan bukti metode baru lebih akurat.')
console.log('  3. Untuk mengklaim metode baru lebih baik, wajib ada data ground truth')
console.log('     per kategori (lihat docs/VALIDASI_PENGUJIAN.md).')
console.log('')
console.log(`Output: ${path.relative(REPO_ROOT, outFile)}`)
console.log(`        ${path.relative(REPO_ROOT, path.join(OUT_DIR, 'perbandingan-metode-berat.csv'))}`)
