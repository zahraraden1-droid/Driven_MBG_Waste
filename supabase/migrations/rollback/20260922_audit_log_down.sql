-- ============================================================================
-- ROLLBACK untuk supabase/migrations/20260922_audit_log.sql
--
-- PERINGATAN — BACA SEBELUM MENJALANKAN:
--   Perintah `drop table` di bawah akan MENGHAPUS SELURUH JEJAK AUDIT yang
--   sudah terkumpul. Jejak audit adalah bukti historis; kehilangannya tidak
--   dapat dipulihkan.
--
--   Sebelum menjalankan, sangat disarankan mengekspor isinya lebih dulu:
--
--     -- di SQL Editor Supabase:
--     select * from audit_log order by dibuat_pada;
--     -- lalu simpan hasilnya (Download CSV).
--
--   Alternatif yang lebih aman: biarkan tabel tetap ada. Tabel yang tidak
--   dipakai tidak membahayakan, sedangkan menghapusnya menghilangkan bukti.
--
-- Sifat: IDEMPOTEN.
-- ============================================================================

-- 1) Hentikan pencatatan: setelah backend di-deploy ulang tanpa fitur audit,
--    tabel boleh dibiarkan. Bila tetap ingin dihapus, jalankan perintah ini.
drop table if exists audit_log;

-- 2) Hapus catatan versi migrasi agar status versi akurat.
delete from schema_migrations where versi = '20260922_audit_log';

-- ============================================================================
-- Verifikasi pasca-rollback:
--   select to_regclass('public.audit_log');   -- harus null
-- ============================================================================
