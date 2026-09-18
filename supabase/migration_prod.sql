-- ============================================================
-- SPPG MBG — Migration PRODUCTION
-- Menjalankan ini pada project Supabase yang SUDAH dibuat schema.sql
-- (aman dijalankan berulang / idempoten).
-- ============================================================

-- 1) Tighten RLs: policy lama terbuka ke semua role (termasuk publik/anon).
--    Ubah agar hanya service_role (key backend) yang boleh akses.
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

-- 2) Bucket menu-foto harus PUBLIC agar foto tampil di dashboard.
--    Pastikan bucket ini publik lewat dashboard: Storage > menu-foto > Edit > Public bucket ON.

-- 3) Index untuk query umum yang sering dipakai dashboard.
create index if not exists idx_waste_tanggal on waste_records (tanggal);
create index if not exists idx_waste_kategori on waste_records (kategori);
create index if not exists idx_sensor_created on sensor_readings (created_at desc);
create index if not exists idx_batch_created on maggot_batches (created_at desc);
create index if not exists idx_menu_tanggal on menu_uploads (tanggal desc);
create index if not exists idx_sales_tanggal on sales_records (tanggal desc);