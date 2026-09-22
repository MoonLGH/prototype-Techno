// scrape.js — Multi-query Google Maps scrape via browser tool output
// Hasilnya ditulis ke workspace, gue baca dari terminal
const fs = require('fs');

// Read all gmaps files
const files = fs.readdirSync(__dirname).filter(f => f.startsWith('gm') && f.endsWith('.json'));
const all = new Map();

for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    if (data.items) {
      for (const item of data.items) {
        if (!all.has(item.name)) all.set(item.name, item);
      }
    }
  } catch {}
}

const items = Array.from(all.values());
console.log('Unique from local files:', items.length);
fs.writeFileSync('data/gmaps_all.json', JSON.stringify(items, null, 2));
console.log('Saved');
