require('dotenv').config();
const fetch = require('node-fetch');
const { sleep, launchBrowser } = require('./utils');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE = 'Businesses';

const NEW_CATEGORIES = ['Luxury Pet Services', 'Event Planners'];

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

async function scrapeWebsite(context, website) {
  const page = await context.newPage();
  const result = { description: '', services: '' };

  try {
    await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await sleep(2000);

    const data = await page.evaluate(() => {
      const metaDesc = document.querySelector('meta[name="description"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      let description = '';
      if (metaDesc && metaDesc.content && metaDesc.content.length > 30) {
        description = metaDesc.content.trim();
      } else if (ogDesc && ogDesc.content && ogDesc.content.length > 30) {
        description = ogDesc.content.trim();
      }

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

      const serviceTexts = new Set();
      const serviceHeadings = document.querySelectorAll(
        'h2, h3, h4, [class*="service"] h2, [class*="service"] h3, ' +
        '[class*="treatment"] li, [class*="service"] li, ' +
        'nav a, .menu a, [class*="menu"] a'
      );

      const serviceKeywords = /service|treatment|therapy|iv\b|drip|wellness|vitamin|doctor|physician|concierge|medical|health|consult|moving|relocation|organize|pack|art|gallery|apprais|collect|advis|curator|estate|design|chef|menu|cuisine|facial|botox|filler|laser|peel|groom|pet|dog|cat|vet|boarding|daycare|spa|walk|train|event|wedding|party|corporate|catering|floral|decor|planner|coordinator|venue/i;

      serviceHeadings.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 3 && text.length < 50 && serviceKeywords.test(text)) {
          serviceTexts.add(text);
        }
      });

      return {
        description: description.substring(0, 500),
        services: [...serviceTexts].slice(0, 15).join(', ')
      };
    }).catch(() => ({ description: '', services: '' }));

    result.description = data.description;
    result.services = data.services;
  } catch (e) {
    // ignore timeout/nav errors
  }

  await page.close();
  return result;
}

async function run() {
  console.log('=== Velora: Enrich New Categories ===\n');

  const records = await getAllRecords();
  const newRecords = records.filter(r => NEW_CATEGORIES.includes(r.fields.category));
  console.log(`${newRecords.length} new category businesses to enrich\n`);

  const { browser, context } = await launchBrowser();
  let updated = 0;

  for (const rec of newRecords) {
    const f = rec.fields;
    console.log(`  ${f.name}...`);
    const updates = {};

    if (f.website && !f.website.includes('instagram.com') && !f.website.includes('linktr.ee')) {
      const webData = await scrapeWebsite(context, f.website);

      if (webData.description && webData.description.length > (f.description || '').length) {
        updates.description = webData.description;
        console.log(`    Desc: ${webData.description.substring(0, 60)}...`);
      }

      if (webData.services) {
        updates.services = webData.services;
        console.log(`    Svcs: ${webData.services.substring(0, 60)}...`);
      }
    }

    if (Object.keys(updates).length) {
      await updateRecord(rec.id, updates);
      updated++;
    } else {
      console.log(`    No changes`);
    }

    await sleep(1000);
  }

  await browser.close();
  console.log(`\nEnriched ${updated} / ${newRecords.length} businesses`);
}

run().catch(console.error);
