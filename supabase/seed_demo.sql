insert into waste_records (tanggal, minggu, kategori, berat_kg) values
  (current_date - 7, 'Minggu 1', 'nasi', 120),
  (current_date - 6, 'Minggu 1', 'sayur', 82),
  (current_date - 5, 'Minggu 1', 'lauk', 45);

insert into maggot_harvests (tanggal, berat_kg) values
  (current_date, 35);