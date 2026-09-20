-- ============================================================================
-- SPPG MBG — MIGRASI: AGREGASI PUBLIK, VERSI MIGRASI, DAN STATE SISTEM
--
-- Tujuan:
--   1. Memindahkan agregasi data dari Node ke SQL. Sebelumnya endpoint publik
--      mengambil SELURUH tabel lalu menjumlahkan di memori proses, yang tidak
--      akan bertahan ketika data bertambah.
--   2. Mencatat versi migrasi yang sudah dijalankan (database saat ini tertinggal
--      dari source dan tidak ada cara mengetahuinya tanpa audit manual).
--   3. Memindahkan state sistem (mode pemeliharaan & mode demo) dari memori
--      proses ke database, karena state in-memory hilang setiap deploy dan
--      RUSAK bila layanan berjalan lebih dari satu replika.
--
-- Bergantung pada: 20260920_provenance.sql  (WAJIB dijalankan lebih dulu)
-- Sifat: IDEMPOTEN dan ADITIF.
-- Rollback: supabase/migrations/rollback/20260921_agregasi_dan_state_down.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Pastikan migrasi prasyarat sudah dijalankan
--    Bila kolom provenance belum ada, fungsi agregasi di bawah akan gagal
--    dengan pesan yang membingungkan. Lebih baik gagal lebih awal dan jelas.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'waste_records' and column_name = 'is_simulated'
  ) then
    raise exception
      'Migrasi prasyarat belum dijalankan: kolom waste_records.is_simulated tidak ada. Jalankan supabase/migrations/20260920_provenance.sql lebih dulu.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) Versi migrasi
--    Tabel ini dibuat oleh 20260919_bootstrap_versi.sql. Blok di bawah membuatnya
--    bila belum ada, agar berkas ini tetap dapat dijalankan sendiri.
-- ----------------------------------------------------------------------------
create table if not exists schema_migrations (
  versi text primary key,
  keterangan text,
  dijalankan_pada timestamptz not null default now()
);

comment on table schema_migrations is
  'Catatan migrasi yang sudah dijalankan. Diisi manual di akhir setiap berkas migrasi.';

-- ----------------------------------------------------------------------------
-- 2) State sistem (mode pemeliharaan & mode demo)
--
--    Nilai disimpan sebagai teks JSON agar fleksibel dan dapat diaudit.
-- ----------------------------------------------------------------------------
create table if not exists system_state (
  kunci text primary key,
  nilai jsonb not null,
  diperbarui_pada timestamptz not null default now(),
  diperbarui_oleh text
);

comment on table system_state is
  'State aplikasi yang harus bertahan lintas deploy dan konsisten antar replika.';

alter table system_state enable row level security;

drop policy if exists "service role penuh akses" on system_state;
create policy "service role penuh akses" on system_state
  for all to service_role using (true);

-- Nilai awal: mode pemeliharaan mati, mode demo mengikuti env DEMO_MODE.
-- on conflict do nothing -> nilai yang sudah ada TIDAK ditimpa saat migrasi diulang.
insert into system_state (kunci, nilai, diperbarui_oleh)
values
  ('maintenance_mode', '{"aktif": false}'::jsonb, 'migrasi-20260921'),
  ('demo_mode',        '{"aktif": false}'::jsonb, 'migrasi-20260921')
on conflict (kunci) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Agregasi publik per kategori
--
--    Menggantikan pengambilan seluruh tabel oleh Node. Hanya menghitung data
--    NYATA dan nilai yang bermakna (berat_kg > 0), sehingga kategori bernilai
--    nol tidak lagi muncul di grafik publik.
-- ----------------------------------------------------------------------------
create or replace function get_public_waste_by_category()
returns table (
  kategori text,
  berat_kg numeric,
  persentase numeric,
  jumlah_records bigint
)
language sql
stable
as $$
  with dasar as (
    select
      w.kategori,
      sum(w.berat_kg) as berat_kg,
      count(*) as jumlah_records
    from waste_records w
    where w.is_simulated = false
      and w.berat_kg > 0
      and w.kategori is not null
    group by w.kategori
  ),
  total as (
    select nullif(sum(dasar.berat_kg), 0) as t from dasar
  )
  select
    d.kategori,
    round(d.berat_kg, 3) as berat_kg,
    round((d.berat_kg / (select t from total)) * 100, 1) as persentase,
    d.jumlah_records
  from dasar d
  order by d.berat_kg desc;
