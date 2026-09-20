-- ============================================================================
-- SPPG MBG — MIGRASI 00 (BOOTSTRAP): TABEL VERSI MIGRASI
--
-- Migrasi ini HARUS dijalankan PALING AWAL, sebelum migrasi lain, karena
-- migrasi-migrasi berikutnya mencatatkan dirinya ke tabel ini.
--
-- Latar belakang: sebelumnya tidak ada pencatatan versi sama sekali, sehingga
-- versi skema yang aktif di produksi tidak dapat diketahui tanpa audit manual.
-- Audit 20 September 2026 menemukan skema produksi tertinggal (kolom
-- `sekolah_id` warisan masih ada) justru karena tidak ada pencatatan ini.
--
-- Sifat: IDEMPOTEN dan ADITIF.
-- Rollback: TIDAK disediakan secara sengaja. Menghapus catatan versi migrasi
--   akan menghilangkan informasi penting tanpa manfaat. Tabel ini tidak
--   mengubah perilaku aplikasi, sehingga aman dibiarkan.
-- ============================================================================

create table if not exists schema_migrations (
  versi text primary key,
  keterangan text,
  dijalankan_pada timestamptz not null default now()
);

comment on table schema_migrations is
  'Catatan migrasi yang sudah dijalankan. Setiap berkas migrasi mencatatkan versinya di akhir berkas.';

-- Catat migrasi bootstrap ini sendiri.
insert into schema_migrations (versi, keterangan)
values ('20260919_bootstrap_versi', 'Membuat tabel schema_migrations')
on conflict (versi) do nothing;
