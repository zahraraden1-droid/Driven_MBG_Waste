-- ============================================================================
-- ROLLBACK untuk supabase/migrations/20260921_agregasi_dan_state.sql
--
-- Mengembalikan database ke kondisi sebelum migrasi tersebut.
-- Sifat: IDEMPOTEN. Aman dijalankan walau migrasi maju belum pernah dijalankan.
--
-- PERINGATAN:
--   * Tabel `system_state` akan dihapus, sehingga state mode pemeliharaan dan
--     mode demo yang tersimpan HILANG. Setelah rollback, backend harus
--     di-deploy ulang ke versi yang memakai state in-memory.
--   * Fungsi agregasi publik akan dihapus, sehingga endpoint publik
--     (/api/public/waste-by-category, /tren, /kualitas-data) GAGAL sampai
--     backend versi sebelumnya di-deploy. Urutkan: rollback backend dulu,
--     baru rollback database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Hapus fungsi agregasi
-- ----------------------------------------------------------------------------
drop function if exists get_public_peringkat_kategori();
drop function if exists get_public_kualitas_data();
drop function if exists get_public_tren(text);
drop function if exists get_public_waste_by_category();

-- ----------------------------------------------------------------------------
-- 2) Hapus tabel state
-- ----------------------------------------------------------------------------
drop table if exists system_state;

-- ----------------------------------------------------------------------------
-- 3) Catatan versi migrasi
--    Tabel schema_migrations SENGAJA TIDAK dihapus: ia berguna untuk migrasi
--    berikutnya dan tidak berbahaya bila dibiarkan. Hanya baris migrasi ini
--    yang dihapus agar status versi akurat.
-- ----------------------------------------------------------------------------
delete from schema_migrations where versi = '20260921_agregasi_dan_state';

-- ============================================================================
-- Verifikasi pasca-rollback:
--   select version from schema_migrations;
--   -- harus tidak memuat 20260921_agregasi_dan_state
--   select to_regclass('public.system_state');            -- harus null
--   select to_regprocedure('get_public_waste_by_category()'); -- harus null
-- ============================================================================
