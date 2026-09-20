/*
 * Deteksi objek database yang belum ada (migrasi belum dijalankan).
 *
 * MASALAH YANG DIPERBAIKI
 * Beberapa bagian kode mendeteksi "tabel belum ada" dengan pola:
 *
 *     /relation|does not exist|42P01/i.test(error.message)
 *
 * Pola itu TIDAK PERNAH cocok. Backend memakai Supabase melalui PostgREST, dan
 * PostgREST mengembalikan:
 *
 *     code    : "PGRST205"
 *     message : "Could not find the table 'public.audit_log' in the schema cache"
 *
 * Akibatnya:
 *   - pesan panduan "jalankan migrasi ..." tidak pernah muncul;
 *   - endpoint pembaca mengembalikan 500 (kesalahan server) padahal yang
 *     sebenarnya terjadi adalah konfigurasi belum lengkap (503);
 *   - penanda "tabel tidak tersedia" tidak pernah aktif, sehingga sistem
 *     mencoba menulis ke tabel yang sama berulang kali.
 *
 * Modul ini menjadi satu-satunya tempat deteksi tersebut, agar tidak lagi
 * berbeda-beda antar berkas.
 */

/**
 * Kode error PostgREST/PostgreSQL yang menandakan objek tidak ditemukan.
 */
const KODE_OBJEK_TIDAK_ADA = new Set([
  'PGRST205', // PostgREST: tabel tidak ada di schema cache
  'PGRST202', // PostgREST: fungsi RPC tidak ditemukan
  '42P01', // PostgreSQL: undefined_table
  '42883', // PostgreSQL: undefined_function
  '42703' // PostgreSQL: undefined_column
])

const POLA_PESAN = [
  /could not find the table/i,
  /could not find the function/i,
  /does not exist/i,
  /undefined (table|function|column)/i,
  /schema cache/i
]

/**
 * Apakah error menandakan objek database belum ada (migrasi belum dijalankan)?
 *
 * @param {object|string} error objek error Supabase, atau pesan teks
 * @returns {boolean}
 */
function objekBelumAda(error) {
  if (!error) return false

  const kode = typeof error === 'object' ? error.code : null
  if (kode && KODE_OBJEK_TIDAK_ADA.has(kode)) return true

  const pesan =
    typeof error === 'string' ? error : String(error.message || error.details || '')
  if (!pesan) return false

  return POLA_PESAN.some((p) => p.test(pesan))
}

module.exports = { objekBelumAda, KODE_OBJEK_TIDAK_ADA }
