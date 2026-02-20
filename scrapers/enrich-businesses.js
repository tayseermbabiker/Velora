require('dotenv').config();
const fetch = require('node-fetch');
const { sleep, launchBrowser } = require('./utils');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE = 'Businesses';

async function getAllRecords() {
  const records = [];
  let offset = null;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);
  return records;
}

async function enrichFromGoogleMaps(context, bizName, bizCity) {
  const page = await context.newPage();
  const result = { services: '', hours: '', reviews: '', photos: '' };

  try {
    const query = `${bizName} ${bizCity}`;
    // Force English with hl=en
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);

    // Click first result if on search results page
    const firstResult = await page.$('div[role="feed"] a[href*="/maps/place/"]');
    if (firstResult) {
      await firstResult.click();
      await sleep(4000);
    }

    // --- HOURS: click the hours section to expand it ---
    const hoursBtn = await page.$('button[data-item-id="oh"], div[aria-label*="hour" i], button[aria-label*="hour" i]');
    if (hoursBtn) {
      try {
        await hoursBtn.click();
        await sleep(1500);
      } catch (e) {}
    }

    const hours = await page.evaluate(() => {
      // Try the expanded hours table
      const rows = [];
      const trs = document.querySelectorAll('table.eK4R0e tr, table.WgFkxc tr, div[class*="opening-hours"] tr');
      trs.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 2) {
          const day = cells[0].textContent.trim();
          const time = cells[1].textContent.trim();
          if (day && time) rows.push(`${day}: ${time}`);
        }
      });
      if (rows.length) return rows.join('\n');

      // Try aria-label text that contains hours info
      const els = document.querySelectorAll('[aria-label]');
      for (const el of els) {
        const label = el.getAttribute('aria-label') || '';
        if (label.includes('Monday') && label.includes('Tuesday')) {
          return label;
        }
      }

      // Try the compact hours display
      const compact = document.querySelector('div[aria-label*="hour" i]');
      if (compact) {
        const text = compact.textContent.trim();
        if (text.length > 5 && text.length < 500) return text;
      }

      return '';
    }).catch(() => '');

    // --- SERVICES: look for About tab attributes ---
    // Try clicking "About" tab if available
    const aboutTab = await page.$('button[aria-label="About"]');
    if (aboutTab) {
      try {
        await aboutTab.click();
        await sleep(2000);
      } catch (e) {}
    }

    const services = await page.evaluate(() => {
      const items = [];

      // Amenities/attributes with checkmarks
      const attrEls = document.querySelectorAll('div[role="region"] li span, div[class*="section"] li');
      attrEls.forEach(el => {
        const text = el.textContent.trim();
        if (text && text.length > 2 && text.length < 60 && !text.startsWith('No ')) {
          items.push(text);
        }
      });

      // Attribute groups (Accessibility, Offerings, etc.)
      const groups = document.querySelectorAll('div[aria-label] ul li, div[class*="attr"] span');
      groups.forEach(el => {
        const t = el.textContent.trim();
        if (t && t.length > 2 && t.length < 50 && !items.includes(t) && !t.startsWith('No ')) {
          items.push(t);
        }
      });

      // Unique only
      const unique = [...new Set(items)];
      return unique.slice(0, 20).join(', ');
    }).catch(() => '');

    // Go back to Overview tab for reviews
    const overviewTab = await page.$('button[aria-label="Overview"]');
    if (overviewTab) {
      try {
        await overviewTab.click();
        await sleep(1500);
      } catch (e) {}
    }

    // --- REVIEWS: click Reviews tab and extract ---
    const reviewsTab = await page.$('button[aria-label="Reviews"]');
    if (reviewsTab) {
      try {
        await reviewsTab.click();
        await sleep(3000);
      } catch (e) {}
    }

    const reviews = await page.evaluate(() => {
      const snippets = [];
      // Review text spans
      const reviewEls = document.querySelectorAll('span.wiI7pd, div.MyEned span, div[data-review-id] span.wiI7pd');
      reviewEls.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 40 && text.length < 600) {
          snippets.push(text);
        }
      });
      return snippets.slice(0, 3).join('\n---\n');
    }).catch(() => '');

    // --- PHOTOS: extract from the photos that are visible ---
    const photos = await page.evaluate(() => {
      const urls = new Set();
      const imgs = document.querySelectorAll('img[decoding="async"], button[jsaction*="photo"] img, img[src*="googleusercontent"]');
      imgs.forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src.includes('googleusercontent') && src.includes('=') && !src.includes('default_user')) {
          const hiRes = src.replace(/=w\d+-h\d+/, '=w800-h600').replace(/=s\d+/, '=s800');
          urls.add(hiRes);
        }
      });
      return [...urls].slice(0, 5).join('\n');
    }).catch(() => '');

    result.services = services;
    result.hours = hours;
    result.reviews = reviews;
    result.photos = photos;
  } catch (e) {
    console.log(`    ! Error: ${e.message}`);
  }

  await page.close();
  return result;
}

async function updateRecord(id, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}/${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) console.log(`    ! Update failed: ${await res.text()}`);
}

async function run() {
  console.log('=== Velora: Enrichment Scraper (EN) ===\n');

  const records = await getAllRecords();
  console.log(`${records.length} total businesses\n`);

  if (!records.length) return;

  const { browser, context } = await launchBrowser();
  let enriched = 0;

  for (const rec of records) {
    const name = rec.fields.name;
    const city = rec.fields.city || 'New York';
    console.log(`  ${name}...`);

    const data = await enrichFromGoogleMaps(context, name, city);

    const updates = {};
    if (data.services) { updates.services = data.services; console.log(`    Services: ${data.services.substring(0, 80)}...`); }
    if (data.hours) { updates.hours = data.hours; console.log(`    Hours: found`); }
    if (data.reviews) { updates.reviews = data.reviews; console.log(`    Reviews: ${data.reviews.split('---').length} snippets`); }
    if (data.photos) { updates.photos = data.photos; console.log(`    Photos: ${data.photos.split('\n').length} images`); }

    if (Object.keys(updates).length) {
      await updateRecord(rec.id, updates);
      enriched++;
    } else {
      console.log(`    No data found`);
    }

    await sleep(2000);
  }

  await browser.close();
  console.log(`\nEnriched ${enriched} / ${records.length} businesses`);
}

run().catch(console.error);
