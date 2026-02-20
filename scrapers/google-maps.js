require('dotenv').config();
const { slugify, sleep, pushToAirtable, launchBrowser } = require('./utils');

const SEARCHES = [
  { query: 'med spas upper east side new york', category: 'Med Spas' },
  { query: 'luxury med spa manhattan', category: 'Med Spas' },
  { query: 'best facial spa nyc', category: 'Med Spas' },
  { query: 'aesthetic clinic new york', category: 'Med Spas' },
  { query: 'private chef new york city', category: 'Private Chefs' },
  { query: 'personal chef service manhattan', category: 'Private Chefs' },
  { query: 'private dining chef nyc', category: 'Private Chefs' },
  { query: 'luxury interior designer new york', category: 'Interior Designers' },
  { query: 'high end interior design firm manhattan', category: 'Interior Designers' },
  { query: 'residential interior designer nyc', category: 'Interior Designers' }
];

async function scrapeGoogleMaps(context, query, category) {
  const results = [];
  const page = await context.newPage();

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    console.log(`  Searching: ${query}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    // Scroll the results panel to load more
    const feed = await page.$('div[role="feed"]');
    if (feed) {
      for (let i = 0; i < 3; i++) {
        await feed.evaluate(el => el.scrollBy(0, 1000));
        await sleep(1500);
      }
    }

    // Extract business data from the results list
    const businesses = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('div[role="feed"] > div > div > a[href*="/maps/place/"]');

      cards.forEach(card => {
        try {
          const parent = card.closest('div[role="feed"] > div');
          if (!parent) return;

          const name = card.getAttribute('aria-label') || '';
          const href = card.getAttribute('href') || '';

          // Rating
          const ratingEl = parent.querySelector('span[role="img"]');
          const ratingLabel = ratingEl ? ratingEl.getAttribute('aria-label') || '' : '';
          const ratingMatch = ratingLabel.match(/([\d.]+)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

          // Review count
          const reviewMatch = ratingLabel.match(/(\d[\d,]*)\s*review/i);
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(',', '')) : null;

          // Price level
          const priceEl = parent.querySelector('span:has(> span)');
          let priceRange = null;
          if (priceEl) {
            const priceText = priceEl.textContent;
            const priceMatch = priceText.match(/(\${1,4})/);
            if (priceMatch) priceRange = priceMatch[1];
          }

          // Address and category from the text below
          const textEls = parent.querySelectorAll('div[class] > div > div');
          let address = '';
          let bizType = '';
          textEls.forEach(el => {
            const text = el.textContent.trim();
            if (text.match(/\d+\s+\w+\s+(st|ave|blvd|rd|dr|ln|way|pl)/i)) {
              address = text;
            }
            if (text.match(/(spa|chef|design|salon|clinic|restaurant|studio)/i) && !bizType) {
              bizType = text;
            }
          });

          // Image
          const imgEl = parent.querySelector('img[src*="googleusercontent"], img[src*="lh5"]');
          const imageUrl = imgEl ? imgEl.getAttribute('src') : '';

          if (name && !items.find(i => i.name === name)) {
            items.push({ name, href, rating, reviewCount, priceRange, address, imageUrl, bizType });
          }
        } catch (e) {}
      });

      return items;
    });

    console.log(`  Found ${businesses.length} businesses`);

    // Visit each business for more details
    for (const biz of businesses.slice(0, 8)) {
      try {
        if (!biz.href) continue;
        const detailPage = await context.newPage();
        await detailPage.goto(biz.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        const details = await detailPage.evaluate(() => {
          // Phone
          const phoneEl = document.querySelector('button[data-item-id*="phone"] div.fontBodyMedium');
          const phone = phoneEl ? phoneEl.textContent.trim() : '';

          // Website
          const webEl = document.querySelector('a[data-item-id="authority"]');
          const website = webEl ? webEl.getAttribute('href') : '';

          // Address
          const addrEl = document.querySelector('button[data-item-id="address"] div.fontBodyMedium');
          const address = addrEl ? addrEl.textContent.trim() : '';

          // Neighborhood from address
          let neighborhood = '';
          const addrParts = address.split(',');
          if (addrParts.length >= 2) {
            neighborhood = addrParts[addrParts.length - 2].trim();
          }

          // Description / About
          const descEl = document.querySelector('div[class*="section-editorial"] span, div.PYvSYb span');
          const description = descEl ? descEl.textContent.trim() : '';

          // Main photo
          const photoEl = document.querySelector('button[jsaction*="heroHeaderImage"] img');
          const photo = photoEl ? photoEl.getAttribute('src') : '';

          return { phone, website, address, neighborhood, description, photo };
        });

        const neighborhood = details.neighborhood || extractNeighborhood(details.address || biz.address);

        results.push({
          name: biz.name,
          slug: slugify(biz.name),
          category,
          city: 'New York',
          neighborhood,
          address: details.address || biz.address,
          phone: details.phone,
          website: details.website,
          description: details.description,
          image_url: details.photo || biz.imageUrl,
          rating: biz.rating,
          review_count: biz.reviewCount,
          price_range: biz.priceRange,
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

async function run() {
  console.log('=== Velora: Google Maps Scraper ===\n');
  const { browser, context } = await launchBrowser();
  const allResults = [];

  for (const search of SEARCHES) {
    const results = await scrapeGoogleMaps(context, search.query, search.category);
    allResults.push(...results);
    await sleep(3000);
  }

  await browser.close();

  // Deduplicate by slug
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
