// ============================================================
//  verify.js — E2E test + jalankan server detached (anti-reap)
//  Jalankan: node verify.js
// ============================================================
const { spawn } = require('child_process');
const path = require('path');

const BASE = 'http://127.0.0.1:3000';
const results = [];
const ok   = (n, c, extra = '') => results.push([c ? 'PASS' : 'FAIL', n, extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function j(url, opts) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookies: res.headers.getSetCookie ? res.headers.getSetCookie() : [] };
}

// ---- Start server detached (survives parent exit on Windows) ----
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true,
});
child.unref();
console.log('server spawned pid', child.pid);

(async function main() {
// ---- Wait until listening ----
let up = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(BASE + '/api/meta'); if (r.ok) { up = true; break; } } catch {}
  await sleep(300);
}
ok('server listening on :3000', up);
if (!up) { printResults(); process.exit(1); }

// ---- TESTS ----
const meta = await j('/api/meta');
ok('GET /api/meta', meta.status === 200 && meta.data.laundries >= 9, JSON.stringify(meta.data));

const list = await j('/api/laundries?sort=price');
ok('GET /api/laundries (sort=price)', list.status === 200 && list.data.count >= 9,
   `${list.data.count} hasil, termurah: ${list.data.laundries[0].name} @Rp${list.data.laundries[0].price_min}`);
const sorted = list.data.laundries.every((l, i, a) => i === 0 || a[i-1].price_min <= l.price_min);
ok('urut harga ascending', sorted);

const near = await j('/api/laundries?sort=distance');
ok('urut jarak ascending', near.data.laundries.every((l,i,a)=>i===0||a[i-1].distance_km<=l.distance_km),
   `terdekat: ${near.data.laundries[0].name} ${near.data.laundries[0].distance_km}km`);

const f1 = await j('/api/laundries?type=self_service');
ok('filter type=self_service', f1.data.laundries.every(l => l.type === 'self_service'), `${f1.data.count} hasil`);

const f2 = await j('/api/laundries?service=cuci-sepatu');
ok('filter layanan cuci-sepatu', f2.data.count >= 1, `${f2.data.count} hasil`);

const f3 = await j('/api/laundries?max_price=5000');
ok('filter max_price<=5000', f3.data.laundries.every(l => l.price_min <= 5000), `${f3.data.count} hasil`);

const q = await j('/api/laundries?q=smart');
ok('search q=smart', q.data.count >= 1 && q.data.laundries[0].name.toLowerCase().includes('smart'));

const det = await j('/api/laundries/smart-laundry-unnes');
ok('GET detail laundry', det.status === 200 && det.data.services.length > 0 && det.data.reviews.length > 0,
   `${det.data.services.length} layanan, ${det.data.reviews.length} ulasan`);

const notFound = await j('/api/laundries/nggak-ada');
ok('detail 404 untuk slug invalid', notFound.status === 404);

// ---- AUTH ----
const email = `t${Date.now()}@unnes.ac.id`;
const reg = await j('/api/auth/register', { method: 'POST', body: { name: 'Tester', email, password: 'rahasia123' } });
ok('POST register', reg.status === 200 && reg.data.user.role === 'customer');
const cookie = (reg.cookies.find(c => c.startsWith('token=')) || '').split(';')[0];

const dup = await j('/api/auth/register', { method: 'POST', body: { name: 'Tester', email, password: 'x' } });
ok('register email duplikat -> 409', dup.status === 409);

const badLogin = await j('/api/auth/login', { method: 'POST', body: { email, password: 'salah' } });
ok('login password salah -> 401', badLogin.status === 401);

const login = await j('/api/auth/login', { method: 'POST', body: { email, password: 'rahasia123' } });
ok('POST login', login.status === 200 && login.data.user.email === email);

const ownerLogin = await j('/api/auth/login', { method: 'POST', body: { email: 'owner@laundryyuk.id', password: 'laundry123' } });
const ownerCookie = (ownerLogin.cookies.find(c => c.startsWith('token=')) || '').split(';')[0];
ok('login owner demo', ownerLogin.status === 200 && ownerLogin.data.user.role === 'owner');

// ---- ORDER ----
const ord = await j('/api/orders', { method: 'POST', body: {
  laundry_id: 1, customer_name: 'Tester E2E', phone: '081200000000',
  address: 'Kos Test, Sekaran', service_name: 'Cuci Kiloan Express', weight_kg: 3, pickup: 1 } });
ok('POST order', ord.status === 201 && ord.data.code && ord.data.total_price > 0,
   `kode ${ord.data.code}, total Rp${ord.data.total_price}`);

const track = await j('/api/orders/track/' + ord.data.code);
ok('GET track order', track.status === 200 && track.data.order.code === ord.data.code,
   `status: ${track.data.order.status}`);

const trackBad = await j('/api/orders/track/LY-ZZZZZZ');
ok('track kode invalid -> 404', trackBad.status === 404);

const upd = await j('/api/orders/' + ord.data.code + '/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: ownerCookie }, body: { status: 'dicuci' } });
const track2 = await j('/api/orders/track/' + ord.data.code);
ok('PATCH status order', upd.status === 200 && track2.data.order.status === 'dicuci');

const updBad = await j('/api/orders/' + ord.data.code + '/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: ownerCookie }, body: { status: 'ngawur' } });
ok('PATCH status invalid -> 400', updBad.status === 400);

// ---- REVIEW ----
const rev = await j('/api/laundries/1/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: { rating: 5, comment: 'Mantap E2E' } });
ok('POST review (auth)', rev.status === 200 && rev.data.rating > 0, `rating baru ${rev.data.rating}`);
const revNoAuth = await j('/api/laundries/1/reviews', { method: 'POST', body: { rating: 5, comment: 'x' } });
ok('review tanpa login -> 401', revNoAuth.status === 401);

// ---- OWNER ----
const sum = await j('/api/owner/summary', { headers: { Cookie: ownerCookie } });
ok('GET owner summary', sum.status === 200 && Array.isArray(sum.data.orders), `${sum.data.orders.length} order, revenue Rp${sum.data.revenue}`);
const sumNoAuth = await j('/api/owner/summary');
ok('owner summary tanpa login -> 401', sumNoAuth.status === 401);

const newL = await j('/api/laundries', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
  body: { name: 'Laundry Test Mitra', type: 'kiloan', address: 'Jl. Test No.1 Sekaran', lat: -7.05, lon: 110.40, services: ['kiloan'] } });
ok('POST laundry baru (owner)', newL.status === 201 && newL.data.slug, `slug: ${newL.data.slug}`);
const newLNoAuth = await j('/api/laundries', { method: 'POST', body: { name: 'X', address: 'y', lat: 1, lon: 1 } });
ok('POST laundry tanpa login -> 401', newLNoAuth.status === 401);

// ---- STATIC ----
for (const p of ['/', '/css/style.css', '/js/app.js', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css']) {
  const r = await fetch(BASE + p);
  ok('static ' + p, r.ok, 'HTTP ' + r.status);
}

printResults();

function printResults() {
  const pass = results.filter(r => r[0] === 'PASS').length;
  console.log('\n================ HASIL E2E ================');
  for (const [s, n, e] of results) console.log(`${s === 'PASS' ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`);
  console.log('-------------------------------------------');
  console.log(`${pass}/${results.length} PASS`);
  console.log('Server tetap jalan (detached) di http://localhost:3000');
}
})().catch(e => { console.error('E2E error:', e.message); process.exit(1); });
