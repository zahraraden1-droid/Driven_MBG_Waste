/*
 * Jejak audit tindakan operator (audit trail).
 *
 * MASALAH YANG DIPERBAIKI
 * Tidak ada catatan siapa melakukan apa. Tindakan berikut sebelumnya tidak
 * meninggalkan jejak apa pun:
 *   - mengirim perintah ke perangkat (termasuk `reboot` dan `set_scale_factor`)
 *   - menandai batch selesai panen
 *   - mengubah mode demo & mode pemeliharaan
 *
 * Akibatnya, ketika angka timbangan berubah tanpa sebab atau perangkat reboot
 * sendiri, tidak ada cara mengetahui apakah itu tindakan operator, kesalahan
 * konfigurasi, atau gangguan perangkat.
 *
 * PRINSIP
 *   1. Pencatatan audit TIDAK BOLEH menggagalkan operasi utama. Bila tabel
 *      audit belum ada (migrasi belum dijalankan), operasi tetap berhasil dan
 *      hanya dicatat sebagai peringatan di log.
 *   2. Nilai sensitif dibersihkan sebelum disimpan.
 *   3. Tabel audit bersifat HANYA TAMBAH (append-only); tidak ada jalur di
 *      aplikasi yang memperbarui atau menghapus barisnya.
 */

const supabase = require('./supabase')
const { log } = require('./observability')
const { objekBelumAda } = require('./dbError')

// Bila tabel belum ada, jangan mencoba lagi pada setiap permintaan.
let tabelTersedia = true

const KUNCI_SENSITIF = /password|secret|token|api[_-]?key|authorization/i

/** Membersihkan nilai sensitif dari detail sebelum disimpan. */
function bersihkanDetail(detail) {
  if (detail === null || detail === undefined) return null
  if (typeof detail !== 'object') return { nilai: String(detail) }

  const hasil = {}
  for (const [k, v] of Object.entries(detail)) {
    if (KUNCI_SENSITIF.test(k)) {
      hasil[k] = '[DISENSOR]'
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      hasil[k] = bersihkanDetail(v)
    } else {
      hasil[k] = v
    }
  }
  return hasil
}

/**
 * Mencatat satu tindakan.
 *
 * @param {object} opsi
 * @param {object} opsi.req     objek permintaan Express (untuk mengambil pelaku & requestId)
 * @param {string} opsi.aksi    nama tindakan, mis. 'perangkat.perintah'
 * @param {string} opsi.target  objek yang dikenai tindakan, mis. 'smart-container'
 * @param {object} opsi.detail  rincian tambahan (akan dibersihkan)
 * @param {boolean} opsi.berhasil apakah tindakan berhasil
 * @param {string} opsi.pesan   keterangan singkat
 */
async function catatAudit({ req = null, aksi, target = null, detail = null, berhasil = true, pesan = null }) {
  const baris = {
    aksi,
    target,
    detail: bersihkanDetail(detail),
    berhasil: Boolean(berhasil),
    pesan,
    pelaku_id: req?.user?.id || null,
    pelaku_email: req?.user?.email || null,
    pelaku_role: req?.user?.role || null,
    request_id: req?.requestId || null,
    alamat_ip: req?.ip || null,
    dibuat_pada: new Date().toISOString()
  }

  if (!supabase || !tabelTersedia) {
    log.info('audit (tidak tersimpan)', { aksi, target, berhasil })
    return { tersimpan: false }
  }

  const { error } = await supabase.from('audit_log').insert(baris)

  if (error) {
    // Jangan pernah menggagalkan operasi utama hanya karena audit gagal.
    if (objekBelumAda(error)) {
      tabelTersedia = false
      log.warn(
        'tabel audit_log belum ada — jejak audit tidak tersimpan. ' +
          'Jalankan supabase/migrations/20260922_audit_log.sql'
      )
    } else {
      log.error('gagal menulis jejak audit', { aksi, target, error: error.message })
    }
    return { tersimpan: false, error: error.message }
  }

  return { tersimpan: true }
}

/** Apakah tabel audit diketahui tersedia (dipakai endpoint pembaca audit). */
function auditTersedia() {
  return Boolean(supabase) && tabelTersedia
}

module.exports = { catatAudit, bersihkanDetail, auditTersedia }
