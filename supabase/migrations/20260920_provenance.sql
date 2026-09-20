-- ============================================================================
-- SPPG MBG — MIGRASI: PROVENANCE DATA & FILTER KPI PUBLIK
--
-- Tujuan:
--   1. Menambahkan jejak asal data (provenance) pada waste_records sehingga
--      baris hasil model NYATA dan hasil SIMULASI (mock) dapat dibedakan.
--   2. Menyimpan rincian per kelas Roboflow (multi-kelas), bukan hanya kategori.
--   3. Menyediakan tabel parameter densitas per kelas untuk estimasi berat.
--   4. Membuat get_public_kpi() TIDAK lagi memuat baris simulasi maupun
--      baris tanpa nilai (berat_kg <= 0).
--
-- Sifat: IDEMPOTEN (aman dijalankan berulang) dan ADITIF.
--   Tidak ada DROP TABLE / DROP COLUMN pada file ini.
--   Rollback tersedia di supabase/migrations/rollback/20260920_provenance_down.sql
--
-- Cara pakai: tempel seluruh isi file ini ke SQL Editor Supabase produksi.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Provenance pada waste_records
--    sumber       : dari mana baris ini berasal
--    is_simulated : true bila nilai tidak berasal dari model nyata
--    estimasi_mode: nilai `mode` yang dikembalikan roboflowService
--                   ('roboflow' | 'mock')
--    kelas        : kelas asli Roboflow (mis. 'Ayam_Goreng', 'tempe')
--    model_versi  : ID workflow/model yang dipakai saat inferensi
--    confidence_rata_rata : rata-rata confidence deteksi pada sesi tersebut
--    skema_berat  : metode perhitungan berat yang dipakai ('luas_bbox_v1' dst)
-- ----------------------------------------------------------------------------
alter table waste_records add column if not exists sumber text;
alter table waste_records add column if not exists is_simulated boolean not null default false;
alter table waste_records add column if not exists estimasi_mode text;
alter table waste_records add column if not exists kelas text;
alter table waste_records add column if not exists model_versi text;
alter table waste_records add column if not exists confidence_rata_rata numeric;
alter table waste_records add column if not exists skema_berat text;

comment on column waste_records.sumber is
  'Asal baris: roboflow | mock | manual. Diisi backend sejak migrasi provenance.';
comment on column waste_records.is_simulated is
  'true = nilai tidak berasal dari inferensi model nyata; WAJIB dikecualikan dari KPI dan laporan.';
comment on column waste_records.kelas is
  'Kelas asli keluaran Roboflow (multikelas), mis. Ayam_Goreng, tempe, cap_cai, Kelengkeng, nasi.';

