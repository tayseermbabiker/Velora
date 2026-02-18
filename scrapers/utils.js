require('dotenv').config();
const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE_NAME = 'Businesses';

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getExistingSlugs() {
  const slugs = new Set();
  let offset = null;

  do {
    const params = new URLSearchParams();
    params.set('fields[]', 'slug');
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    const data = await res.json();

    for (const rec of data.records || []) {
      if (rec.fields.slug) slugs.add(rec.fields.slug);
    }
    offset = data.offset || null;
  } while (offset);

  return slugs;
}

async function pushToAirtable(businesses) {
  if (!businesses.length) {
    console.log('No businesses to push.');
    return;
  }

  const existingSlugs = await getExistingSlugs();
  const newBiz = businesses.filter(b => !existingSlugs.has(b.slug));

  console.log(`Found ${businesses.length} total, ${newBiz.length} new (${businesses.length - newBiz.length} duplicates skipped)`);

  if (!newBiz.length) return;

  // Airtable max 10 records per request
  for (let i = 0; i < newBiz.length; i += 10) {
    const batch = newBiz.slice(i, i + 10);
    const records = batch.map(b => ({
      fields: {
        name: b.name,
        slug: b.slug,
        category: b.category,
        city: b.city || 'New York',
        neighborhood: b.neighborhood || '',
        address: b.address || '',
        phone: b.phone || '',
        email: b.email || '',
        website: b.website || '',
        instagram: b.instagram || '',
        description: b.description || '',
        image_url: b.image_url || '',
        rating: b.rating || null,
        review_count: b.review_count || null,
        price_range: b.price_range || null,
        source: b.source || '',
        click_count: 0,
        created_at: new Date().toISOString().split('T')[0],
        scraped_at: new Date().toISOString().split('T')[0]
      }
    }));

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Airtable error (batch ${i / 10 + 1}):`, errText);
    } else {
      console.log(`Pushed batch ${i / 10 + 1} (${batch.length} records)`);
    }

    if (i + 10 < newBiz.length) await sleep(250);
  }
}

async function launchBrowser() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  return { browser, context };
}

module.exports = { slugify, sleep, getExistingSlugs, pushToAirtable, launchBrowser };