$$;

comment on function get_public_waste_by_category() is
  'Agregasi kategori limbah (data nyata saja). Dipakai endpoint publik /api/public/waste-by-category.';

-- ----------------------------------------------------------------------------
-- 4) Tren per periode (hari / minggu / bulan)
-- ----------------------------------------------------------------------------
create or replace function get_public_tren(p_periode text default 'hari')
returns table (
  periode text,
  total_berat_kg numeric,
  jumlah_records bigint
)
language sql
stable
as $$
  select
    case
      when p_periode = 'bulan' then to_char(w.tanggal, 'YYYY-MM')
      when p_periode = 'minggu' then coalesce(w.minggu, to_char(w.tanggal, 'IYYY-"M"IW'))
      else to_char(w.tanggal, 'YYYY-MM-DD')
    end as periode,
    round(sum(w.berat_kg), 3) as total_berat_kg,
    count(*) as jumlah_records
  from waste_records w
  where w.is_simulated = false
    and w.berat_kg > 0
  group by 1
  order by 1;
$$;

comment on function get_public_tren(text) is
  'Tren limbah per periode. p_periode: hari | minggu | bulan. Hanya data nyata.';

-- ----------------------------------------------------------------------------
-- 5) Cakupan & kualitas data
--
--    Fungsi ini menjawab pertanyaan "seberapa besar data di balik angka ini".
--    Tanpa ini, pembaca dashboard tidak dapat menilai apakah suatu angka
--    mewakili satu hari atau satu tahun pengamatan.
-- ----------------------------------------------------------------------------
create or replace function get_public_kualitas_data()
returns json
language sql
stable
as $$
  with nyata as (
    select * from waste_records where is_simulated = false and berat_kg > 0
  )
  select json_build_object(
    'jumlahBarisNyata', (select count(*) from nyata),
    'jumlahBarisSimulasi', (select count(*) from waste_records where is_simulated = true),
    'jumlahBarisNol', (select count(*) from waste_records where berat_kg = 0),
    'jumlahHariObservasi', (select count(distinct tanggal) from nyata),
    'tanggalPertama', (select min(tanggal) from nyata),
    'tanggalTerakhir', (select max(tanggal) from nyata),
    'jumlahKelasTerlihat', (select count(distinct kelas) from nyata where kelas is not null),
    'jumlahKategori', (select count(distinct kategori) from nyata),
    'adaDataSimulasi', (select exists (select 1 from waste_records where is_simulated = true)),
    'totalBeratKg', coalesce((select round(sum(berat_kg), 3) from nyata), 0)
  );
$$;

comment on function get_public_kualitas_data() is
  'Cakupan dan kualitas data untuk ditampilkan terbuka di dashboard publik.';

-- ----------------------------------------------------------------------------
-- 6) Peringkat kategori untuk SPPG (persentase sisa)
--    Sama dengan agregasi kategori, tetapi dengan peringkat eksplisit agar
--    frontend tidak perlu menghitung ulang.
-- ----------------------------------------------------------------------------
create or replace function get_public_peringkat_kategori()
returns table (
  peringkat integer,
  kategori text,
  berat_kg numeric,
  persentase numeric
)
language sql
stable
as $$
  select
    row_number() over (order by a.berat_kg desc)::int as peringkat,
    a.kategori,
    a.berat_kg,
    a.persentase
  from get_public_waste_by_category() a;
$$;

comment on function get_public_peringkat_kategori() is
  'Peringkat kategori sisa makanan terbanyak, untuk halaman publik dan evaluasi menu SPPG.';

-- ----------------------------------------------------------------------------
-- 7) Catat migrasi ini sebagai sudah dijalankan
-- ----------------------------------------------------------------------------
insert into schema_migrations (versi, keterangan)
values ('20260921_agregasi_dan_state', 'Agregasi publik, versi migrasi, dan tabel state sistem')
on conflict (versi) do nothing;

-- Sertakan juga migrasi sebelumnya bila belum tercatat
insert into schema_migrations (versi, keterangan)
values ('20260920_provenance', 'Provenance data, food_density, waste_record_kelas, filter KPI')
on conflict (versi) do nothing;
