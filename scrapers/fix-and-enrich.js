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

// Strip Arabic text from addresses
function cleanAddress(addr) {
  if (!addr) return '';
  // Remove Arabic characters and common Arabic suffixes
  return addr
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '')
    .replace(/،\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get full hours from Google Maps with English forced
async function getFullHours(context, bizName) {
  const page = await context.newPage();
  let hours = '';

  try {
    const query = `${bizName} New York`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);

    // Click first result
    const firstResult = await page.$('div[role="feed"] a[href*="/maps/place/"]');
    if (firstResult) {
      await firstResult.click();
      await sleep(4000);
    }

    // Try to find and click the hours element to expand it
    const hoursExpander = await page.$('[data-item-id="oh"]');
    if (hoursExpander) {
      await hoursExpander.click();
      await sleep(2000);
    }

    // Extract full week hours from the expanded dialog/section
    hours = await page.evaluate(() => {
      const rows = [];

      // Method 1: Look for the hours table (most reliable)
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const trs = table.querySelectorAll('tr');
        if (trs.length >= 5) { // a weekly hours table has 7 rows
          trs.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 2) {
              const day = tds[0].textContent.trim();
              const time = tds[tds.length - 1].textContent.trim();
              if (day && time && day.length < 20) {
                rows.push(`${day}: ${time}`);
              }
            }
          });
          if (rows.length >= 5) return rows.join('\n');
        }
      }

      // Method 2: aria-label on the hours section often has full text
      const allEls = document.querySelectorAll('[aria-label]');
      for (const el of allEls) {
        const label = el.getAttribute('aria-label') || '';
        // Look for a label that mentions multiple days
        if (label.includes('Monday') && label.includes('Sunday')) {
          // Parse it: "Monday, 9 AM to 5 PM; Tuesday, 9 AM to 5 PM; ..."
          const parts = label.split(/[;.]/).filter(p => p.trim());
          const dayParts = parts.filter(p =>
            /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(p)
          );
          if (dayParts.length >= 5) {
            return dayParts.map(p => p.trim().replace(/,\s*/, ': ')).join('\n');
          }
          return label;
        }
      }

      // Method 3: just get whatever hours text is visible
      const hoursDiv = document.querySelector('[data-item-id="oh"]');
      if (hoursDiv) {
        const text = hoursDiv.textContent.trim();
        if (text.length > 5) return text;
      }

      return '';
    }).catch(() => '');
  } catch (e) {
    // ignore
  }

  await page.close();
  return hours;
}

// Scrape description and services from business website
async function scrapeWebsite(context, website) {
  const page = await context.newPage();
  const result = { description: '', services: '' };

  try {
    await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);

    const data = await page.evaluate(() => {
      // Get meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      let description = '';
      if (metaDesc && metaDesc.content && metaDesc.content.length > 30) {
        description = metaDesc.content.trim();
      } else if (ogDesc && ogDesc.content && ogDesc.content.length > 30) {
        description = ogDesc.content.trim();
      }

      // If no meta description, try to get from hero/about text
      if (!description || description.length < 40) {
        const candidates = document.querySelectorAll(
          'main p, .about p, .hero p, [class*="description"] p, [class*="about"] p, ' +
          'section p, .intro p, [class*="intro"] p, [class*="hero"] p'
        );
        for (const p of candidates) {
          const text = p.textContent.trim();
          if (text.length > 50 && text.length < 500 && !text.includes('cookie') && !text.includes('©')) {
            description = text;
            break;
          }
        }
      }

      // Extract services from headings, list items, menu items
      const serviceTexts = new Set();

      // Look for service-related sections
      const serviceHeadings = document.querySelectorAll(
        'h2, h3, h4, [class*="service"] h2, [class*="service"] h3, ' +
        '[class*="treatment"] li, [class*="service"] li, ' +
        'nav a, .menu a, [class*="menu"] a'
      );

      const serviceKeywords = /service|treatment|facial|botox|filler|laser|peel|micro|massage|injection|sculpt|design|consult|chef|menu|cuisine|cook|dining|interior|residential|commercial|renovation|remodel/i;

      serviceHeadings.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 3 && text.length < 50 && serviceKeywords.test(text)) {
          serviceTexts.add(text);
        }
      });

      // Also try structured data
      const jsonLds = document.querySelectorAll('script[type="application/ld+json"]');
      jsonLds.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          if (data.hasOwnProperty && data.hasOwnProperty('makesOffer')) {
            const offers = Array.isArray(data.makesOffer) ? data.makesOffer : [data.makesOffer];
            offers.forEach(o => {
              if (o.name) serviceTexts.add(o.name);
            });
          }
        } catch (e) {}
      });

      return {
        description: description.substring(0, 500),
        services: [...serviceTexts].slice(0, 15).join(', ')
      };
    }).catch(() => ({ description: '', services: '' }));

    result.description = data.description;
    result.services = data.services;
  } catch (e) {
    // ignore
  }

  await page.close();
  return result;
}

async function run() {
  console.log('=== Velora: Fix & Enrich ===\n');

  const records = await getAllRecords();
  console.log(`${records.length} total businesses\n`);

  const { browser, context } = await launchBrowser();
  let updated = 0;

  for (const rec of records) {
    const f = rec.fields;
    console.log(`  ${f.name}...`);
    const updates = {};

    // 1. Fix Arabic in address
    const cleanAddr = cleanAddress(f.address);
    if (cleanAddr !== f.address) {
      updates.address = cleanAddr;
      console.log(`    Address cleaned`);
    }

    // 2. Get full hours from Google Maps
    const hours = await getFullHours(context, f.name);
    if (hours && hours.length > (f.hours || '').length) {
      updates.hours = hours;
      console.log(`    Hours: ${hours.substring(0, 60)}...`);
    }

    // 3. Scrape website for description + services
    if (f.website && !f.website.includes('linktr.ee')) {
      const webData = await scrapeWebsite(context, f.website);

      if (webData.description && webData.description.length > (f.description || '').length) {
        updates.description = webData.description;
        console.log(`    Description: ${webData.description.substring(0, 60)}...`);
      }

      if (webData.services) {
        updates.services = webData.services;
        console.log(`    Services: ${webData.services.substring(0, 60)}...`);
      }
    }

    // 4. Deduplicate photos
    if (f.photos) {
      const uniquePhotos = [...new Set(f.photos.split('\n').map(s => s.trim()).filter(Boolean))];
      if (uniquePhotos.length !== f.photos.split('\n').filter(Boolean).length) {
        updates.photos = uniquePhotos.join('\n');
      }
    }

    if (Object.keys(updates).length) {
      await updateRecord(rec.id, updates);
      updated++;
    } else {
      console.log(`    No changes`);
    }

    await sleep(1500);
  }

  await browser.close();
  console.log(`\nUpdated ${updated} / ${records.length} businesses`);
}

run().catch(console.error);
