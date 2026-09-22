/* ============================================================
   Laundry Yuk! — Frontend SPA (vanilla JS, hash router)
   ============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

const TYPE_LABEL = { kiloan: 'Kiloan', self_service: 'Self Service', premium: 'Premium' };
const STATUS_LABEL = { baru: 'Baru', dijemput: 'Dijemput', dicuci: 'Dicuci', selesai: 'Selesai', diantar: 'Diantar', batal: 'Batal' };
const STATUS_FLOW = ['baru', 'dijemput', 'dicuci', 'selesai', 'diantar'];
const SERVICE_LABEL = { kiloan: 'Kiloan', satuan: 'Satuan', 'self-service': 'Self Service', koin: 'Koin', setrika: 'Setrika', 'antar-jemput': 'Antar-Jemput', 'dry-clean': 'Dry Clean', 'cuci-sepatu': 'Cuci Sepatu', express: 'Express' };

const haversine = (a, b) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

let STATE = { user: null, meta: null, laundries: [], center: { lat: -7.0502, lon: 110.3990 } };

/* ---------------- API ---------------- */
async function api(url, opts = {}) {
  // Static GitHub Pages adapter: all prototype data lives in data.js/localStorage.
  const data = window.STATIC_DATA;
  const [rawPath, query = ''] = url.split('?');
  const q = new URLSearchParams(query);
  const body = opts.body || {};
  const makeServices = l => (l.services || '').split(',').filter(Boolean).map((s, i) => ({
    name: SERVICE_LABEL[s] || s, unit: s === 'kiloan' || s === 'setrika' ? 'kg' : 'sesi',
    price: s === 'express' ? l.price_max : s === 'koin' ? 6000 : s === 'cuci-sepatu' ? 25000 : s === 'dry-clean' ? 35000 : l.price_min,
    eta_hours: s === 'express' ? 6 : s === 'koin' ? 1 : 48,
    description: `Layanan ${SERVICE_LABEL[s] || s} untuk area sekitar UNNES.`
  }));
  const enrich = l => ({ ...l, category: l.category || 'laundry', description: l.description || `Laundry ${l.type === 'premium' ? 'spesialis perawatan pakaian' : 'pilihan mahasiswa'} di ${l.address.split(',')[0]}.`, distance_km: +haversine(STATE.center, l).toFixed(2) });
  if (rawPath === '/meta') {
    return { laundries: data.laundries.length, reviews: data.laundries.reduce((n, l) => n + (l.review_count || 0), 0), orders: JSON.parse(localStorage.getItem('ly-orders') || '[]').length, avgRating: +(data.laundries.reduce((n, l) => n + l.rating, 0) / data.laundries.length).toFixed(2), center: data.center };
  }
  if (rawPath === '/laundries' && opts.method !== 'POST') {
    let rows = data.laundries.map(enrich);
    const term = (q.get('q') || '').toLowerCase();
    if (term) rows = rows.filter(l => `${l.name} ${l.address} ${l.services}`.toLowerCase().includes(term));
    if (q.get('type')) rows = rows.filter(l => l.type === q.get('type'));
    if (q.get('service')) rows = rows.filter(l => l.services.includes(q.get('service')));
    if (q.get('max_price')) rows = rows.filter(l => l.price_min <= Number(q.get('max_price')));
    const sort = q.get('sort') || 'recommended';
    rows.sort(sort === 'price' ? (a,b) => a.price_min-b.price_min : sort === 'distance' ? (a,b) => a.distance_km-b.distance_km : sort === 'rating' ? (a,b) => b.rating-a.rating : (a,b) => (b.promoted||0)-(a.promoted||0) || b.rating-a.rating);
    return { center: data.center, count: rows.length, laundries: rows };
  }
  if (rawPath.startsWith('/laundries/') && opts.method !== 'POST') {
    const slug = rawPath.split('/')[2]; const l = data.laundries.find(x => x.slug === slug);
    if (!l) throw new Error('Laundry tidak ditemukan');
    return { laundry: enrich(l), services: makeServices(l), reviews: [], promos: l.promoted ? [{ title: 'Promo Mahasiswa', description: 'Tunjukkan KTM UNNES untuk promo prototype.', discount: 'Diskon hingga 20%' }] : [] };
  }
  if (rawPath === '/auth/me') return { user: JSON.parse(localStorage.getItem('ly-user') || 'null') };
  if (rawPath === '/auth/logout') { localStorage.removeItem('ly-user'); return { ok: true }; }
  if (rawPath === '/auth/login' || rawPath === '/auth/register') {
    const user = { id: 1, name: body.name || (body.role === 'owner' ? 'Pemilik Laundry' : 'Mahasiswa UNNES'), email: body.email, role: body.role || 'customer' };
    localStorage.setItem('ly-user', JSON.stringify(user)); return { user };
  }
  if (rawPath === '/orders' && opts.method === 'POST') {
    const code = 'LY-' + Date.now().toString(36).toUpperCase().slice(-6); const order = { code, ...body, status: 'baru', created_at: new Date().toISOString(), total_price: 0 };
    const orders = JSON.parse(localStorage.getItem('ly-orders') || '[]'); orders.unshift(order); localStorage.setItem('ly-orders', JSON.stringify(orders)); return { ok: true, code, total_price: 0, status: 'baru' };
  }
  if (rawPath.startsWith('/orders/track/')) { const code = decodeURIComponent(rawPath.split('/').pop()).toUpperCase(); const order = JSON.parse(localStorage.getItem('ly-orders') || '[]').find(x => x.code === code); if (!order) throw new Error('Kode pesanan demo tidak ditemukan'); return { order }; }
  if (rawPath === '/owner/summary') return { laundries: data.laundries.slice(0, 1).map(enrich), orders: JSON.parse(localStorage.getItem('ly-orders') || '[]'), stats: [], revenue: 0 };
  if (rawPath.startsWith('/orders/') && opts.method === 'PATCH') return { ok: true };
  if (rawPath.startsWith('/laundries/') && opts.method === 'POST') return { ok: true };
  throw new Error('Fitur ini tersedia dalam mode demo statis.');
}

