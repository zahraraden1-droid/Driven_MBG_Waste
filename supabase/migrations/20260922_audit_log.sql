-- ============================================================================
-- SPPG MBG — MIGRASI: JEJAK AUDIT TINDAKAN OPERATOR
--
-- Tujuan:
--   Mencatat siapa melakukan apa pada sistem: perintah perangkat (termasuk
--   reboot dan perubahan kalibrasi), penandaan panen, perubahan mode demo dan
--   mode pemeliharaan.
--
-- Sebelum migrasi ini, tindakan-tindakan tersebut tidak meninggalkan jejak
-- sama sekali. Ketika angka timbangan berubah tanpa sebab atau perangkat
-- reboot sendiri, tidak ada cara membedakan tindakan operator dari gangguan.
--
-- Sifat: IDEMPOTEN dan ADITIF (hanya menambah tabel baru).
-- Rollback: supabase/migrations/rollback/20260922_audit_log_down.sql
--
-- CATATAN: tabel ini bersifat HANYA TAMBAH (append-only). Tidak ada policy
-- untuk UPDATE/DELETE, sehingga jejak audit tidak dapat diubah dari aplikasi.
-- ============================================================================

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  aksi text not null,
  target text,
  detail jsonb,
  berhasil boolean not null default true,
  pesan text,
  pelaku_id text,
  pelaku_email text,
  pelaku_role text,
  request_id text,
  alamat_ip text,
  dibuat_pada timestamptz not null default now()
);

comment on table audit_log is
  'Jejak audit tindakan operator. Hanya tambah — tidak boleh diubah atau dihapus dari aplikasi.';
comment on column audit_log.detail is
  'Rincian tindakan. Nilai yang terlihat seperti kredensial disensor sebelum disimpan.';

-- Index untuk penelusuran: terbaru dulu, per pelaku, per target, per jenis aksi.
create index if not exists idx_audit_dibuat on audit_log (dibuat_pada desc);
create index if not exists idx_audit_aksi on audit_log (aksi);
create index if not exists idx_audit_target on audit_log (target);
create index if not exists idx_audit_pelaku on audit_log (pelaku_email);

alter table audit_log enable row level security;

-- Hanya service_role (backend) yang boleh mengakses. Tidak ada policy
-- UPDATE/DELETE, sehingga baris audit tidak dapat diubah dari aplikasi.
drop policy if exists "service role penuh akses" on audit_log;
create policy "service role penuh akses" on audit_log
  for all to service_role using (true);

-- Catat migrasi ini.
create table if not exists schema_migrations (
  versi text primary key,
  keterangan text,
  dijalankan_pada timestamptz not null default now()
);

insert into schema_migrations (versi, keterangan)
values ('20260922_audit_log', 'Tabel audit_log untuk jejak tindakan operator')
on conflict (versi) do nothing;
