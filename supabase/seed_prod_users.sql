-- ============================================================
-- SPPG MBG — Seed akun PRODUCTION
-- Jalankan SEKALI saja pada project Supabase production (bukan demo).
-- Ganti password/hash sesuai kebutuhan. Hash di bawah = "SppgMbg@2026!"
-- Password harus diubah lewat SQL lain atau endpoint jika tersedia.
-- ============================================================

insert into users (nama, email, password_hash, role) values
  ('Super Admin SPPG', 'superadmin@sekolah.id', '$2a$10$GdNnZaQBfojDli9K4q4luOCOsiTeMVoiEe5dmAfTIfZQSAI3gRXWi', 'superadmin'),
  ('Admin Sekolah MBG', 'admin@sekolah.id', '$2a$10$GdNnZaQBfojDli9K4q4luOCOsiTeMVoiEe5dmAfTIfZQSAI3gRXWi', 'admin_sekolah'),
  ('Dapur MBG Wilayah 1', 'dapur@sekolah.id', '$2a$10$GdNnZaQBfojDli9K4q4luOCOsiTeMVoiEe5dmAfTIfZQSAI3gRXWi', 'dapur_mbg')
on conflict (email) do nothing;