/* ---------------- TOAST ---------------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---------------- SHARED PARTIALS ---------------- */
function stars(r) { return '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)); }

function laundryCard(l) {
  const svc = (l.services || '').split(',').filter(Boolean);
  return `
  <article class="lcard" style="position:relative">
    ${l.promoted ? '<span class="ribbon">★ Promoted</span>' : ''}
    <div class="lcard-top">
      <h3>${esc(l.name)}</h3>
      <span class="lcard-type t-${l.type}">${TYPE_LABEL[l.type] || l.type}</span>
    </div>
    <div class="lcard-meta">
      <div class="stars">${stars(l.rating)} <span class="muted" style="font-weight:600">${l.rating} · ${l.review_count} ulasan</span></div>
      <div>📍 ${esc(l.address)}</div>
      <div>🕒 ${esc(l.hours || '-')} &nbsp;·&nbsp; 🚶 ${l.distance_km} km dari UNNES</div>
    </div>
    <div class="chips">${svc.slice(0, 4).map(s => `<span class="chip">${SERVICE_LABEL[s] || s}</span>`).join('')}</div>
    <div class="lcard-foot">
      <div class="price">${rp(l.price_min)}–${rp(l.price_max)}<small>per ${l.price_unit}</small></div>
      <a class="btn btn-primary btn-sm" href="#/laundry/${l.slug}">Lihat →</a>
    </div>
  </article>`;
}

/* ---------------- VIEW: HOME ---------------- */
async function viewHome() {
  const [meta, data] = await Promise.all([api('/meta'), api('/laundries?sort=recommended')]);
  STATE.meta = meta; STATE.laundries = data.laundries; STATE.center = data.center;

  const top = data.laundries.slice(0, 6);
  $('#app').innerHTML = `
  <section class="hero">
    <div>
      <span class="hero-badge">🧺 Platform Agregator Laundry Kampus</span>
      <h1>Nyari laundry <span class="hl">sekitar UNNES</span>? Gak perlu keliling lagi.</h1>
      <p class="lead">Bandingkan <b>harga</b>, <b>jarak presisi</b>, jenis layanan, dan <b>ulasan</b> dari sesama
      mahasiswa — semua dalam satu tempat. Mitra UMKM laundry juga bisa gabung dan jangkau lebih banyak pelanggan.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#/peta">📍 Cari Laundry Terdekat</a>
        <a class="btn btn-ghost" href="#/daftar-mitra">Gabung Jadi Mitra</a>
      </div>
    </div>
    <div class="hero-art">
      <div class="blob blob-teal"></div>
      <div class="blob blob-sun"></div>
      <div class="blob blob-coral"></div>
      <span class="hero-emoji he-1">👕</span>
      <span class="hero-emoji he-2">🧼</span>
      <span class="hero-emoji he-3">🫧</span>
    </div>
  </section>

  <div class="stats">
    <div class="stat s1"><b>${meta.laundries}</b><span>Laundry terdaftar</span></div>
    <div class="stat s2"><b>${meta.reviews}</b><span>Ulasan mahasiswa</span></div>
    <div class="stat s3"><b>${meta.avgRating || '-'}</b><span>Rata-rata rating</span></div>
    <div class="stat s4"><b>&lt; 3 km</b><span>Radius dari UNNES</span></div>
  </div>

  <section class="section">
    <div class="sec-head">
      <div><h2>Rekomendasi Terdekat</h2>
      <p>Pilihan terbaik berdasarkan rating &amp; lokasi di kawasan Sekaran — Gunungpati.</p></div>
      <a class="btn btn-ghost btn-sm" href="#/peta">Lihat semua di peta →</a>
    </div>
    <div class="grid">${top.map(laundryCard).join('')}</div>
  </section>

  <section class="section">
    <div class="sec-head"><div><h2>Kenapa Laundry Yuk!?</h2>
    <p>Solusi dari masalah nyata mahasiswa &amp; UMKM laundry sekitar kampus.</p></div></div>
    <div class="about-grid">
      <div class="about-card"><span class="ico">🔎</span><h3>Transparan &amp; Terpusat</h3>
        <p>Harga, jam buka, jenis layanan, dan jarak presisi terkumpul dalam satu platform — gak perlu tanya satu-satu atau datang langsung.</p></div>
      <div class="about-card"><span class="ico">⚖️</span><h3>Filter Sesuai Kebutuhan</h3>
        <p>Urutkan berdasarkan harga termurah, jarak terdekat, atau rating tertinggi. Filter layanan khusus seperti cuci sepatu dan dry cleaning.</p></div>
      <div class="about-card"><span class="ico">🤝</span><h3>Dukung UMKM Lokal</h3>
        <p>Pemilik laundry kecil tanpa modal spanduk mahal tetap bisa dikenal mahasiswa baru di sekitarnya lewat listing digital gratis.</p></div>
      <div class="about-card"><span class="ico">📦</span><h3>Pesan &amp; Lacak</h3>
        <p>Buat pesanan langsung dari platform dan pantau statusnya: baru, dijemput, dicuci, selesai, hingga diantar.</p></div>
    </div>
  </section>`;
}

/* ---------------- VIEW: PETA ---------------- */
let mapInst = null, markerLayer = null;

async function viewPeta() {
  $('#app').innerHTML = `
  <div class="page-title"><h1>Peta Laundry</h1>
    <p>Semua laundry terdaftar di sekitar UNNES Sekaran. Klik penanda untuk detail.</p></div>
  <section class="section">
    <div class="filterbar">
      <div class="field"><label>Cari</label>
        <input id="f-q" placeholder="Nama / layanan..."></div>
      <div class="field"><label>Jenis</label>
        <select id="f-type"><option value="">Semua</option>
          <option value="kiloan">Kiloan</option>
          <option value="self_service">Self Service</option>
          <option value="premium">Premium</option></select></div>
      <div class="field"><label>Layanan</label>
        <select id="f-svc"><option value="">Semua</option>
          <option value="kiloan">Kiloan</option><option value="satuan">Satuan</option>
          <option value="self-service">Self Service</option><option value="koin">Koin</option>
          <option value="setrika">Setrika</option><option value="antar-jemput">Antar-Jemput</option>
          <option value="dry-clean">Dry Clean</option><option value="cuci-sepatu">Cuci Sepatu</option></select></div>
      <div class="field"><label>Maks. harga / kg</label>
        <input id="f-price" type="number" placeholder="cth. 8000" min="0" step="500"></div>
      <div class="field"><label>Urutkan</label>
        <select id="f-sort"><option value="recommended">Rekomendasi</option>
          <option value="distance">Jarak terdekat</option><option value="price">Harga termurah</option>
          <option value="rating">Rating tertinggi</option></select></div>
      <button class="btn btn-ghost btn-sm" id="f-reset">Reset</button>
    </div>
    <div class="map-wrap">
      <div id="map"></div>
      <div class="map-side" id="map-side"></div>
    </div>
  </section>`;

  if (!mapInst) {
    mapInst = L.map('map').setView([STATE.center.lat, STATE.center.lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(mapInst);
  }
  ['f-q', 'f-type', 'f-svc', 'f-price', 'f-sort'].forEach(id => {
    $('#' + id).addEventListener('input', loadMap);
  });
  $('#f-reset').onclick = () => {
    ['f-q', 'f-price'].forEach(id => $('#' + id).value = '');
    ['f-type', 'f-svc'].forEach(id => $('#' + id).value = '');
    $('#f-sort').value = 'recommended';
    loadMap();
  };
  loadMap();
}

async function loadMap() {
  const p = new URLSearchParams({
    q: $('#f-q').value.trim(), type: $('#f-type').value, service: $('#f-svc').value,
    max_price: $('#f-price').value, sort: $('#f-sort').value,
  });
  const data = await api('/laundries?' + p.toString());
  const rows = data.laundries;

  $('#map-side').innerHTML = rows.length
    ? rows.map(l => `
      <div class="lcard" style="box-shadow:4px 4px 0 var(--ink)">
        <div class="lcard-top" style="padding-bottom:.4rem"><h3 style="font-size:.98rem">${esc(l.name)}</h3>
          <span class="lcard-type t-${l.type}">${TYPE_LABEL[l.type]}</span></div>
        <div class="lcard-meta" style="padding-bottom:.7rem">
          <div class="stars" style="font-size:.85rem">${stars(l.rating)} <span class="muted">${l.rating}</span></div>
          <div>📍 ${l.distance_km} km · ${esc((l.hours || '').slice(0, 20))}</div>
          <div><b>${rp(l.price_min)}</b> / ${l.price_unit}</div>
        </div>
        <div style="padding:0 1.25rem 1rem"><a class="btn btn-primary btn-sm btn-full" href="#/laundry/${l.slug}">Lihat detail</a></div>
      </div>`).join('')
    : `<div class="empty"><span class="big">🔍</span>Nggak ada laundry yang cocok dengan filter.</div>`;

  if (markerLayer) mapInst.removeLayer(markerLayer);
  markerLayer = L.layerGroup().addTo(mapInst);

  const icon = (color) => L.divIcon({
    className: '', iconSize: [30, 30], iconAnchor: [15, 30],
    html: `<div style="width:26px;height:26px;background:${color};border:3px solid #1C2431;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:2px 2px 0 rgba(0,0,0,.25)"></div>`,
  });
  const colorOf = t => ({ kiloan: '#00A88E', self_service: '#4D96FF', premium: '#FFC531' }[t] || '#FF6B4A');

  rows.forEach(l => {
    L.marker([l.lat, l.lon], { icon: icon(colorOf(l.type)) })
      .addTo(markerLayer)
      .bindPopup(`<b>${esc(l.name)}</b><br>${stars(l.rating)} ${l.rating}<br>
        ${rp(l.price_min)}–${rp(l.price_max)}/${l.price_unit}<br>
        <a href="#/laundry/${l.slug}" style="color:#007D6C;font-weight:700">Lihat detail →</a>`);
  });
  // Penanda kampus UNNES
  L.marker([-7.0502, 110.3990], { icon: icon('#FF6B4A') })
    .addTo(markerLayer).bindPopup('<b>📍 Kampus UNNES Sekaran</b>');
}

/* ---------------- VIEW: DETAIL LAUNDRY ---------------- */
async function viewDetail(slug) {
  const d = await api('/laundries/' + slug);
  const l = d.laundry;
  const svc = (l.services || '').split(',').filter(Boolean);

  $('#app').innerHTML = `
  <div class="page-title"><p><a href="#/peta" style="color:var(--teal-dark);font-weight:700">← Kembali ke peta</a></p>
    <h1>${esc(l.name)}</h1>
    <p>${TYPE_LABEL[l.type]} · ${l.distance_km} km dari UNNES · <span class="stars">${stars(l.rating)}</span> ${l.rating} (${l.review_count} ulasan)</p></div>
  <section class="section">
    <div class="detail-grid">
      <div>
        <div class="panel">
          <h3>Tentang Laundry</h3>
          <p class="muted" style="margin-bottom:1rem">${esc(l.description)}</p>
          <div class="lcard-meta" style="padding:0">
            <div>📍 <b>${esc(l.address)}</b></div>
            <div>🕒 ${esc(l.hours || '-')} ${l.open_24h ? '· <b style="color:var(--teal-dark)">Buka 24 jam</b>' : ''}</div>
            <div>📞 ${l.phone ? esc(l.phone) : '<span class="muted">Belum tersedia</span>'}</div>
            <div>💵 <b>${rp(l.price_min)} – ${rp(l.price_max)}</b> per ${l.price_unit}</div>
            <div>🗂️ Sumber data: ${esc(l.source)}</div>
          </div>
          <div class="chips" style="padding:.8rem 0 0">${svc.map(s => `<span class="chip">${SERVICE_LABEL[s] || s}</span>`).join('')}</div>
        </div>

        <div class="panel">
          <h3>Daftar Layanan &amp; Harga</h3>
          ${d.services.length ? d.services.map(s => `
            <div class="svc-row">
              <div><b>${esc(s.name)}</b><br><span class="muted" style="font-size:.85rem">${esc(s.description || '')} · estimasi ${s.eta_hours} jam</span></div>
              <b>${rp(s.price)}/${s.unit}</b>
            </div>`).join('') : '<p class="muted">Belum ada layanan.</p>'}
        </div>

        <div class="panel">
          <h3>Ulasan Mahasiswa</h3>
          <div id="review-list">${d.reviews.length ? d.reviews.map(r => `
            <div class="review"><span class="who">${esc(r.author_name)}</span>
              <span class="stars">${stars(r.rating)}</span>
              <span class="when">${(r.created_at || '').slice(0, 10)}</span>
              <p>${esc(r.comment || '')}</p></div>`).join('') : '<p class="muted">Belum ada ulasan.</p>'}</div>
          <div id="review-form-wrap" style="margin-top:1.2rem"></div>
        </div>
      </div>

      <div>
        ${d.promos.length ? d.promos.map(p => `
          <div class="panel" style="background:#FFF3D6">
            <h3>🎉 ${esc(p.title)}</h3>
            <p class="muted">${esc(p.description || '')}</p>
            <p style="font-weight:800;color:var(--coral);margin-top:.5rem">${esc(p.discount || '')}</p>
          </div>`).join('') : ''}

        <div class="panel" style="background:#E5F7F3">
          <h3>Pesan Sekarang</h3>
          <form class="form" id="order-form">
            <input name="customer_name" placeholder="Nama kamu" required value="${STATE.user ? esc(STATE.user.name) : ''}">
            <input name="phone" placeholder="No. WhatsApp (08xx)" required>
            <input name="address" placeholder="Alamat kos / pengantaran" required>
            <select name="service_name" required>
              <option value="">— Pilih layanan —</option>
              ${d.services.map(s => `<option value="${esc(s.name)}" data-unit="${s.unit}" data-price="${s.price}">${esc(s.name)} — ${rp(s.price)}/${s.unit}</option>`).join('')}
            </select>
            <input name="weight_kg" type="number" min="0" step="0.5" placeholder="Berat (kg) — isi jika kiloan">
            <textarea name="notes" rows="2" placeholder="Catatan (opsional)"></textarea>
            <label style="display:flex;gap:.5rem;align-items:center;font-weight:600;font-size:.92rem">
              <input type="checkbox" name="pickup" style="width:auto"> Minta antar-jemput (+Rp3.000)</label>
            <button class="btn btn-primary btn-full" type="submit">Buat Pesanan</button>
          </form>
        </div>

        <div class="panel">
          <h3>Lokasi</h3>
          <div id="mini-map" style="height:220px;border-radius:12px;overflow:hidden"></div>
          <a class="btn btn-ghost btn-sm btn-full" style="margin-top:.9rem"
             href="https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}" target="_blank" rel="noopener">Buka di Google Maps ↗</a>
        </div>
      </div>
    </div>
  </section>`;

  const mm = L.map('mini-map', { zoomControl: false }).setView([l.lat, l.lon], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(mm);
  L.marker([l.lat, l.lon]).addTo(mm).bindPopup(esc(l.name)).openPopup();

  renderReviewForm(l.id);
  $('#order-form').addEventListener('submit', e => submitOrder(e, l));
}

function renderReviewForm(laundryId) {
  const wrap = $('#review-form-wrap');
  if (!STATE.user) {
    wrap.innerHTML = `<p class="muted">Ingin memberi ulasan? <a href="#/masuk" style="color:var(--teal-dark);font-weight:700">Masuk dulu</a>.</p>`;
    return;
  }
  wrap.innerHTML = `
    <form class="form" id="rev-form">
      <div class="row">
        <select name="rating" required><option value="5">★★★★★ (5)</option><option value="4">★★★★ (4)</option>
          <option value="3">★★★ (3)</option><option value="2">★★ (2)</option><option value="1">★ (1)</option></select>
        <input name="comment" placeholder="Tulis pengalamanmu..." required>
      </div>
      <button class="btn btn-ghost btn-sm" type="submit">Kirim Ulasan</button>
    </form>`;
  $('#rev-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/laundries/${laundryId}/reviews`, { method: 'POST', body: { rating: f.get('rating'), comment: f.get('comment') } });
      toast('Ulasan terkirim. Makasih!', 'ok');
      router();
    } catch (err) { toast(err.message, 'err'); }
  });
}

async function submitOrder(e, l) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('/orders', {
      method: 'POST',
      body: {
        laundry_id: l.id, customer_name: f.get('customer_name'), phone: f.get('phone'),
        address: f.get('address'), service_name: f.get('service_name'),
        weight_kg: Number(f.get('weight_kg')) || 0, notes: f.get('notes'),
        pickup: f.get('pickup') ? 1 : 0,
      },
    });
    toast(`Pesanan dibuat! Kode: ${r.code} · Total ${rp(r.total_price)}`, 'ok');
    location.hash = '#/lacak?code=' + r.code;
  } catch (err) { toast(err.message, 'err'); }
}

