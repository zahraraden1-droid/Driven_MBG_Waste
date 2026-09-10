create extension if not exists "uuid-ossp";

create table if not exists schools (
  id uuid primary key default uuid_generate_v4(),
  nama text not null,
  kontak text,
  alamat text,
  created_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  nama text not null,
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('superadmin', 'admin_sekolah', 'dapur_mbg')),
  sekolah_id uuid references schools(id),
  created_at timestamptz default now()
);

create table if not exists sensor_readings (
  id uuid primary key default uuid_generate_v4(),
  sekolah_id uuid references schools(id),
  suhu_bilik_c numeric,
  kelembaban_persen numeric,
  kadar_amonia_ppm numeric,
  estimasi_berat_maggot_kg numeric,
  created_at timestamptz default now()
);

create table if not exists menu_uploads (
  id uuid primary key default uuid_generate_v4(),
  sekolah_id uuid references schools(id),
  tanggal date not null,
  nama text not null,
  kalori numeric,
  protein numeric,
  foto_url text,
  created_at timestamptz default now()
);

create table if not exists waste_records (
  id uuid primary key default uuid_generate_v4(),
  sekolah_id uuid references schools(id),
  tanggal date not null,
  minggu text,
  kategori text check (kategori in ('nasi', 'sayur', 'lauk', 'buah', 'lainnya')),
  berat_kg numeric not null,
  created_at timestamptz default now()
);

create table if not exists maggot_harvests (
  id uuid primary key default uuid_generate_v4(),
  sekolah_id uuid references schools(id),
  tanggal date not null,
  berat_kg numeric not null,
  created_at timestamptz default now()
);

create table if not exists sales_records (
  id uuid primary key default uuid_generate_v4(),
  sekolah_id uuid references schools(id),
  tanggal date not null,
  jenis text check (jenis in ('segar', 'kering')),
  berat_kg numeric not null,
  harga_per_kg numeric not null,
  total numeric not null,
  created_at timestamptz default now()
);

create table if not exists ai_predictions (
  id uuid primary key default uuid_generate_v4(),
  sekolah_id uuid references schools(id),
  estimasi_volume_limbah_harian_kg numeric,
  prediksi_jadwal_panen date,
  catatan text,
  created_at timestamptz default now()
);

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

alter table users enable row level security;
alter table sensor_readings enable row level security;
alter table menu_uploads enable row level security;
alter table waste_records enable row level security;
alter table maggot_harvests enable row level security;
alter table sales_records enable row level security;
alter table ai_predictions enable row level security;

create policy "service role penuh akses" on users for all using (true);
create policy "service role penuh akses" on sensor_readings for all using (true);
create policy "service role penuh akses" on menu_uploads for all using (true);
create policy "service role penuh akses" on waste_records for all using (true);
create policy "service role penuh akses" on maggot_harvests for all using (true);
create policy "service role penuh akses" on sales_records for all using (true);
create policy "service role penuh akses" on ai_predictions for all using (true);
