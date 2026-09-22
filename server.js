// ============================================================
//  Laundry Yuk! — Server (Express + SQLite embedded)
//  Jalankan: npm start  →  http://localhost:3000
// ============================================================
require('dotenv').config();
const path         = require('path');
const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const { db }       = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'laundryyuk-dev-secret';
const CENTER = {
  lat: parseFloat(process.env.MAP_CENTER_LAT || -7.0502),
  lon: parseFloat(process.env.MAP_CENTER_LON || 110.3990),
};

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const haversine = (a, b) => { // km
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180,
        dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const auth = (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Belum login' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Sesi tidak valid' }); }
};

const orderCode = () => 'LY-' + Date.now().toString(36).toUpperCase().slice(-6);

// ================= AUTH =================
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'customer', phone } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: 'Email sudah terdaftar' });
  const r = db.prepare(
    'INSERT INTO users (name,email,password_hash,role,phone) VALUES (?,?,?,?,?)'
  ).run(name, email, bcrypt.hashSync(password, 10),
        ['customer','owner'].includes(role) ? role : 'customer', phone || null);
  const token = jwt.sign({ id: r.lastInsertRowid, name, email, role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' }).json({ user: { id: r.lastInsertRowid, name, email, role } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email || '');
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'Email atau password salah' });
  const token = jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' })
     .json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.post('/api/auth/logout', (_req, res) => res.clearCookie('token').json({ ok: true }));

app.get('/api/auth/me', (req, res) => {
  try {
    const u = jwt.verify(req.cookies.token || '', JWT_SECRET);
    res.json({ user: u });
  } catch { res.json({ user: null }); }
});

// ================= LAUNDRIES =================
app.get('/api/laundries', (req, res) => {
  const { q, type, service, max_price, open_now, sort = 'recommended', lat, lon } = req.query;
  let rows = db.prepare(`
    SELECT id, name, slug, type, category, description, address, lat, lon,
           rating, review_count, hours, open_24h, phone, price_min, price_max,
           price_unit, services, promoted, status
    FROM laundries WHERE status='active'`).all();

  if (q) {
    const s = q.toLowerCase();
    rows = rows.filter(l =>
      l.name.toLowerCase().includes(s) ||
      l.address.toLowerCase().includes(s) ||
      (l.services || '').toLowerCase().includes(s));
  }
  if (type) rows = rows.filter(l => l.type === type);
  if (service) rows = rows.filter(l => (l.services || '').includes(service));
  if (max_price) rows = rows.filter(l => l.price_min <= Number(max_price));
  if (open_now === '1') rows = rows.filter(l => l.open_24h === 1);

  const origin = { lat: parseFloat(lat) || CENTER.lat, lon: parseFloat(lon) || CENTER.lon };
  rows = rows.map(l => ({ ...l, distance_km: +haversine(origin, { lat: l.lat, lon: l.lon }).toFixed(2) }));

  const sorters = {
    price:     (a, b) => a.price_min - b.price_min,
    rating:    (a, b) => b.rating - a.rating,
    distance:  (a, b) => a.distance_km - b.distance_km,
    recommended: (a, b) => (b.promoted - a.promoted) || (b.rating - a.rating),
  };
  rows.sort(sorters[sort] || sorters.recommended);
  res.json({ center: CENTER, count: rows.length, laundries: rows });
});

app.get('/api/laundries/:slug', (req, res) => {
  const l = db.prepare("SELECT * FROM laundries WHERE slug=? AND status='active'").get(req.params.slug);
  if (!l) return res.status(404).json({ error: 'Laundry tidak ditemukan' });
  const services = db.prepare('SELECT * FROM services WHERE laundry_id=? ORDER BY price').all(l.id);
  const reviews  = db.prepare('SELECT author_name, rating, comment, created_at FROM reviews WHERE laundry_id=? ORDER BY id DESC LIMIT 20').all(l.id);
  const promos   = db.prepare('SELECT title, description, discount FROM promotions WHERE laundry_id=? AND active=1').all(l.id);
  res.json({ laundry: { ...l, distance_km: +haversine(CENTER, { lat: l.lat, lon: l.lon }).toFixed(2) }, services, reviews, promos });
});

// ================= REVIEWS =================
app.post('/api/laundries/:id/reviews', auth, (req, res) => {
  const { rating, comment } = req.body || {};
  const r = Math.round(Number(rating));
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Rating 1-5' });
  const l = db.prepare('SELECT id FROM laundries WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Laundry tidak ada' });
  db.prepare('INSERT INTO reviews (laundry_id,user_id,author_name,rating,comment) VALUES (?,?,?,?,?)')
    .run(l.id, req.user.id, req.user.name, r, (comment || '').slice(0, 500));
  const agg = db.prepare('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE laundry_id=?').get(l.id);
  db.prepare('UPDATE laundries SET rating=?, review_count=? WHERE id=?')
    .run(+agg.a.toFixed(2), agg.n, l.id);
  res.json({ ok: true, rating: +agg.a.toFixed(2), review_count: agg.n });
});