/* ---------------- VIEW: LACAK ---------------- */
async function viewLacak(params) {
  const code = params.get('code') || '';
  $('#app').innerHTML = `
  <div class="page-title"><h1>Lacak Pesanan</h1><p>Masukkan kode pesanan untuk melihat status cucianmu.</p></div>
  <section class="section" style="max-width:720px">
    <div class="panel">
      <form class="form" id="track-form" style="grid-template-columns:1fr auto;display:grid;gap:.85rem">
        <input name="code" placeholder="cth. LY-XXXXXX" value="${esc(code)}" required style="border:2px solid var(--line);border-radius:12px;padding:.68rem .9rem">
        <button class="btn btn-primary" type="submit">Lacak</button>
      </form>
    </div>
    <div id="track-result"></div>
  </section>`;
  $('#track-form').addEventListener('submit', async e => {
    e.preventDefault();
    const c = new FormData(e.target).get('code').trim();
    try {
      const { order } = await api('/orders/track/' + encodeURIComponent(c));
      const idx = STATUS_FLOW.indexOf(order.status);
      $('#track-result').innerHTML = `
        <div class="panel">
          <h3>${esc(order.laundry_name)} <span class="badge b-${order.status}">${STATUS_LABEL[order.status]}</span></h3>
          <p class="muted">Kode <b>${esc(order.code)}</b> · ${esc(order.service_name)} · Total <b>${rp(order.total_price)}</b></p>
          <div class="track-steps">
            ${STATUS_FLOW.map((s, i) => `
              <div class="tstep ${i <= idx ? 'done' : ''}"><span class="dot"></span><span>${STATUS_LABEL[s]}</span></div>`).join('')}
          </div>
          <p class="muted" style="margin-top:1rem">Dibuat: ${(order.created_at || '').slice(0, 16)} ${order.phone ? '· 📞 ' + esc(order.phone) : ''}</p>
        </div>`;
    } catch (err) {
      $('#track-result').innerHTML = `<div class="empty"><span class="big">🔍</span>${esc(err.message)}</div>`;
    }
  });
  if (code) $('#track-form').dispatchEvent(new Event('submit'));
}