-- Batasi nilai mode agar tidak ada nilai asing yang lolos (idempoten, cek dulu).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waste_records_estimasi_mode_chk'
  ) then
    alter table waste_records
      add constraint waste_records_estimasi_mode_chk
      check (estimasi_mode is null or estimasi_mode in ('roboflow','mock','manual','gagal'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'waste_records_berat_nonneg_chk'
  ) then
    alter table waste_records
      add constraint waste_records_berat_nonneg_chk
      check (berat_kg is null or berat_kg >= 0);
  end if;
end $$;

-- Index untuk filter KPI dan analitik
create index if not exists idx_waste_real_only
  on waste_records (tanggal) where (is_simulated = false and berat_kg > 0);
create index if not exists idx_waste_kelas on waste_records (kelas);
create index if not exists idx_waste_minggu on waste_records (minggu);

-- ----------------------------------------------------------------------------
-- 2) Rincian per kelas per sesi (audit trail distribusi berat)
-- ----------------------------------------------------------------------------
create table if not exists waste_record_kelas (
  id uuid primary key default uuid_generate_v4(),
  -- satu grup insert = satu sesi penimbangan; semua baris satu sesi berbagi nilai ini
  sesi_id uuid,
  tanggal date not null,
  minggu text,
  kelas text,
  kategori text,
  berat_kg numeric not null check (berat_kg >= 0),
  proporsi numeric,
  confidence numeric,
  luas_piksel numeric,
  skema_berat text,
  is_simulated boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_wrk_sesi on waste_record_kelas (sesi_id);
create index if not exists idx_wrk_tanggal on waste_record_kelas (tanggal desc);
create index if not exists idx_wrk_kelas on waste_record_kelas (kelas);

alter table waste_record_kelas enable row level security;

drop policy if exists "service role penuh akses" on waste_record_kelas;
create policy "service role penuh akses" on waste_record_kelas
  for all to service_role using (true);

-- ----------------------------------------------------------------------------
-- 3) Parameter densitas per kelas (untuk estimasi berat berbasis citra)
--
--    densitas_relatif : massa relatif per satuan volume nyata, ternormalisasi
--                       terhadap nasi = 1.00
--    faktor_bentuk    : koreksi 3D->2D terhadap bounding box
--    STATUS NILAI     : BELUM TERVALIDASI. Nilai di bawah adalah titik mulai
--                       yang HARUS dikalibrasi dengan penimbangan acuan
--                       (lihat docs/VALIDASI_PENGUJIAN.md).
-- ----------------------------------------------------------------------------
create table if not exists food_density (
  kelas text primary key,
  kategori text not null,
  densitas_relatif numeric not null default 0.80,
  faktor_bentuk numeric not null default 1.00,
  sumber text,
  versi text not null default 'v0-belum-tervalidasi',
  diperbarui_pada timestamptz default now()
);

comment on table food_density is
  'Parameter estimasi berat. Nilai versi v0 BELUM TERVALIDASI dan wajib dikalibrasi ulang.';

