require('dotenv').config();
const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE = 'Businesses';

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await res.text();

    // Try og:image first
    let match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (!match) match = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

    if (match && match[1]) {
      let img = match[1];
      if (img.startsWith('//')) img = 'https:' + img;
      if (img.startsWith('/')) img = new URL(img, url).href;
      return img;
    }
  } catch (e) {
    console.log(`  ! Could not fetch ${url}: ${e.message}`);
  }
  return null;
}

async function run() {
  // Get all businesses
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}?pageSize=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
  });
  const data = await res.json();
  const records = data.records || [];

  console.log(`Found ${records.length} businesses\n`);

  for (const rec of records) {
    const name = rec.fields.name;
    const website = rec.fields.website;

    if (!website) {
      console.log(`${name}: no website, skipping`);
      continue;
    }

    console.log(`${name}: fetching image from ${website}`);
    const imageUrl = await fetchOgImage(website);

    // Build update: image + remove fake ratings
    const updates = {
      rating: null,
      review_count: null
    };

    if (imageUrl) {
      updates.image_url = imageUrl;
      console.log(`  -> ${imageUrl.substring(0, 80)}...`);
    } else {
      console.log(`  -> no og:image found`);
    }

    // Clean fake phone numbers (555-xxxx)
    if (rec.fields.phone && rec.fields.phone.includes('555-')) {
      updates.phone = '';
      console.log(`  -> removed fake phone`);
    }

    // Update record
    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}/${rec.id}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: updates })
    });

    if (!patchRes.ok) {
      console.log(`  ! Airtable update failed: ${await patchRes.text()}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone.');
}

run().catch(console.error);
