// scrape-laundry.js — Multiple Google Maps queries, extract all laundry
// Jalankan: node scrape-laundry.js
// Hasil: data/gmaps_all.json

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const QUERIES = [
  'laundry sekitar UNNES Gunungpati Semarang',
  'laundry kiloan Sekaran Gunungpati',
  'self service laundry Gunungpati Semarang',
  'laundry koin Sekaran UNNES',
  'dry cleaning laundry Gunungpati',
  'cuci sepatu Gunungpati Semarang',
  'laundry murah dekat kampus UNNES',
  'laundry jalan Taman Siswa Gunungpati',
  'laundry jalan Kalimasada Sekaran',
  'laundry jalan Pete Gunungpati',
  'laundry jalan Kolonel HR Hadijanto Gunungpati',
  'laundry Ngesrep Gunungpati',
  'laundry Bungkusari Gunungpati',
  'laundry Jatirejo Gunungpati',
  'laundry Condongsari Gunungpati',
  'laundry Srondol Wetan Ungaran',
  'laundry Srondol Kulon Ungaran',
  'laundry Kedungmundu Semarang',
  'laundry Tembalang Semarang',
  'laundry Banyumanik Semarang Utara',
  'laundry koin self service Sekaran',
  'laundry expres cuci kilat Gunungpati',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLaundry = new Map(); // name -> data

async function scrape(browser, query, lat, lon, zoom) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lon},${zoom}z?hl=id`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(5000);

    // Scroll feed 30x
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => {
        const f = document.querySelector('div[role="feed"]');
        if (f) f.scrollBy(0, 2500);
      });
      await sleep(1200);
    }

    // Extract results
    const results = await page.evaluate(() => {
      const items = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="/maps/place/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const name = a.getAttribute('aria-label') || '';
        if (!name || name.length < 3 || seen.has(name)) return;
        seen.add(name);

        const m = href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
        // Get parent text block for details
        let parent = a.closest('[jsaction]') || a.parentElement;
        let text = '';
        for (let p = a.parentElement; p && p !== document.body; p = p.parentElement) {
          if (p.innerText && p.innerText.length > 40 && p.innerText.length < 600) {
            text = p.innerText;
            break;
          }
        }
        if (!text) text = a.parentElement?.innerText || '';

        items.push({
          name,
          lat: m ? parseFloat(m[1]) : null,
          lon: m ? parseFloat(m[2]) : null,
          text: text.slice(0, 300).replace(/\n/g, ' ~ '),
          href: href.slice(0, 400),
        });
      });
      return items;
    });

    console.log(`  [${query.slice(0, 40)}] → ${results.length} hasil`);
    return results;
  } catch (e) {
    console.log(`  [${query.slice(0, 40)}] → ERROR: ${e.message}`);
    return [];
  } finally {
    await page.close();
  }
}

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  for (const q of QUERIES) {
    const results = await scrape(browser, q, -7.0502, 110.3990, 14);
    for (const r of results) {
      if (!allLaundry.has(r.name)) {
        allLaundry.set(r.name, r);
      }
    }
    await sleep(1500);
  }

  await browser.close();

  const items = Array.from(allLaundry.values());
  console.log(`\nTotal unique: ${items.length}`);
  fs.writeFileSync(path.join(__dirname, 'data', 'gmaps_all.json'), JSON.stringify(items, null, 2));
  console.log('Saved to data/gmaps_all.json');
})();