insert into food_density (kelas, kategori, densitas_relatif, faktor_bentuk, sumber, versi) values
  ('nasi',        'nasi',   1.00, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('rice',        'nasi',   1.00, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('tempe',       'lauk',   0.95, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('tahu',        'lauk',   0.90, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('Ayam_Goreng', 'lauk',   0.70, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('ayam',        'lauk',   0.70, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('ikan',        'lauk',   0.75, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('telur',       'lauk',   0.95, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('cap_cai',     'sayur',  0.55, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('sayur',       'sayur',  0.55, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('Kelengkeng',  'buah',   0.65, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('pisang',      'buah',   0.65, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi'),
  ('buah',        'buah',   0.65, 1.00, 'asumsi awal (belum diukur)', 'v0-belum-tervalidasi')
on conflict (kelas) do nothing;

-- ----------------------------------------------------------------------------
-- 4) Tahap A: pindahkan rincian multikelas yang BELUM terpetakan dengan aman.
--
--    CATATAN PENTING: kolom `kelas` belum ada pada data lama, sehingga
--    pemetaan per-kelas untuk riwayat TIDAK DAPAT direkonstruksi dan tidak
--    boleh ditebak. Yang dilakukan di sini hanya menyalin baris lama apa
--    adanya agar tersedia satu tempat untuk audit lanjutan.
--
--    Baris lama TIDAK dihapus dari waste_records (demi keamanan rollback),
--    tetapi hanya disalin bila belum pernah disalin (idempoten).
-- ----------------------------------------------------------------------------
insert into waste_record_kelas (sesi_id, tanggal, minggu, kelas, kategori, berat_kg, proporsi, confidence, luas_piksel, skema_berat, is_simulated, created_at)
select
  -- Sesi didekati dari kombinasi tanggal+minggu+created_at (satu grup insert)
  md5(coalesce(w.tanggal::text,'') || '|' || coalesce(w.minggu,'') || '|' || coalesce(w.created_at::text,''))::uuid,
  w.tanggal,
  w.minggu,
  null,                     -- kelas asli tidak diketahui untuk data lama
  w.kategori,
  w.berat_kg,
  null,
  null,
  null,
  'luas_bbox_v1',           -- metode yang berlaku saat data lama dibuat
  coalesce(w.is_simulated, false),
  w.created_at
from waste_records w
where not exists (
  select 1 from waste_record_kelas k
  where k.sesi_id = md5(coalesce(w.tanggal::text,'') || '|' || coalesce(w.minggu,'') || '|' || coalesce(w.created_at::text,''))::uuid
    and k.kategori = w.kategori
    and k.berat_kg = w.berat_kg
);

-- ----------------------------------------------------------------------------
-- 5) get_public_kpi() — hanya data nyata dan hanya nilai bermakna
--
--    Perubahan perilaku (disengaja):
--      - Kecualikan is_simulated = true
--      - Kecualikan berat_kg <= 0 (sesi gagal baca load cell)
--    Rollback: kembalikan definisi lama (lihat file rollback).
-- ----------------------------------------------------------------------------
create or replace function get_public_kpi()
returns json
language sql
stable
as $$
  select json_build_object(
    'totalLimbahTerolahKg',
      coalesce((select sum(berat_kg) from waste_records
                where is_simulated = false and berat_kg > 0), 0),
    'totalPanenMaggotKg',
      coalesce((select sum(berat_kg) from maggot_harvests), 0),
    'penghematanEmisiCo2e',
      -- Faktor 0.52 kg CO2e per kg limbah: BELUM ADA RUJUKAN di dalam kode.
      -- Angka ini tayang di dashboard publik; wajib diberi sumber atau ditandai
      -- sebagai estimasi indikatif.
      coalesce((select sum(berat_kg) * 0.52 from waste_records
                where is_simulated = false and berat_kg > 0), 0),
    'cakupanData',
      json_build_object(
        'barisNyata', (select count(*) from waste_records where is_simulated = false and berat_kg > 0),
        'barisSimulasi', (select count(*) from waste_records where is_simulated = true),
        'hariObservasi', (select count(distinct tanggal) from waste_records where is_simulated = false and berat_kg > 0),
        'pertama', (select min(tanggal) from waste_records where is_simulated = false and berat_kg > 0),
        'terakhir', (select max(tanggal) from waste_records where is_simulated = false and berat_kg > 0)
      )
  );
$$;

-- Versi kedua untuk perbandingan berdampingan selama masa transisi
create or replace function get_public_kpi_v2()
returns json
language sql
stable
as $$
  select json_build_object(
    'lama_tanpa_filter', json_build_object(
      'totalLimbahTerolahKg', coalesce((select sum(berat_kg) from waste_records), 0),
      'totalPanenMaggotKg', coalesce((select sum(berat_kg) from maggot_harvests), 0),
      'penghematanEmisiCo2e', coalesce((select sum(berat_kg) * 0.52 from waste_records), 0)
    ),
    'baru_dengan_filter', get_public_kpi()
  );
$$;

-- ----------------------------------------------------------------------------
-- 6) Catat migrasi + catatan
--
--    Kolom warisan `sekolah_id` SENGAJA TIDAK dihapus pada migrasi ini.
--    Alasan: penghapusan kolom membutuhkan keputusan terpisah dan verifikasi
--    bahwa tidak ada kode lain yang membacanya. Rencana pembersihan ada di
--    docs/AUDIT_PRODUCTION_READINESS.md, dengan file migrasi tersendiri.
--
--    Pencatatan versi di bawah ini memerlukan tabel schema_migrations dari
--    migrasi bootstrap (20260919_bootstrap_versi.sql). Karena berkas ini harus
--    tetap dapat dijalankan pada database yang belum pernah dimigrasikan,
--    tabel tersebut dibuat di sini bila belum ada.
-- ----------------------------------------------------------------------------
create table if not exists schema_migrations (
  versi text primary key,
  keterangan text,
  dijalankan_pada timestamptz not null default now()
);

insert into schema_migrations (versi, keterangan)
values ('20260920_provenance', 'Provenance data, food_density, waste_record_kelas, filter KPI')
on conflict (versi) do nothing;

-- ============================================================================
