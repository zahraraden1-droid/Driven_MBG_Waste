# SPPG MBG

Website pengelolaan limbah pangan sekolah dan budidaya maggot BSF. Terdiri dari backend Express, frontend Next.js, dan database Supabase.

## Struktur folder

```
backend/     Express API, autentikasi, koneksi Supabase, pemanggilan AI lokal
frontend/    Next.js App Router, dashboard publik, admin sekolah, dapur MBG, superadmin
supabase/    schema.sql dan seed_demo.sql untuk membuat tabel di Supabase
```

## Role pengguna

- superadmin, akses penuh ke semua dashboard dan kontrol mode demo
- admin_sekolah, mengelola monitoring bilik maggot, input menu, dan penjualan
- dapur_mbg, mengelola korelasi menu, efisiensi limbah, dan pelaporan ke sekolah

## Menjalankan backend

```
cd backend
cp .env.example .env
npm install
npm run dev
```

Isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dari project Supabase Anda. Isi `AI_SERVICE_URL` dengan alamat layanan AI lokal Anda, misalnya `http://localhost:8000`, yang menyediakan endpoint `POST /predict/waste` dan `POST /analyze/menu-correlation`.

## Menjalankan frontend

```
cd frontend
npm install
npm run dev
```

Buat file `.env.local` di folder frontend berisi

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Setup Supabase

1. Buat project baru di Supabase.
2. Jalankan isi `supabase/schema.sql` di SQL editor.
3. Opsional, jalankan `supabase/seed_demo.sql` untuk data contoh.
4. Buat bucket storage bernama `menu-foto` untuk foto menu MBG.
5. Tambahkan user pertama secara manual ke tabel `users` dengan password yang sudah di hash menggunakan bcrypt, atau buat endpoint registrasi tambahan sesuai kebutuhan.

## Mode demo

Mode demo menyala secara default lewat `DEMO_MODE=true` di backend. Saat aktif, semua endpoint mengembalikan data contoh dan fitur AI tidak memanggil layanan lokal. Superadmin bisa menyalakan atau mematikan mode ini langsung dari tombol di navbar, yang memanggil endpoint `POST /api/demo/toggle`. Saat dimatikan, backend akan membaca dari Supabase dan memanggil layanan AI di `AI_SERVICE_URL`.

## Akun demo

```
superadmin@demo.local / demo123
admin@demo.local / demo123
dapur@demo.local / demo123
```

Akun ini hanya berfungsi selama mode demo aktif.
