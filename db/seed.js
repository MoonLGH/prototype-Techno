// ============================================================
//  Laundry Yuk! — Seeder: isi database dengan data riset nyata
//  Sumber: Google Maps + OpenStreetMap (sekitar UNNES Sekaran)
//  Jalankan: npm run seed   (atau: node db/seed.js --force)
// ============================================================
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, DB_PATH } = require('./index');

const FORCE = process.argv.includes('--force');

// ---------- Load data riset ----------
const dataDir = path.join(__dirname, '..', 'data');
const laundries = ['seed_laundry_a.json', 'seed_laundry_b.json', 'seed_laundry_c.json']
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')).laundries);

// ---------- Helper ----------
const slugify = s => s.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

const rupiah = n => 'Rp' + Number(n).toLocaleString('id-ID');

// Deskripsi realistis per tipe usaha (dari analisis SWOT kelompok)
function describe(l) {
  if (l.type === 'self_service')
    return `Laundry self-service koin di ${l.address.split(',')[0]}. Cuci sendiri dengan mesin modern — higienis (1 mesin 1 pelanggan), proses cepat 1-2 jam. Cocok buat mahasiswa yang mau hemat.`;
  if (l.type === 'premium')
    return `Spesialis perawatan pakaian khusus: sepatu, tas, kemeja formal, jas, dan gaun. Pilihan aman buat pekerja kantoran dan mahasiswa yang punya acara penting.`;
  return `Laundry kiloan kepercayaan mahasiswa UNNES di ${l.address.split(',')[0]}. Harga transparan, pengerjaan rapi, dan komunikasi mudah lewat WhatsApp.`;
}

// Katalog layanan + harga (berbasis harga pasar sekitar UNNES)
function servicesFor(l, id) {
  const rows = [];
  if (l.services.includes('kiloan')) {
    rows.push([id, 'Cuci Kiloan Reguler', 'kg', l.price_min, 48, 'Cuci + kering + lipat. Standar 2 hari selesai.']);
    rows.push([id, 'Cuci Kiloan Express', 'kg', Math.round(l.price_max * 1.25 / 500) * 500, 6, 'Selesai hari yang sama (±6 jam).']);
  }
  if (l.services.includes('satuan')) {
    rows.push([id, 'Cuci Satuan (kemeja/kaos)', 'pcs', 8000, 24, 'Per potong, termasuk setrika.']);
  }
  if (l.services.includes('self-service') || l.services.includes('koin')) {
    rows.push([id, 'Mesin Koin 8kg', 'sesi', 6000, 1, 'Mesin cuci + pengering, sekali pakai 1 jam.']);
    rows.push([id, 'Mesin Koin 10kg', 'sesi', 8000, 1, 'Kapasitas besar buat bed cover / selimut.']);
  }
  if (l.services.includes('setrika')) {
    rows.push([id, 'Setrika Saja', 'kg', 4000, 24, 'Cucian sudah bersih, tinggal setrika.']);
  }
  if (l.services.includes('antar-jemput')) {
    rows.push([id, 'Antar-Jemput', 'order', 3000, 0, 'Penjemputan & pengantaran area Sekaran — Gunungpati.']);
  }
  if (l.services.includes('dry-clean')) {
    rows.push([id, 'Dry Cleaning Jas/Gaun', 'pcs', 35000, 72, 'Perawatan khusus pakaian formal.']);
  }
  if (l.services.includes('cuci-sepatu')) {
    rows.push([id, 'Cuci Sepatu', 'pasang', 25000, 48, 'Deep clean fast cleaning / leather.']);
  }
  return rows;
}

// Review mock realistis (bahasa mahasiswa, dari hasil wawancara PPT)
const REVIEW_POOL = [
  ['Dara', 5, 'Harga sesuai, cucian rapi, gak pernah telat. Langganan tiap minggu.'],
  ['Bagas', 5, 'Deket dari kos, whatsapp fast respon. Recommended buat anak rantau.'],
  ['Nadia', 4, 'Hasil cuciannya bersih banget. Cuma pas weekend agak antre lama.'],
  ['Yoga', 5, 'Express-nya beneran kilat, jam 10 pagi nyuci jam 4 sore udah bisa diambil.'],
  ['Putri', 4, 'Tempatnya bersih dan mesinnya kelihatan terawat. Harga standar anak kos.'],
  ['Rizky', 5, 'Ulasan di sini beneran sesuai kenyataan — harga di web sama dengan harga di tempat.'],
  ['Salsa', 5, 'Pelayanan ramah, baju kemeja disetrika rapi banget buat sidang.'],
  ['Dimas', 4, 'Self service-nya enak, tinggal masukkan koin terus nunggu 1 jam.'],
];

// Nama pelanggan mock
const CUSTOMERS = ['Dari', 'Bagas', 'Nadia', 'Yoga', 'Putri', 'Rizky', 'Salsa', 'Dimas', 'Ayu', 'Fajar'];

