-- ============================================================
--  Laundry Yuk! — Skema Database (SQLite embedded)
--  Platform agregator laundry sekitar kampus UNNES Sekaran
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer','owner','admin')),
  phone         TEXT,
  campus_area   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- LAUNDRIES ----------
CREATE TABLE IF NOT EXISTS laundries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  type          TEXT    NOT NULL DEFAULT 'kiloan'
                CHECK (type IN ('kiloan','self_service','premium')),
  category      TEXT,
  description   TEXT,
  address       TEXT    NOT NULL,
  lat           REAL    NOT NULL,
  lon           REAL    NOT NULL,
  rating        REAL    NOT NULL DEFAULT 0,
  review_count  INTEGER NOT NULL DEFAULT 0,
  hours         TEXT,
  open_24h      INTEGER NOT NULL DEFAULT 0,
  phone         TEXT,
  price_min     INTEGER NOT NULL DEFAULT 0,
  price_max     INTEGER NOT NULL DEFAULT 0,
  price_unit    TEXT    NOT NULL DEFAULT 'kg',
  services      TEXT    NOT NULL DEFAULT '',
  images        TEXT    NOT NULL DEFAULT '',
  promoted      INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','pending','suspended')),
  source        TEXT    DEFAULT 'manual',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_laundry_geo   ON laundries(lat, lon);
CREATE INDEX IF NOT EXISTS idx_laundry_type  ON laundries(type);
CREATE INDEX IF NOT EXISTS idx_laundry_promo ON laundries(promoted, rating);

-- ---------- SERVICES (detail layanan + harga) ----------
CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  laundry_id  INTEGER NOT NULL REFERENCES laundries(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  unit        TEXT    NOT NULL DEFAULT 'kg',
  price       INTEGER NOT NULL,
  eta_hours   INTEGER NOT NULL DEFAULT 48,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_services_laundry ON services(laundry_id);

-- ---------- REVIEWS ----------
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  laundry_id  INTEGER NOT NULL REFERENCES laundries(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT    NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_laundry ON reviews(laundry_id);

-- ---------- ORDERS ----------
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,
  laundry_id    INTEGER NOT NULL REFERENCES laundries(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  address       TEXT    NOT NULL,
  service_name  TEXT    NOT NULL,
  weight_kg     REAL    NOT NULL DEFAULT 0,
  notes         TEXT,
  pickup        INTEGER NOT NULL DEFAULT 0,
  total_price   INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'baru'
                CHECK (status IN ('baru','dijemput','dicuci','selesai','diantar','batal')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_laundry ON orders(laundry_id, status);

-- ---------- PROMOTIONS ----------
CREATE TABLE IF NOT EXISTS promotions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  laundry_id  INTEGER NOT NULL REFERENCES laundries(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT,
  discount    TEXT,
  starts_at   TEXT,
  ends_at     TEXT,
  active      INTEGER NOT NULL DEFAULT 1
);

-- ---------- FAVORITES ----------
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  laundry_id INTEGER NOT NULL REFERENCES laundries(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, laundry_id)
);
