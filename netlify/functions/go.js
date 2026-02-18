const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE_NAME = 'Businesses';

exports.handler = async (event) => {
  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: 'Missing id' };
  }

  try {
    // Fetch business
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    if (!res.ok) {
      return { statusCode: 404, body: 'Business not found' };
    }

    const biz = await res.json();
    const f = biz.fields;

    // Increment click count
    fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          click_count: (f.click_count || 0) + 1,
          last_clicked_at: new Date().toISOString().split('T')[0]
        }
      })
    }).catch(() => {});

    // Fetch related businesses (same category, different id)
    const relatedUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=AND({category}="${f.category}",RECORD_ID()!="${id}")&maxRecords=5`;
    const relatedRes = await fetch(relatedUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    const relatedData = relatedRes.ok ? await relatedRes.json() : { records: [] };
    const related = relatedData.records || [];

    const relatedHtml = related.map(r => `
      <a href="/go/${r.id}" style="display:block;padding:16px 0;border-bottom:1px solid #E0E0E0;text-decoration:none;color:#333;">
        <div style="font-family:'Playfair Display',serif;font-size:1rem;color:#1A1A1A;">${r.fields.name}</div>
        <div style="font-size:0.8rem;color:#777;">${r.fields.neighborhood || 'New York'} ${r.fields.rating ? '— ' + r.fields.rating + ' stars' : ''}</div>
      </a>
    `).join('');

    // JSON-LD
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": f.name,
      "description": f.description || '',
      "address": {
        "@type": "PostalAddress",
        "streetAddress": f.address || '',
        "addressLocality": "New York",
        "addressRegion": "NY"
      },
      "telephone": f.phone || '',
      "url": f.website || '',
      "aggregateRating": f.rating ? {
        "@type": "AggregateRating",
        "ratingValue": f.rating,
        "reviewCount": f.review_count || 1
      } : undefined
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${f.name} | Velora</title>
  <meta name="description" content="${(f.description || f.name + ' in New York').substring(0, 160)}">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; color:#333; background:#fff; line-height:1.6; }
    .nav { background:#fff; border-bottom:1px solid #E0E0E0; padding:0 24px; }
    .nav-inner { max-width:1100px; margin:0 auto; display:flex; align-items:center; height:64px; }
    .logo { font-family:'Playfair Display',serif; font-size:1.4rem; font-weight:500; letter-spacing:3px; color:#1A1A1A; text-decoration:none; }
    .wrap { max-width:800px; margin:0 auto; padding:40px 24px; }
    .back { display:inline-block; margin-bottom:24px; font-size:0.85rem; color:#777; text-decoration:none; }
    .back:hover { color:#1A1A1A; }
    .cat { font-size:0.7rem; font-weight:500; letter-spacing:2px; text-transform:uppercase; color:#C8A96A; margin-bottom:12px; }
    h1 { font-family:'Playfair Display',serif; font-size:2rem; font-weight:400; color:#1A1A1A; margin-bottom:8px; }
    .hood { font-size:0.9rem; color:#777; margin-bottom:24px; }
    .img { width:100%; max-height:400px; object-fit:cover; border-radius:4px; margin-bottom:32px; }
    .meta { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:32px; padding:20px; background:#F5F5F5; border-radius:4px; font-size:0.85rem; color:#555; }
    .meta a { color:#C8A96A; text-decoration:none; }
    .meta a:hover { text-decoration:underline; }
    .desc { font-size:0.95rem; color:#555; line-height:1.8; margin-bottom:40px; }
    .cta { display:inline-block; padding:14px 32px; background:#1A1A1A; color:#fff; text-decoration:none; font-size:0.85rem; font-weight:500; letter-spacing:1px; border-radius:4px; transition:background 0.2s; }
    .cta:hover { background:#2F3A4A; }
    .related { margin-top:60px; }
    .related h2 { font-family:'Playfair Display',serif; font-size:1.3rem; font-weight:400; color:#1A1A1A; margin-bottom:20px; }
    .footer { margin-top:80px; padding:24px; border-top:1px solid #E0E0E0; text-align:center; font-size:0.75rem; color:#999; letter-spacing:0.5px; }
  </style>
</head>
<body>
  <nav class="nav"><div class="nav-inner"><a href="/" class="logo">VELORA</a></div></nav>
  <div class="wrap">
    <a href="/" class="back">Back to directory</a>
    <div class="cat">${f.category || ''}</div>
    <h1>${f.name}</h1>
    <p class="hood">${f.neighborhood || 'New York'}${f.rating ? ' — ' + f.rating + ' stars' : ''}${f.price_range ? ' — ' + f.price_range : ''}</p>
    ${f.image_url ? `<img class="img" src="${f.image_url}" alt="${f.name}">` : ''}
    <div class="meta">
      ${f.address ? `<span>${f.address}</span>` : ''}
      ${f.phone ? `<span>${f.phone}</span>` : ''}
      ${f.website ? `<a href="${f.website}" target="_blank" rel="noopener">Website</a>` : ''}
      ${f.instagram ? `<a href="${f.instagram}" target="_blank" rel="noopener">Instagram</a>` : ''}
    </div>
    ${f.description ? `<div class="desc">${f.description.replace(/\n/g, '<br>')}</div>` : ''}
    ${f.website ? `<a class="cta" href="${f.website}" target="_blank" rel="noopener">Visit Website</a>` : ''}
    ${related.length > 0 ? `<div class="related"><h2>Similar in ${f.category}</h2>${relatedHtml}</div>` : ''}
  </div>
  <div class="footer">VELORA — New York City</div>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html
    };
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
};
