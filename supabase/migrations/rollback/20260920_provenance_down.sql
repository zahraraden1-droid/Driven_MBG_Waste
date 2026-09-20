-- ============================================================================
-- ROLLBACK untuk supabase/migrations/20260920_provenance.sql
--
-- Tujuan: mengembalikan database ke kondisi SEBELUM migrasi provenance.
-- Sifat  : IDEMPOTEN. Aman dijalankan walau migrasi maju belum pernah dijalankan.
--
-- PERINGATAN PENTING — BACA SEBELUM MENJALANKAN:
--   Menjalankan file ini akan MENGHAPUS kolom provenance dan tabel
--   waste_record_kelas, sehingga:
--     * Jejak asal data (sumber/is_simulated/kelas/confidence) hilang permanen.
--     * Data simulasi akan kembali tercampur tanpa bisa dipisahkan.
--     * Data di waste_records (termasuk baris simulasi) TIDAK dihapus, sehingga
--       get_public_kpi() versi lama akan kembali memuat baris simulasi.
--   Pastikan sudah melakukan backup (Backup database / pg_dump) sebelum menjalankan.
--
-- Yang TIDAK dilakukan file ini: menghapus baris dari waste_records.
--   Sangat disarankan membersihkan baris simulasi secara sadar dan terpisah,
--   dengan pencatatan, bukan sebagai efek samping rollback.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Kembalikan definisi get_public_kpi() ke versi LAMA (tanpa filter)
--    Ini yang mengembalikan perilaku lama, jadi dijalankan lebih dulu agar
--    aplikasi langsung kembali ke kondisi sebelumnya.
-- ----------------------------------------------------------------------------
create or replace function get_public_kpi()
returns json
language sql
as $$
  select json_build_object(
    'totalLimbahTerolahKg', coalesce((select sum(berat_kg) from waste_records), 0),
    'totalPanenMaggotKg', coalesce((select sum(berat_kg) from maggot_harvests), 0),
    'penghematanEmisiCo2e', coalesce((select sum(berat_kg) * 0.52 from waste_records), 0)
  );
$$;

drop function if exists get_public_kpi_v2();

-- ----------------------------------------------------------------------------
-- 2) Lepaskan constraint dan index yang ditambahkan
-- ----------------------------------------------------------------------------
alter table waste_records drop constraint if exists waste_records_estimasi_mode_chk;
alter table waste_records drop constraint if exists waste_records_berat_nonneg_chk;

drop index if exists idx_waste_real_only;
drop index if exists idx_waste_kelas;
drop index if exists idx_waste_minggu;

-- ----------------------------------------------------------------------------
-- 3) Hapus tabel baru
-- ----------------------------------------------------------------------------
drop table if exists waste_record_kelas;
drop table if exists food_density;

-- ----------------------------------------------------------------------------
-- 4) Hapus kolom provenance yang ditambahkan
-- ----------------------------------------------------------------------------
alter table waste_records drop column if exists sumber;
alter table waste_records drop column if exists is_simulated;
alter table waste_records drop column if exists estimasi_mode;
alter table waste_records drop column if exists kelas;
alter table waste_records drop column if exists model_versi;
alter table waste_records drop column if exists confidence_rata_rata;
alter table waste_records drop column if exists skema_berat;

-- ============================================================================
-- Verifikasi pasca-rollback (jalankan untuk memastikan):
--   select get_public_kpi();                       -- harus kembali tanpa cakupanData
--   select column_name from information_schema.columns
--    where table_name = 'waste_records';           -- tidak ada kolom provenance
--   select to_regclass('public.waste_record_kelas');  -- harus null
-- ============================================================================