// ================= ORDERS =================
app.post('/api/orders', (req, res) => {
  const { laundry_id, customer_name, phone, address, service_name, weight_kg = 0, notes = '', pickup = 0 } = req.body || {};
  if (!laundry_id || !customer_name || !phone || !address || !service_name)
    return res.status(400).json({ error: 'Data pesanan belum lengkap' });
  const svc = db.prepare('SELECT * FROM services WHERE laundry_id=? AND name=?').get(laundry_id, service_name);
  if (!svc) return res.status(404).json({ error: 'Layanan tidak tersedia di laundry ini' });
  const total = Math.round(svc.price * Math.max(weight_kg, svc.unit === 'kg' ? 1 : 1)) + (pickup ? 3000 : 0);
  const code = orderCode();
  db.prepare(`INSERT INTO orders
      (code,laundry_id,customer_name,phone,address,service_name,weight_kg,notes,pickup,total_price,status)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'baru')`)
    .run(code, laundry_id, customer_name, phone, address, service_name, weight_kg, notes, pickup ? 1 : 0, total);
  res.status(201).json({ ok: true, code, total_price: total, status: 'baru' });
});

app.get('/api/orders/track/:code', (req, res) => {
  const o = db.prepare(`
    SELECT o.code, o.status, o.service_name, o.total_price, o.created_at, l.name AS laundry_name, l.phone
    FROM orders o JOIN laundries l ON l.id=o.laundry_id WHERE o.code=?`).get(req.params.code.toUpperCase());
  if (!o) return res.status(404).json({ error: 'Kode pesanan tidak ditemukan' });
  res.json({ order: o });
});

// ================= OWNER DASHBOARD =================
app.get('/api/owner/summary', auth, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role))
    return res.status(403).json({ error: 'Khusus pemilik laundry' });
  const mine = req.user.role === 'admin'
    ? db.prepare('SELECT * FROM laundries ORDER BY promoted DESC, rating DESC').all()
    : db.prepare('SELECT * FROM laundries WHERE owner_id=?').all(req.user.id);
  const ids = mine.map(l => l.id);
  const orders = ids.length
    ? db.prepare(`SELECT o.*, l.name AS laundry_name FROM orders o JOIN laundries l ON l.id=o.laundry_id
                  WHERE o.laundry_id IN (${ids.map(() => '?').join(',')}) ORDER BY o.id DESC LIMIT 50`)
        .all(...ids)
    : [];
  const stat = orders.length
    ? db.prepare(`SELECT status, COUNT(*) n, SUM(total_price) rev FROM orders
                  WHERE laundry_id IN (${ids.map(() => '?').join(',')}) GROUP BY status`).all(...ids)
    : [];
  res.json({ laundries: mine, orders, stats: stat, revenue: stat.reduce((s, x) => s + (x.rev || 0), 0) });
});

// Update status pesanan (owner)
app.patch('/api/orders/:code/status', auth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['baru', 'dijemput', 'dicuci', 'selesai', 'diantar', 'batal'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE code=?").run(status, req.params.code);
  res.json({ ok: true });
});

// Daftar laundry baru (owner onboarding)
app.post('/api/laundries', auth, (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Khusus pemilik laundry' });
  const { name, type = 'kiloan', address, lat, lon, phone, price_min = 5000, price_max = 10000, services = [] } = req.body || {};
  if (!name || !address || lat == null || lon == null)
    return res.status(400).json({ error: 'Nama, alamat, dan koordinat wajib diisi' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  const r = db.prepare(`INSERT INTO laundries
      (owner_id,name,slug,type,address,lat,lon,phone,price_min,price_max,services,status,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'owner-input')`)
    .run(req.user.id, name, slug, type, address, lat, lon, phone || null, price_min, price_max, services.join(','), 'active');
  res.status(201).json({ ok: true, id: r.lastInsertRowid, slug });
});

// ================= META + SPA =================
app.get('/api/meta', (_req, res) => {
  const m = {
    laundries: db.prepare("SELECT COUNT(*) n FROM laundries WHERE status='active'").get().n,
    reviews:   db.prepare('SELECT COUNT(*) n FROM reviews').get().n,
    orders:    db.prepare('SELECT COUNT(*) n FROM orders').get().n,
    avgRating: db.prepare('SELECT ROUND(AVG(rating),2) v FROM laundries').get().v,
    center: CENTER,
  };
  res.json(m);
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🧺 Laundry Yuk! berjalan di http://localhost:${PORT}`);
});