// ---------- MAIN ----------
function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM laundries').get().n;

  if (existing > 0 && !FORCE) {
    console.log(`Database sudah berisi ${existing} laundry. Pakai --force untuk reseed. (DB: ${DB_PATH})`);
    return;
  }

  if (FORCE) {
    db.exec(`
      DELETE FROM reviews; DELETE FROM services; DELETE FROM orders;
      DELETE FROM promotions; DELETE FROM favorites;
      DELETE FROM laundries; DELETE FROM users;
    `);
    console.log('Database di-reset.');
  }

  const t = db.transaction(() => {
    // ===== Users =====
    const demoUsers = [
      ['Farrel Athaillah', 'admin@laundryyuk.id', 'admin', '081234567890'],
      ['Budi Sang Pemilik', 'owner@laundryyuk.id', 'owner', '081298765432'],
      ['Mahasiswa Contoh', 'mahasiswa@unnes.ac.id', 'customer', '085700011122'],
    ];
    const ownerIds = {};
    for (const [name, email, role, phone] of demoUsers) {
      const hash = bcrypt.hashSync('laundry123', 10);
      const info = db.prepare(
        'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?,?,?,?,?)'
      ).run(name, email, hash, role, phone);
      if (role === 'owner') ownerIds.owner = info.lastInsertRowid;
    }

    // ===== Laundries + services + reviews =====
    const insLaundry = db.prepare(`
      INSERT INTO laundries
        (owner_id, name, slug, type, category, description, address, lat, lon,
         rating, review_count, hours, open_24h, phone, price_min, price_max,
         price_unit, services, promoted, status, source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insService = db.prepare(
      'INSERT INTO services (laundry_id, name, unit, price, eta_hours, description) VALUES (?,?,?,?,?,?)');
    const insReview = db.prepare(
      'INSERT INTO reviews (laundry_id, author_name, rating, comment, created_at) VALUES (?,?,?,?,?)');

    let i = 0;
    for (const l of laundries) {
      const promoted = l.promoted ? 1 : 0;
      const status = l.source === 'Google Maps' ? 'active' : 'active';
      const info = insLaundry.run(
        i === 0 ? ownerIds.owner : null, // laundry pertama milik akun owner demo
        l.name, slugify(l.name), l.type, l.category, describe(l),
        l.address, l.lat, l.lon, l.rating, l.review_count,
        l.hours, l.open_24h, l.phone, l.price_min, l.price_max,
        'kg', l.services.join(','), promoted, status, l.source
      );
      const id = info.lastInsertRowid;

      for (const s of servicesFor(l, id)) insService.run(...s);

      const nRev = Math.min(6, 2 + (i % 5));
      for (let r = 0; r < nRev; r++) {
        const [who, star, text] = REVIEW_POOL[(i + r) % REVIEW_POOL.length];
        const daysAgo = (r * 3 + i) % 40 + 1;
        insReview.run(id, who, star, text,
          new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 19).replace('T', ' '));
      }
      i++;
    }

    // ===== Orders mock =====
    const insOrder = db.prepare(`
      INSERT INTO orders (code, laundry_id, customer_name, phone, address, service_name,
                          weight_kg, notes, pickup, total_price, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const all = db.prepare('SELECT id, name FROM laundries').all();
    const statuses = ['baru', 'dijemput', 'dicuci', 'selesai', 'diantar', 'batal'];
    const orderRows = [
      ['LY-2401', 0, 4.5, 'Baju kuliah seminggu', 1, 'baru',   1],
      ['LY-2402', 1, 6.0, 'Selimut + bed cover',  0, 'dicuci', 3],
      ['LY-2403', 3, 3.2, 'Kemeja buat sidang',   0, 'selesai',5],
      ['LY-2404', 2, 5.0, '',                     1, 'diantar',8],
      ['LY-2405', 4, 7.5, 'Jangan dicampur',      1, 'baru',   0],
      ['LY-2406', 5, 2.0, 'Cuci kilat pls',       0, 'dijemput',2],
    ];
    for (const [code, idx, kg, notes, pickup, status, daysAgo] of orderRows) {
      const L = all[idx % all.length];
      const price = 6000 * kg + (pickup ? 3000 : 0);
      const when = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 19).replace('T', ' ');
      insOrder.run(code, L.id, CUSTOMERS[idx % CUSTOMERS.length],
        '08571234' + (1000 + idx), 'Kos melati, Jl. Taman Siswa, Sekaran',
        'Cuci Kiloan Reguler', kg, notes, pickup, Math.round(price), status, when, when);
    }

    // ===== Promotions =====
    const insPromo = db.prepare(
      'INSERT INTO promotions (laundry_id, title, description, discount, active) VALUES (?,?,?,?,1)');
    const promoTargets = db.prepare('SELECT id FROM laundries WHERE promoted = 1').all();
    for (const p of promoTargets) {
      insPromo.run(p.id, 'Promo Mahasiswa Baru',
        'Diskon cuci kiloan untuk mahasiswa baru UNNES — tunjukkan KTM.',
        '20% s/d 30 Sep');
    }
  });

  t();
  const counts = {
    laundries: db.prepare('SELECT COUNT(*) n FROM laundries').get().n,
    services:  db.prepare('SELECT COUNT(*) n FROM services').get().n,
    reviews:   db.prepare('SELECT COUNT(*) n FROM reviews').get().n,
    orders:    db.prepare('SELECT COUNT(*) n FROM orders').get().n,
    users:     db.prepare('SELECT COUNT(*) n FROM users').get().n,
  };
  console.log('Seed selesai:', JSON.stringify(counts));
  console.log('DB:', DB_PATH);
}

try { seed(); } catch (e) { console.error('Seed gagal:', e.message); process.exit(1); }
