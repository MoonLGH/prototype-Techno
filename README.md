# Laundry Yuk! — Prototype Technopreneurship

Platform agregator laundry sekitar kampus UNNES Sekaran, Gunungpati, Semarang.
Dibuat untuk mata kuliah Technopreneurship — Kelompok 2.

## 🚀 Quick Start

```bash
cd prototype-Techno
npm install
npm run seed       # isi database dengan data 9 laundry real
npm start          # → http://localhost:3000
```

## 🧪 Verifikasi (32 E2E Tests)

```bash
npm run verify     # 32/32 pass — API + UI + auth + order + review
```

## 📁 Struktur

```
prototype-Techno/
├── server.js           # Express API (13 endpoints)
├── verify.js           # E2E test runner (spawn server + 32 tests)
├── .env                # konfigurasi
├── data/
│   ├── laundryyuk.db   # SQLite embedded (auto-created)
│   └── seed_*.json     # data riset 9 laundry sekitar UNNES
├── db/
│   ├── schema.sql      # skema: users, laundries, services, reviews, orders, promotions
│   ├── index.js        # koneksi SQLite (better-sqlite3, WAL mode)
│   └── seed.js         # seeder: users, laundry, layanan, review, order mock
└── public/
    ├── index.html       # SPA shell (hash router)
    ├── css/style.css    # playful/vibrant UI — no glassmorphism
    ├── js/app.js        # SPA: 8 view (home, peta, detail, lacak, daftar mitra, dashboard, masuk, daftar)
    └── vendor/leaflet/  # OpenStreetMap tile + marker
```

## 📊 Data Laundry (Real)

9 laundry dari Google Maps + OpenStreetMap, radius ~2.5 km dari UNNES:

| # | Nama | Tipe | Harga/kg | Rating | Jarak |
|---|------|------|----------|--------|-------|
| 1 | MY WASH LAUNDRY SELF SERVICE UNNES | Self Service | Rp4.000–10.000 | 4.8 | 0.42 km |
| 2 | Nyuci Laundry Self Service UNNES | Self Service | Rp4.000–9.000 | 4.6 | 0.85 km |
| 3 | Albarokah Laundry 2 (UNNES) | Kiloan | Rp4.500–10.000 | 4.9 | 0.49 km |
| 4 | Smart Laundry Unnes | Kiloan | Rp5.000–12.000 | 4.9 | 0.58 km |
| 5 | SELF LAUNDRY MBAH DJENGGOT 3 | Self Service | Rp5.000–15.000 | 5.0 | 1.07 km |
| 6 | Arkan Laundry | Kiloan | Rp5.000–11.000 | 4.9 | 0.94 km |
| 7 | Zahra Laundry Kalimasada | Kiloan | Rp5.000–11.000 | 4.7 | 0.61 km |
| 8 | Laundry Room UNNES | Kiloan | Rp6.000–13.000 | 4.9 | 0.75 km |
| 9 | Dewi Laundry | Premium | Rp7.000–25.000 | 4.5 | 2.54 km |

## 🔌 API Endpoints (13)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | /api/meta | Statistik platform (count, avg rating, center) |
| GET | /api/laundries | Daftar laundry (search, filter, sort, pagination) |
| GET | /api/laundries/:slug | Detail laundry + layanan + reviews + promos |
| POST | /api/laundries | Daftarkan usaha baru (owner) |
| POST | /api/laundries/:id/reviews | Kirim ulasan (login required) |
| POST | /api/orders | Buat pesanan laundry |
| GET | /api/orders/track/:code | Lacak status pesanan |
| PATCH | /api/orders/:code/status | Update status pesanan (owner) |
| POST | /api/auth/register | Daftar akun baru |
| POST | /api/auth/login | Masuk |
| POST | /api/auth/logout | Keluar |
| GET | /api/auth/me | Info user login |
| GET | /api/owner/summary | Dashboard mitra (orders, revenue) |

## 👥 Akun Demo

| Email | Password | Role |
|-------|----------|------|
| owner@laundryyuk.id | laundry123 | Pemilik Laundry (Mitra) |
| mahasiswa@unnes.ac.id | laundry123 | Mahasiswa / Pelanggan |
| admin@laundryyuk.id | laundry123 | Admin |

## 🎯 Fitur Utama

- **Peta interaktif** — Leaflet + OpenStreetMap, 9 marker penanda laundry
- **Filter & sort** — harga termurah, jarak terdekat, rating tertinggi, jenis layanan
- **Detail laundry** — harga, layanan, jam buka, review, minimap, promo
- **Pesan langsung** — pilih layanan, masukkan berat, pilih antar-jemput, dapat kode lacak
- **Lacak pesanan** — 5 status: baru → dijemput → dicuci → selesai → diantar
- **Dashboard mitra** — ringkasan order, ubah status, kelola listing
- **Daftar mitra** — onboarding UMKM laundry ke platform
- **Auth** — register/login dengan JWT (httpOnly cookie)

## 🏗 Tech Stack

- **Backend:** Express.js + better-sqlite3 (embedded) + JWT + bcrypt
- **Frontend:** Vanilla JS SPA + hash router + Leaflet.js
- **Database:** SQLite (WAL mode, foreign keys ON, 8 tabel)
- **Data:** Riset lapangan Google Maps & OpenStreetMap (Sept 2026)

## 📝 Analisis Sumber

Prototype ini berdasarkan:
- **Techno_Kelompok 2.docx** — identifikasi masalah, root cause (5-Whys), solusi, model bisnis
- **Analisis SWOT_Kelompok 2.docx** — SWOT, peran CEO/CTO/CMO/CFO, segmentasi pasar & mitra
- **Kelompok 2 Technoperneusip.pptx** — customer persona, wawancara, hasil riset

## ⚡ Development

```bash
npm run dev         # auto-reload (node --watch)
npm run seed        # seed data
npm run reset       # seed --force (hapus & isi ulang)
npm run verify      # E2E test (32 tests)
```

## GitHub Pages (static prototype)

Frontend tersedia dalam mode static di folder `public`. Data laundry dibekukan di `public/data.js`, sedangkan login dan pesanan demo disimpan di `localStorage` browser. Push repository ke branch `main` atau `master`, lalu aktifkan **Settings → Pages → GitHub Actions**. Workflow `.github/workflows/deploy-pages.yml` menerbitkan folder `public` otomatis.
