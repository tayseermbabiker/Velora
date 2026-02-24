require('dotenv').config();
const { slugify, sleep, pushToAirtable, launchBrowser } = require('./utils');

const SEARCHES = [
  // Luxury Pet Services
  { query: 'luxury pet spa upper east side manhattan', category: 'Luxury Pet Services' },
  { query: 'luxury dog groomer manhattan nyc', category: 'Luxury Pet Services' },
  { query: 'veterinary concierge upper east side nyc', category: 'Luxury Pet Services' },
  { query: 'luxury pet hotel tribeca soho manhattan', category: 'Luxury Pet Services' },
  { query: 'premium dog daycare manhattan nyc', category: 'Luxury Pet Services' },
  { query: 'holistic veterinarian manhattan nyc', category: 'Luxury Pet Services' },
  // Event Planners
  { query: 'luxury event planner manhattan nyc', category: 'Event Planners' },
  { query: 'wedding planner upper east side manhattan', category: 'Event Planners' },
  { query: 'high end party planner nyc', category: 'Event Planners' },
  { query: 'corporate event planner midtown manhattan', category: 'Event Planners' },
  { query: 'luxury wedding designer manhattan', category: 'Event Planners' },
  { query: 'private event coordinator tribeca soho nyc', category: 'Event Planners' }
];

function extractNeighborhood(address) {
  if (!address) return '';
  const nyHoods = ['Upper East Side', 'Upper West Side', 'Tribeca', 'SoHo', 'Chelsea',
    'Midtown', 'Flatiron', 'Greenwich Village', 'West Village', 'East Village',
    'Lower East Side', 'Williamsburg', 'DUMBO', 'Park Slope', 'Brooklyn Heights',
    'NoHo', 'Nolita', 'Financial District', 'Murray Hill', 'Gramercy'];
  for (const hood of nyHoods) {
    if (address.toLowerCase().includes(hood.toLowerCase())) return hood;
  }
  if (address.includes('New York') || address.includes('Manhattan')) return 'Manhattan';
  if (address.includes('Brooklyn')) return 'Brooklyn';
  return '';
}

async function scrapeGoogleMaps(context, query, category) {
  const results = [];
  const page = await context.newPage();

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    console.log(`  Searching: ${query}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    const feed = await page.$('div[role="feed"]');
    if (feed) {
      for (let i = 0; i < 3; i++) {
        await feed.evaluate(el => el.scrollBy(0, 1000));
        await sleep(1500);
      }
    }

    const businesses = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('div[role="feed"] > div > div > a[href*="/maps/place/"]');
      cards.forEach(card => {
        try {
          const parent = card.closest('div[role="feed"] > div');
          if (!parent) return;
          const name = card.getAttribute('aria-label') || '';
          const href = card.getAttribute('href') || '';
          const ratingEl = parent.querySelector('span[role="img"]');
          const ratingLabel = ratingEl ? ratingEl.getAttribute('aria-label') || '' : '';
          const ratingMatch = ratingLabel.match(/([\d.]+)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
          const reviewMatch = ratingLabel.match(/(\d[\d,]*)\s*review/i);
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(',', '')) : null;
          const imgEl = parent.querySelector('img[src*="googleusercontent"], img[src*="lh5"]');
          const imageUrl = imgEl ? imgEl.getAttribute('src') : '';
          if (name && !items.find(i => i.name === name)) {
            items.push({ name, href, rating, reviewCount, imageUrl });
          }
        } catch (e) {}
      });
      return items;
    });

    console.log(`  Found ${businesses.length} businesses`);

    for (const biz of businesses.slice(0, 8)) {
      try {
        if (!biz.href) continue;
        const detailPage = await context.newPage();
        await detailPage.goto(biz.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        const details = await detailPage.evaluate(() => {
          const phoneEl = document.querySelector('button[data-item-id*="phone"] div.fontBodyMedium');
          const phone = phoneEl ? phoneEl.textContent.trim() : '';
          const webEl = document.querySelector('a[data-item-id="authority"]');
          const website = webEl ? webEl.getAttribute('href') : '';
          const addrEl = document.querySelector('button[data-item-id="address"] div.fontBodyMedium');
          const address = addrEl ? addrEl.textContent.trim() : '';
          let neighborhood = '';
          const addrParts = address.split(',');
          if (addrParts.length >= 2) neighborhood = addrParts[addrParts.length - 2].trim();
          const descEl = document.querySelector('div[class*="section-editorial"] span, div.PYvSYb span');
          const description = descEl ? descEl.textContent.trim() : '';
          const photoEl = document.querySelector('button[jsaction*="heroHeaderImage"] img');
          const photo = photoEl ? photoEl.getAttribute('src') : '';
          return { phone, website, address, neighborhood, description, photo };
        });

        results.push({
          name: biz.name,
          slug: slugify(biz.name),
          category,
          city: 'New York',
          neighborhood: details.neighborhood || extractNeighborhood(details.address),
          address: details.address,
          phone: details.phone,
          website: details.website,
          description: details.description,
          image_url: details.photo || biz.imageUrl,
          rating: biz.rating,
          review_count: biz.reviewCount,
          source: 'Google Maps'
        });

        console.log(`    + ${biz.name} (${biz.rating || 'N/A'})`);
        await detailPage.close();
        await sleep(2000);
      } catch (e) {
        console.log(`    ! ${biz.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  ! Search error: ${e.message}`);
  }

  await page.close();
  return results;
}

async function run() {
  console.log('=== Velora: Luxury Pet Services & Event Planners Scraper ===\n');
  const { browser, context } = await launchBrowser();
  const allResults = [];

  for (const search of SEARCHES) {
    const results = await scrapeGoogleMaps(context, search.query, search.category);
    allResults.push(...results);
    await sleep(3000);
  }

  await browser.close();

  const seen = new Set();
  const unique = allResults.filter(b => {
    if (seen.has(b.slug)) return false;
    seen.add(b.slug);
    return true;
  });

  console.log(`\nTotal unique: ${unique.length}`);
  await pushToAirtable(unique);
}

run().catch(console.error);
