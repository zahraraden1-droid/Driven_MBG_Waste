-- ============================================================
-- SPPG MBG — Seed akun PRODUCTION
--
-- Jalankan SEKALI pada project Supabase production (bukan demo).
--
-- KEAMANAN — BACA SEBELUM MENJALANKAN
-- Berkas versi sebelumnya memuat HASH KATA SANDI dengan kata sandinya
-- dituliskan sebagai komentar. Karena berkas ini terlacak git, kata sandi
-- tersebut harus dianggap BOCOR, dan hash-nya pun tidak lagi layak dipakai.
--
-- Karena itu berkas ini TIDAK lagi memuat hash siap pakai. Anda WAJIB membuat
-- hash sendiri dengan kata sandi yang Anda pilih, lalu menempelkannya di bawah.
--
-- CARA MEMBUAT HASH (bcryptjs sudah tersedia di backend):
--
--     cd backend
--     node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'KataSandiPilihanAnda'
--
-- Jalankan perintah di atas SEKALI PER AKUN dengan kata sandi BERBEDA, lalu
-- gantikan nilai 'GANTI_DENGAN_HASH_BCRYPT' di bawah.
--
-- JANGAN menuliskan kata sandi pada berkas ini, walaupun hanya sebagai komentar.
-- ============================================================

insert into users (nama, email, password_hash, role) values
  ('Super Admin SPPG',   'superadmin@sekolah.id', 'GANTI_DENGAN_HASH_BCRYPT', 'superadmin'),
  ('Admin Sekolah MBG',  'admin@sekolah.id',      'GANTI_DENGAN_HASH_BCRYPT', 'admin_sekolah'),
  ('Dapur MBG Wilayah 1','dapur@sekolah.id',      'GANTI_DENGAN_HASH_BCRYPT', 'dapur_mbg')
on conflict (email) do nothing;

-- ============================================================
-- VERIFIKASI setelah menjalankan
--   select nama, email, role,
--          (password_hash = 'GANTI_DENGAN_HASH_BCRYPT') as belum_diganti
--   from users order by role;
--
-- Pastikan kolom belum_diganti bernilai false untuk SEMUA baris.
-- Bila ada yang true, akun tersebut tidak dapat dipakai login.
-- ============================================================
