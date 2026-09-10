insert into schools (nama, kontak, alamat) values
  ('SDN 01 Cempaka', '0812xxxxxx1', 'Jl. Cempaka No. 1'),
  ('SMPN 04 Melati', '0812xxxxxx2', 'Jl. Melati No. 4');

insert into waste_records (sekolah_id, tanggal, minggu, kategori, berat_kg)
select id, current_date - 7, 'Minggu 1', 'nasi', 120 from schools where nama = 'SDN 01 Cempaka';

insert into maggot_harvests (sekolah_id, tanggal, berat_kg)
select id, current_date, 35 from schools where nama = 'SDN 01 Cempaka';
