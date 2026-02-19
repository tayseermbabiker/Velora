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
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    // Click first result if we're on search results (not direct place page)
    const firstResult = await page.$('div[role="feed"] a[href*="/maps/place/"]');
    if (firstResult) {
      await firstResult.click();
      await sleep(3000);
    }

    // Extract services/amenities
    const services = await page.evaluate(() => {
      const items = [];
      // Services from "Services" section
      const serviceEls = document.querySelectorAll('div[aria-label*="Services"] li, div[aria-label*="Offerings"] li, div[aria-label*="Amenities"] li');
      serviceEls.forEach(el => {
        const text = el.textContent.trim();
        if (text && !text.includes('No ')) items.push(text);
      });
      // Also try the chips/tags that Google shows
      const chips = document.querySelectorAll('div.e2moi span, div[class*="category"] span');
      chips.forEach(el => {
        const t = el.textContent.trim();
        if (t && t.length < 40 && !items.includes(t)) items.push(t);
      });
      return items.slice(0, 15).join(', ');
    }).catch(() => '');

    // Extract hours
    const hours = await page.evaluate(() => {
      const hoursTable = document.querySelector('table.eK4R0e, table[class*="hour"]');
      if (hoursTable) {
        const rows = [];
        hoursTable.querySelectorAll('tr').forEach(tr => {
          const day = tr.querySelector('td:first-child')?.textContent?.trim() || '';
          const time = tr.querySelector('td:last-child')?.textContent?.trim() || '';
          if (day && time) rows.push(`${day}: ${time}`);
        });
        return rows.join('\n');
      }
      // Try the hours button text
      const hoursBtn = document.querySelector('div[aria-label*="hours"], button[aria-label*="hours"]');
      return hoursBtn ? hoursBtn.textContent.trim() : '';
    }).catch(() => '');

    // Extract review snippets
    const reviews = await page.evaluate(() => {
      const snippets = [];
      const reviewEls = document.querySelectorAll('div.MyEned span, div[class*="review"] span.wiI7pd');
      reviewEls.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 30 && text.length < 500) {
          snippets.push(text);
        }
      });
      return snippets.slice(0, 3).join('\n---\n');
    }).catch(() => '');

    // Extract additional photos
    const photos = await page.evaluate(() => {
      const urls = [];
      const imgs = document.querySelectorAll('button[jsaction*="photo"] img, div[class*="gallery"] img, img[decoding="async"]');
      imgs.forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src.includes('googleusercontent') && src.includes('=') && !urls.includes(src)) {
          // Get higher res version
          const hiRes = src.replace(/=w\d+-h\d+/, '=w800-h600').replace(/=s\d+/, '=s800');
          urls.push(hiRes);
        }
      });
      return urls.slice(0, 5).join('\n');
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
  console.log('=== Velora: Enrichment Scraper ===\n');

  const records = await getAllRecords();
  // Only enrich records that are missing services
  const toEnrich = records.filter(r => !r.fields.services);
  console.log(`${toEnrich.length} businesses need enrichment\n`);

  if (!toEnrich.length) {
    console.log('All businesses already enriched.');
    return;
  }

  const { browser, context } = await launchBrowser();
  let enriched = 0;

  for (const rec of toEnrich) {
    const name = rec.fields.name;
    const city = rec.fields.city || 'New York';
    console.log(`  ${name}...`);

    const data = await enrichFromGoogleMaps(context, name, city);

    const updates = {};
    if (data.services) { updates.services = data.services; console.log(`    Services: ${data.services.substring(0, 60)}...`); }
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
  console.log(`\nEnriched ${enriched} / ${toEnrich.length} businesses`);
}

run().catch(console.error);