/* ---------------- VIEW: DAFTAR MITRA ---------------- */
async function viewMitra() {
  $('#app').innerHTML = `
  <div class="page-title"><h1>Gabung Jadi Mitra Laundry</h1>
    <p>Punya usaha laundry di sekitar UNNES? Daftarkan gratis dan jangkau lebih banyak mahasiswa.</p></div>
  <section class="section" style="max-width:900px">
    <div class="about-grid" style="margin-bottom:1.6rem">
      <div class="about-card"><span class="ico">🆓</span><h3>Listing Gratis</h3>
        <p>Tanpa biaya pendaftaran. Profil usahamu tampil di peta dan daftar pencarian mahasiswa.</p></div>
      <div class="about-card"><span class="ico">📈</span><h3>Promoted Listing</h3>
        <p>Opsional: tampil di urutan teratas halaman utama supaya langsung dilihat calon pelanggan.</p></div>
    </div>
    <div class="panel">
      <h3>Formulir Pendaftaran Mitra</h3>
      <div id="mitra-form-wrap"></div>
    </div>
  </section>`;
  if (!STATE.user || !['owner', 'admin'].includes(STATE.user.role)) {
    $('#mitra-form-wrap').innerHTML = `
      <p class="muted" style="margin-bottom:1rem">Untuk mendaftarkan usaha, masuk dulu dengan akun <b>owner</b>.</p>
      <a class="btn btn-primary" href="#/masuk">Masuk / Daftar</a>
      <p class="muted" style="margin-top:.9rem;font-size:.88rem">Akun demo mitra: <b>owner@laundryyuk.id</b> · password <b>laundry123</b></p>`;
    return;
  }
  $('#mitra-form-wrap').innerHTML = `
    <form class="form" id="mitra-form">
      <input name="name" placeholder="Nama laundry" required>
      <div class="row">
        <select name="type"><option value="kiloan">Kiloan</option><option value="self_service">Self Service</option><option value="premium">Premium</option></select>
        <input name="phone" placeholder="No. WhatsApp">
      </div>
      <input name="address" placeholder="Alamat lengkap" required>
      <div class="row">
        <input name="lat" type="number" step="any" placeholder="Latitude (cth. -7.05)" required value="${STATE.center.lat}">
        <input name="lon" type="number" step="any" placeholder="Longitude (cth. 110.39)" required value="${STATE.center.lon}">
      </div>
      <div class="row">
        <input name="price_min" type="number" placeholder="Harga min / kg" value="5000">
        <input name="price_max" type="number" placeholder="Harga max / kg" value="10000">
      </div>
      <fieldset style="border:2px solid var(--line);border-radius:12px;padding:.8rem">
        <legend style="font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);padding:0 .4rem">Layanan</legend>
        <div style="display:flex;flex-wrap:wrap;gap:.8rem">
          ${['kiloan', 'satuan', 'self-service', 'koin', 'setrika', 'antar-jemput', 'dry-clean', 'cuci-sepatu']
            .map(s => `<label style="display:flex;gap:.35rem;align-items:center;font-size:.9rem;font-weight:600">
              <input type="checkbox" name="services" value="${s}" style="width:auto"> ${SERVICE_LABEL[s] || s}</label>`).join('')}
        </div>
      </fieldset>
      <button class="btn btn-primary btn-full" type="submit">Daftarkan Usaha</button>
    </form>`;
  $('#mitra-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/laundries', {
        method: 'POST',
        body: {
          name: f.get('name'), type: f.get('type'), phone: f.get('phone'), address: f.get('address'),
          lat: Number(f.get('lat')), lon: Number(f.get('lon')),
          price_min: Number(f.get('price_min')), price_max: Number(f.get('price_max')),
          services: f.getAll('services'),
        },
      });
      toast('Usaha berhasil didaftarkan!', 'ok');
      location.hash = '#/laundry/' + r.slug;
    } catch (err) { toast(err.message, 'err'); }
  });
}

