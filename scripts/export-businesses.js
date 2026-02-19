require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE = 'Businesses';

async function exportBusinesses() {
  console.log('Exporting businesses from Airtable...');
  const records = [];
  let offset = null;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  // Shape the data for frontend consumption
  const businesses = records.map(r => ({
    id: r.id,
    name: r.fields.name || '',
    slug: r.fields.slug || '',
    category: r.fields.category || '',
    city: r.fields.city || 'New York',
    neighborhood: r.fields.neighborhood || '',
    address: r.fields.address || '',
    phone: r.fields.phone || '',
    website: r.fields.website || '',
    description: r.fields.description || '',
    image_url: r.fields.image_url || '',
    rating: r.fields.rating || null,
    review_count: r.fields.review_count || null,
    price_range: r.fields.price_range || '',
    featured: r.fields.featured || false,
    services: r.fields.services || '',
    hours: r.fields.hours || '',
    source: r.fields.source || ''
  }));

  const output = {
    success: true,
    businesses,
    count: businesses.length,
    exported_at: new Date().toISOString()
  };

  const outPath = path.join(__dirname, '..', 'public', 'businesses.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`Exported ${businesses.length} businesses to public/businesses.json`);
}

exportBusinesses().catch(console.error);
