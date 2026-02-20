require('dotenv').config();
const fetch = require('node-fetch');
const { launchBrowser, sleep } = require('./utils');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE = 'Businesses';

async function run() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}?filterByFormula=OR({image_url}="",{image_url}=BLANK())`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
  });
  const data = await res.json();
  const records = data.records || [];

  if (!records.length) {
    console.log('All businesses have images.');
    return;
  }

  console.log(`${records.length} businesses missing images\n`);
  const { browser, context } = await launchBrowser();

  for (const rec of records) {
    const website = rec.fields.website;
    if (!website) continue;

    console.log(`${rec.fields.name}: loading ${website}`);
    try {
      const page = await context.newPage();
      await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);

      // Try multiple image strategies
      const imageUrl = await page.evaluate(() => {
        // 1. og:image meta
        const og = document.querySelector('meta[property="og:image"]');
        if (og && og.content) return og.content;

        // 2. First large hero/banner image
        const imgs = Array.from(document.querySelectorAll('img'));
        for (const img of imgs) {
          const src = img.src || img.getAttribute('data-src') || '';
          if (!src || src.includes('logo') || src.includes('icon') || src.includes('svg')) continue;
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w >= 300 || h >= 200) return src;
        }

        // 3. CSS background image on hero section
        const hero = document.querySelector('[class*="hero"], [class*="banner"], [class*="header"] img, main img');
        if (hero) {
          const bg = getComputedStyle(hero).backgroundImage;
          const match = bg && bg.match(/url\(["']?(.+?)["']?\)/);
          if (match) return match[1];
          if (hero.tagName === 'IMG' && hero.src) return hero.src;
        }

        return null;
      });

      if (imageUrl) {
        let finalUrl = imageUrl;
        if (finalUrl.startsWith('//')) finalUrl = 'https:' + finalUrl;

        console.log(`  -> ${finalUrl.substring(0, 80)}...`);

        const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}/${rec.id}`;
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields: { image_url: finalUrl } })
        });
      } else {
        console.log(`  -> no image found`);
      }

      await page.close();
    } catch (e) {
      console.log(`  ! Error: ${e.message}`);
    }

    await sleep(1000);
  }

  await browser.close();
  console.log('\nDone.');
}

run().catch(console.error);