/* ---------------- VIEW: DASHBOARD MITRA ---------------- */
async function viewDashboard() {
  if (!STATE.user || !['owner', 'admin'].includes(STATE.user.role)) {
    $('#app').innerHTML = `<div class="page-title"><h1>Dashboard Mitra</h1></div>
      <section class="section" style="max-width:520px"><div class="panel">
      <h3>Akses khusus pemilik laundry</h3><p class="muted" style="margin:.6rem 0 1rem">Masuk dengan akun owner untuk mengelola pesanan.</p>
      <a class="btn btn-primary" href="#/masuk">Masuk</a></div></section>`;
    return;
  }
  const d = await api('/owner/summary');
  const byStatus = Object.fromEntries(d.stats.map(s => [s.status, s.n]));
  $('#app').innerHTML = `
  <div class="page-title"><h1>Dashboard Mitra</h1><p>Kelola pesanan & pantau performa usahamu.</p></div>
  <section class="section">
    <div class="stats" style="padding:0 0 1.6rem">
      <div class="stat s1"><b>${d.orders.length}</b><span>Total pesanan</span></div>
      <div class="stat s2"><b>${byStatus.baru || 0}</b><span>Pesanan baru</span></div>
      <div class="stat s3"><b>${byStatus.dicuci || 0}</b><span>Sedang dicuci</span></div>
      <div class="stat s4"><b>${rp(d.revenue)}</b><span>Estimasi pendapatan</span></div>
    </div>
    <div class="panel">
      <h3>Daftar Pesanan Terbaru</h3>
      ${d.orders.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Kode</th><th>Pelanggan</th><th>Layanan</th><th>Total</th><th>Status</th><th>Ubah Status</th></tr></thead>
        <tbody>${d.orders.map(o => `
          <tr><td><b>${esc(o.code)}</b></td>
            <td>${esc(o.customer_name)}<br><span class="muted" style="font-size:.8rem">${esc(o.phone)}</span></td>
            <td>${esc(o.service_name)}<br><span class="muted" style="font-size:.8rem">${o.weight_kg} kg</span></td>
            <td>${rp(o.total_price)}</td>
            <td><span class="badge b-${o.status}">${STATUS_LABEL[o.status]}</span></td>
            <td><select data-code="${esc(o.code)}" class="status-sel" style="border:2px solid var(--line);border-radius:9px;padding:.3rem .5rem">
              ${Object.keys(STATUS_LABEL).map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
            </select></td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty"><span class="big">📭</span>Belum ada pesanan masuk.</div>'}
    </div>
    <div class="panel">
      <h3>Usaha Saya</h3>
      <div class="grid">${d.laundries.map(laundryCard).join('') || '<p class="muted">Belum ada laundry terdaftar.</p>'}</div>
    </div>
  </section>`;
  $$('.status-sel').forEach(sel => sel.addEventListener('change', async () => {
    try { await api('/orders/' + sel.dataset.code + '/status', { method: 'PATCH', body: { status: sel.value } });
      toast('Status diperbarui', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }));
}

/* ---------------- VIEW: AUTH ---------------- */
function viewAuth(mode) {
  const login = mode !== 'register';
  $('#app').innerHTML = `
  <div class="auth-box">
    <h2>${login ? 'Masuk ke Laundry Yuk!' : 'Buat Akun Baru'}</h2>
    <p>${login ? 'Selamat datang kembali 👋' : 'Gabung komunitas laundry kampus.'}</p>
    <form class="form" id="auth-form">
      ${login ? '' : `<input name="name" placeholder="Nama lengkap" required>`}
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password" required>
      ${login ? '' : `<select name="role"><option value="customer">Saya Mahasiswa / Pelanggan</option>
        <option value="owner">Saya Pemilik Laundry (Mitra)</option></select>`}
      <p class="form-err" id="auth-err"></p>
      <button class="btn btn-primary btn-full" type="submit">${login ? 'Masuk' : 'Daftar'}</button>
    </form>
    <div class="auth-switch">${login
      ? 'Belum punya akun? <a href="#/daftar">Daftar di sini</a>'
      : 'Sudah punya akun? <a href="#/masuk">Masuk</a>'}</div>
    <p class="muted" style="font-size:.82rem;margin-top:1rem;text-align:center">
      Demo: mahasiswa@unnes.ac.id / owner@laundryyuk.id · pass <b>laundry123</b></p>
  </div>`;
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const body = { email: f.get('email'), password: f.get('password') };
      if (!login) { body.name = f.get('name'); body.role = f.get('role'); }
      const r = await api('/auth/' + (login ? 'login' : 'register'), { method: 'POST', body });
      STATE.user = r.user; renderNav();
      toast(`Halo, ${r.user.name}!`, 'ok');
      location.hash = ['owner', 'admin'].includes(r.user.role) ? '#/dashboard' : '#/';
    } catch (err) {
      const el = $('#auth-err'); el.textContent = err.message; el.style.display = 'block';
    }
  });
}

/* ---------------- NAV ---------------- */
function renderNav() {
  const box = $('#nav-auth');
  if (STATE.user) {
    box.innerHTML = `<span class="muted" style="font-size:.88rem;font-weight:600">👤 ${esc(STATE.user.name)}</span>
      <button class="btn btn-ghost btn-sm" id="logout">Keluar</button>`;
    $('#logout').onclick = async () => {
      await api('/auth/logout', { method: 'POST' });
      STATE.user = null; renderNav(); toast('Berhasil keluar');
      location.hash = '#/';
    };
  } else {
    box.innerHTML = `<a class="btn btn-ghost btn-sm" href="#/masuk">Masuk</a>
      <a class="btn btn-primary btn-sm" href="#/daftar">Daftar</a>`;
  }
  $$('[data-role="owner"]').forEach(el => el.hidden = !STATE.user || !['owner', 'admin'].includes(STATE.user.role));
}

/* ---------------- ROUTER ---------------- */
async function router() {
  const hash = location.hash.slice(1) || '/';
  const [pathPart, queryPart] = hash.split('?');
  const params = new URLSearchParams(queryPart || '');
  const parts = pathPart.split('/').filter(Boolean);

  $$('[data-nav]').forEach(a => a.classList.remove('active'));

  try {
    if (parts[0] === 'laundry' && parts[1])      { await viewDetail(parts[1]); $$('[data-nav]')[1]?.classList.add('active'); }
    else if (parts[0] === 'peta')                { await viewPeta(); $$('[data-nav]')[1]?.classList.add('active'); }
    else if (parts[0] === 'daftar-mitra')        { await viewMitra(); $$('[data-nav]')[2]?.classList.add('active'); }
    else if (parts[0] === 'lacak')               { await viewLacak(params); $$('[data-nav]')[3]?.classList.add('active'); }
    else if (parts[0] === 'dashboard')           { await viewDashboard(); }
    else if (parts[0] === 'masuk')               { viewAuth('login'); }
    else if (parts[0] === 'daftar')              { viewAuth('register'); }
    else                                         { await viewHome(); $$('[data-nav]')[0]?.classList.add('active'); }
  } catch (err) {
    $('#app').innerHTML = `<div class="empty" style="padding:5rem 1rem"><span class="big">😵</span>
      <h2 style="color:var(--ink)">${esc(err.message)}</h2>
      <p><a href="#/" style="color:var(--teal-dark);font-weight:700">← Balik ke beranda</a></p></div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------------- INIT ---------------- */
(async function init() {
  try { STATE.user = (await api('/auth/me')).user; } catch { STATE.user = null; }
  renderNav();
  window.addEventListener('hashchange', router);
  router();
})();
