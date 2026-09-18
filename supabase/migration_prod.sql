-- ============================================================
-- SPPG MBG — Migration PRODUCTION
--
-- AMAN DIJALANKAN BERULANG (idempoten) baik pada project:
--   A) yang SUDAH dibuat schema.sql terbaru, maupun
--   B) project lama "first init" (memiliki tabel sekolah_id,
--      TANPA tabel maggot_batches, TANPA kolom suhu_substrat_c/batch_id
--      di sensor_readings). File ini akan mengupgrade otomatis.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Upgrade schema untuk project lama:
--    Pastikan tabel & kolom terbaru ADA sebelum dipakai policy/index.
-- ------------------------------------------------------------

-- 0a) Tabel maggot_batches (baru; tidak ada di skema lama)
create table if not exists maggot_batches (
  id uuid primary key default uuid_generate_v4(),
  batch_kode text not null,
  tanggal_mulai date not null,
  berat_telur_gram numeric not null,
  biaya_beli numeric default 0,
  status text check (status in ('inkubasi', 'aktif_makan', 'siap_panen', 'selesai_panen')) default 'inkubasi',
  catatan text,
  created_at timestamptz default now()
);

-- 0b) Kolom baru di sensor_readings (tidak ada di skema lama)
alter table sensor_readings add column if not exists suhu_substrat_c numeric;
alter table sensor_readings add column if not exists batch_id uuid references maggot_batches(id);

-- 0c) Aktifkan RLS untuk tabel baru (idempoten)
alter table maggot_batches enable row level security;

-- ------------------------------------------------------------
-- 1) RLs di-tighten: hanya service_role (key backend) yang boleh akses.
-- drop + create agar idempoten (CREATE POLICY tidak punya IF NOT EXISTS).
-- ------------------------------------------------------------
drop policy if exists "service role penuh akses" on users;
drop policy if exists "service role penuh akses" on maggot_batches;
drop policy if exists "service role penuh akses" on sensor_readings;
drop policy if exists "service role penuh akses" on menu_uploads;
drop policy if exists "service role penuh akses" on waste_records;
drop policy if exists "service role penuh akses" on maggot_harvests;
drop policy if exists "service role penuh akses" on sales_records;
drop policy if exists "service role penuh akses" on ai_predictions;

create policy "service role penuh akses" on users for all to service_role using (true);
create policy "service role penuh akses" on maggot_batches for all to service_role using (true);
create policy "service role penuh akses" on sensor_readings for all to service_role using (true);
create policy "service role penuh akses" on menu_uploads for all to service_role using (true);
create policy "service role penuh akses" on waste_records for all to service_role using (true);
create policy "service role penuh akses" on maggot_harvests for all to service_role using (true);
create policy "service role penuh akses" on sales_records for all to service_role using (true);
create policy "service role penuh akses" on ai_predictions for all to service_role using (true);

-- ------------------------------------------------------------
-- 2) Bucket menu-foto harus PUBLIC agar foto tampil di dashboard.
--    Pastikan lewat dashboard: Storage > menu-foto > Edit > Public bucket ON.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3) Index untuk query umum dashboard (idempoten).
-- ------------------------------------------------------------
create index if not exists idx_waste_tanggal on waste_records (tanggal);
create index if not exists idx_waste_kategori on waste_records (kategori);
create index if not exists idx_sensor_created on sensor_readings (created_at desc);
create index if not exists idx_batch_created on maggot_batches (created_at desc);
create index if not exists idx_menu_tanggal on menu_uploads (tanggal desc);
create index if not exists idx_sales_tanggal on sales_records (tanggal desc);