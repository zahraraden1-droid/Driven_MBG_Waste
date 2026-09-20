/*
 * Skema validasi input (zod).
 *
 * MASALAH YANG DIPERBAIKI
 * Sebelumnya validasi hanya berupa pemeriksaan "truthy":
 *
 *   if (!tanggal || !jenis || !beratKg || !hargaPerKg) { ...400... }
 *
 * Pemeriksaan seperti itu meloloskan banyak nilai yang tidak sah:
 *   - `beratKg: "-5"`  -> truthy, lalu Number("-5") = -5  => berat NEGATIF tersimpan
 *   - `beratKg: "abc"` -> truthy, lalu Number("abc") = NaN => error database
 *   - `tanggal: "bukan-tanggal"` -> truthy => error database atau tanggal aneh
 *   - `tanggal: "2026-13-45"`    -> truthy => ditolak database, pesan membingungkan
 *
 * Skema di bawah menolaknya di batas masuk, dengan pesan yang dapat dimengerti
 * pengguna, sebelum menyentuh database.
 *
 * PENTING: skema ini TIDAK mengubah bentuk data yang diterima dari klien.
 * Endpoint tetap menerima nama field yang sama; hanya nilainya yang divalidasi.
 */

const { z } = require('zod')

// ---------------------------------------------------------------------------
// Potongan yang dipakai berulang
// ---------------------------------------------------------------------------

/** Tanggal format YYYY-MM-DD yang benar-benar ada di kalender. */
const tanggal = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return false
    // Tolak tanggal yang "meluber", mis. 2026-02-31 menjadi 3 Maret.
    return d.toISOString().slice(0, 10) === v
  }, 'Tanggal tidak valid (tidak ada di kalender).')

/** Angka positif dari string maupun number. Menolak NaN, negatif, dan nol. */
const angkaPositif = (nama, maks = 1e7) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? Number(v.trim()) : v))
    .refine((v) => Number.isFinite(v), `${nama} harus berupa angka.`)
    .refine((v) => v > 0, `${nama} harus lebih besar dari 0.`)
    .refine((v) => v <= maks, `${nama} tidak wajar (maksimum ${maks}).`)

/** Angka >= 0. Dipakai untuk kolom opsional seperti biaya. */
const angkaNonNegatif = (nama, maks = 1e9) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? (v.trim() === '' ? 0 : Number(v.trim())) : v))
    .refine((v) => Number.isFinite(v), `${nama} harus berupa angka.`)
    .refine((v) => v >= 0, `${nama} tidak boleh negatif.`)
    .refine((v) => v <= maks, `${nama} tidak wajar (maksimum ${maks}).`)

/** Angka opsional: string kosong, null, atau key yang tidak dikirim -> null. */
const angkaOpsional = (nama, maks = 1e7) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'string' && v.trim() === '') return null
      return typeof v === 'string' ? Number(v.trim()) : v
    })
    .refine((v) => v === null || Number.isFinite(v), `${nama} harus berupa angka.`)
    .refine((v) => v === null || (v >= 0 && v <= maks), `${nama} di luar rentang wajar (0-${maks}).`)

const teksWajib = (nama, maks = 200) =>
  z
    .string({ message: `${nama} wajib diisi.` })
    .trim()
    .min(1, `${nama} wajib diisi.`)
    .max(maks, `${nama} terlalu panjang (maksimum ${maks} karakter).`)

const teksOpsional = (maks = 1000) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null
      const t = String(v).trim()
      return t === '' ? null : t
    })
    .refine((v) => v === null || v.length <= maks, `Teks terlalu panjang (maksimum ${maks}).`)

// ---------------------------------------------------------------------------
// Skema per endpoint
// ---------------------------------------------------------------------------

/** POST /api/iot/maggot-chamber — telemetri dari ESP8266. */
const telemetriChamber = z
  .object({
    batchId: z.union([z.string().uuid(), z.literal(''), z.null(), z.undefined()]).optional(),
    suhuBilikC: angkaOpsional('Suhu bilik', 100),
    kelembabanPersen: angkaOpsional('Kelembaban', 100),
    kadarAmoniaPpm: angkaOpsional('Kadar amonia', 5000),
    suhuSubstratC: angkaOpsional('Suhu substrat', 200),
    beratMaggotPanenKg: angkaOpsional('Berat maggot', 1000)
  })
  // SENGAJA TIDAK memakai .strict(): firmware yang sudah terpasang di lapangan
  // tidak boleh berhenti bekerja hanya karena mengirim field tambahan. Field
  // yang tidak dikenal dibiarkan lewat, tetapi dicatat sebagai peringatan oleh
  // pemanggil agar penyimpangan tetap terlihat.
  .passthrough()

/** POST /api/admin-sekolah/batches — buat batch maggot. */
const batchBaru = z.object({
  batchKode: teksWajib('Kode batch', 50),
  tanggalMulai: tanggal,
  beratTelurGram: angkaPositif('Berat telur (gram)', 100000),
  biayaBeli: angkaNonNegatif('Biaya beli', 1e12).optional().default(0),
  catatan: teksOpsional(1000).optional().default(null)
})

/** POST /api/admin-sekolah/penjualan — catat penjualan. */
const penjualanBaru = z.object({
  tanggal,
  jenis: z.enum(['segar', 'kering'], {
    message: 'Jenis harus "segar" atau "kering".'
  }),
  beratKg: angkaPositif('Berat (kg)', 100000),
  hargaPerKg: angkaPositif('Harga per kg', 1e9)
})

/** POST /api/admin-sekolah/menu — input menu (multipart/form-data, semua string). */
const menuBaru = z.object({
  tanggal,
  nama: teksWajib('Nama menu', 200),
  kalori: angkaOpsional('Kalori', 10000).optional().default(null),
  protein: angkaOpsional('Protein', 1000).optional().default(null)
})

/** PUT /api/admin-sekolah/batches/:id/panen */
const idUuid = z.string().uuid('ID batch harus berupa UUID yang sah.')

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Memvalidasi data dan mengembalikan { sukses, data } atau { sukses:false, pesan }.
 * Pesan digabung agar pengguna melihat semua masalah sekaligus, bukan satu per satu.
 */
function validasi(skema, masukan) {
  const hasil = skema.safeParse(masukan)
  if (hasil.success) return { sukses: true, data: hasil.data }

  const pesan = hasil.error.issues
    .map((i) => {
      const jalur = i.path.join('.')
      return jalur ? `${jalur}: ${i.message}` : i.message
    })
    .join(' ')

  return { sukses: false, pesan }
}

module.exports = {
  validasi,
  skema: {
    telemetriChamber,
    batchBaru,
    penjualanBaru,
    menuBaru,
    idUuid
  }
}
