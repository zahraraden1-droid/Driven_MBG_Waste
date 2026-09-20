/*
 * Rute internal: pembaca jejak audit.
 *
 * Akses DIBATASI pada superadmin. Jejak audit memuat alamat IP, identitas
 * pelaku, dan rincian tindakan operasional — tidak boleh publik.
 *
 * Tabel audit bersifat HANYA TAMBAH. Tidak ada endpoint untuk mengubah atau
 * menghapus baris di sini, dan hal itu disengaja.
 */

const express = require('express')
const supabase = require('../config/supabase')
const requireAuth = require('../middleware/auth')
const requireRole = require('../middleware/roleCheck')
const { auditTersedia } = require('../config/auditTrail')
const { log } = require('../config/observability')
const { objekBelumAda } = require('../config/dbError')

const router = express.Router()

router.use(requireAuth, requireRole('superadmin'))

const MAKS_BARIS = 500

router.get('/', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database tidak dikonfigurasi.' })
  }

  const { aksi, target, pelaku, dari, sampai } = req.query
  const batas = Math.min(Number(req.query.batas) || 100, MAKS_BARIS)

  let query = supabase
    .from('audit_log')
    .select('*')
    .order('dibuat_pada', { ascending: false })
    .limit(batas)

  if (aksi) query = query.eq('aksi', aksi)
  if (target) query = query.eq('target', target)
  if (pelaku) query = query.eq('pelaku_email', pelaku)
  if (dari) query = query.gte('dibuat_pada', dari)
  if (sampai) query = query.lte('dibuat_pada', sampai)

  const { data, error } = await query

  if (error) {
    // Tabel belum ada (migrasi belum dijalankan) dibedakan dari error lain,
    // agar operator langsung tahu langkah yang harus dilakukan.
    if (objekBelumAda(error)) {
      return res.status(503).json({
        error:
          'Tabel audit_log belum ada. Jalankan supabase/migrations/20260922_audit_log.sql',
        jejakAuditAktif: false
      })
    }
    log.error('gagal membaca jejak audit', { error: error.message })
    return res.status(500).json({ error: 'Gagal membaca jejak audit.' })
  }

  res.json({
    jejakAuditAktif: auditTersedia(),
    jumlah: data.length,
    batas,
    catatan:
      'Hanya menampilkan data yang tersedia pada rentang yang diminta. Tabel audit bersifat hanya-tambah; tidak ada endpoint untuk mengubah atau menghapus.',
    data
  })
})

module.exports = router
