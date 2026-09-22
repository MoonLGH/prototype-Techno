// ============================================================
//  Laundry Yuk! — Koneksi SQLite (embedded, better-sqlite3)
// ============================================================
const path  = require('path');
const fs    = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'laundryyuk.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performa & integritas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Buat tabel jika belum ada (idempotent)
const schemaPath = path.join(__dirname, 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf-8'));

module.exports = { db, DB_PATH };
