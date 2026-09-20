/*
 * Pelacakan latency berjenjang.
 *
 * MASALAH YANG DIPERBAIKI
 * Sebelum ini tidak ada satu pun pengukuran durasi di backend. `Date.now()`
 * hanya dipakai untuk cache 30 detik dan health check. Akibatnya klaim latency
 * pada paper ("<2 detik") tidak dapat dibuktikan dari data mana pun, dan tidak
 * ada cara mengetahui tahap mana yang menjadi hambatan.
 *
 * PENDEKATAN
 * Satu "trace" dibuat saat data diterima, lalu ditandai pada setiap tahap.
 * Hasilnya dicatat sebagai satu baris log terstruktur dan disimpan pada buffer
 * terbatas di memori untuk diperiksa melalui endpoint internal.
 *
 * Catatan: buffer hanya di memori. Ini disengaja — angka latency adalah alat
 * diagnosis, bukan data yang perlu bertahan. Bila ingin dianalisis dalam jangka
 * panjang, tuliskan ke tabel tersendiri.
 */

const crypto = require('node:crypto')
const { log } = require('./observability')

// Buffer melingkar sederhana: menyimpan N trace terakhir.
const KAPASITAS = Number(process.env.LATENCY_BUFFER || 200)
const buffer = []
let statistik = {
  total: 0,
  berhasil: 0,
  gagal: 0,
  perTahap: {}
}

function buatTrace(nama) {
  return {
    id: crypto.randomUUID().slice(0, 12),
    nama,
    mulai: Date.now(),
    mulaiIso: new Date().toISOString(),
    tahap: {}
  }
}

/**
 * Menandai sebuah tahap. Bila trace tidak diberikan (mis. pemanggil lama),
 * fungsi ini aman dipanggil dan tidak melakukan apa pun.
 */
function tandai(trace, nama) {
  if (!trace) return
  trace.tahap[nama] = Date.now()
}

/**
 * Menghitung durasi antar dua tahap, atau dari awal bila `dari` tidak diberi.
 */
function durasi(trace, sampai, dari = null) {
  if (!trace) return null
  const akhir = trace.tahap[sampai]
  if (akhir === undefined) return null
  const awal = dari ? trace.tahap[dari] : trace.mulai
  if (awal === undefined) return null
  return akhir - awal
}

/**
 * Menutup trace: menghitung ringkasan, mencatat ke log, dan menyimpan ke buffer.
 *
 * @param {object} trace
 * @param {object} opsi  { sukses: boolean, keterangan: string }
 */
function selesaikan(trace, { sukses = true, keterangan = null } = {}) {
  if (!trace) return null

  trace.selesai = Date.now()
  trace.totalMs = trace.selesai - trace.mulai
  trace.sukses = sukses
  trace.keterangan = keterangan

  // Ringkasan tahap berurutan sesuai urutan kejadian, agar mudah dibaca.
  const urutan = Object.entries(trace.tahap)
    .sort((a, b) => a[1] - b[1])
    .map(([nama]) => nama)

  const rincian = {}
  let sebelumnya = trace.mulai
  for (const nama of urutan) {
    rincian[nama] = trace.tahap[nama] - sebelumnya
    sebelumnya = trace.tahap[nama]
  }
  rincian.total = trace.totalMs
  trace.rincianMs = rincian

  // Statistik agregat (berguna untuk melihat pola tanpa membaca tiap trace).
  statistik.total += 1
  if (sukses) statistik.berhasil += 1
  else statistik.gagal += 1
  for (const [nama, ms] of Object.entries(rincian)) {
    if (!statistik.perTahap[nama]) statistik.perTahap[nama] = { n: 0, total: 0, maks: 0 }
    const s = statistik.perTahap[nama]
    s.n += 1
    s.total += ms
    if (ms > s.maks) s.maks = ms
  }

  log.info('latency', {
    traceId: trace.id,
    operasi: trace.nama,
    sukses,
    totalMs: trace.totalMs,
    rincianMs: rincian,
    keterangan
  })

  buffer.push(trace)
  if (buffer.length > KAPASITAS) buffer.shift()

  return trace
}

/**
 * Ringkasan statistik: rata-rata dan maksimum per tahap, serta tingkat keberhasilan.
 * Angka inilah yang dapat dilaporkan sebagai distribusi latency (bukan satu angka).
 */
function ringkasan() {
  const perTahap = {}
  for (const [nama, s] of Object.entries(statistik.perTahap)) {
    perTahap[nama] = {
      n: s.n,
      rataRataMs: Number((s.total / s.n).toFixed(1)),
      maksMs: s.maks
    }
  }
  return {
    total: statistik.total,
    berhasil: statistik.berhasil,
    gagal: statistik.gagal,
    tingkatKeberhasilan:
      statistik.total > 0
        ? Number(((statistik.berhasil / statistik.total) * 100).toFixed(1))
        : null,
    perTahap,
    catatan:
      'Statistik di memori sejak proses terakhir dimulai. Reset saat deploy/restart.'
  }
}

/**
 * Trace terakhir, terbaru lebih dulu.
 */
function terakhir(jumlah = 20) {
  return buffer.slice(-Math.max(1, Math.min(jumlah, KAPASITAS))).reverse()
}

function reset() {
  buffer.length = 0
  statistik = { total: 0, berhasil: 0, gagal: 0, perTahap: {} }
}

module.exports = {
  buatTrace,
  tandai,
  durasi,
  selesaikan,
  ringkasan,
  terakhir,
  reset,
  KAPASITAS
}
