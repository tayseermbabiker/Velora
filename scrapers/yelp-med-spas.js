const { slugify, sleep, pushToAirtable, launchBrowser } = require('./utils');

const CATEGORY = 'Med Spas';
const SEARCH_URL = 'https://www.yelp.com/search?find_desc=med+spa&find_loc=New+York%2C+NY';
const MAX_PAGES = 3;

async function scrape() {
  console.log(`\n--- Scraping Yelp: ${CATEGORY} ---`);
  const { browser, context } = await launchBrowser();
  const businesses = [];

  try {
    const page = await context.newPage();

    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      const url = pageNum === 0 ? SEARCH_URL : `${SEARCH_URL}&start=${pageNum * 10}`;
      console.log(`Page ${pageNum + 1}: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);

      // Extract business cards from search results
      const cards = await page.evaluate(() => {
        const results = [];
        // Yelp search result containers
        const items = document.querySelectorAll('[data-testid="serp-ia-card"]');

        items.forEach(item => {
          try {
            const nameEl = item.querySelector('a[href*="/biz/"] h3, a[href*="/biz/"] span');
            const linkEl = item.querySelector('a[href*="/biz/"]');
            const ratingEl = item.querySelector('[aria-label*="star rating"]');
            const reviewEl = item.querySelector('span[class*="css-"] a[href*="#reviews"]');
            const priceEl = item.querySelector('span.priceRange');
            const hoodEl = item.querySelector('span[class*="css-"]:not([aria-label])');
            const imgEl = item.querySelector('img[src*="bphoto"], img[loading]');

            if (!nameEl || !linkEl) return;

            const name = nameEl.textContent.replace(/^\d+\.\s*/, '').trim();
            const href = linkEl.getAttribute('href');
            const slug = href ? href.split('/biz/')[1]?.split('?')[0] : null;

            let rating = null;
            if (ratingEl) {
              const label = ratingEl.getAttribute('aria-label') || '';
              const match = label.match(/([\d.]+)/);
              if (match) rating = parseFloat(match[1]);
            }

            let reviewCount = null;
            if (reviewEl) {
              const match = reviewEl.textContent.match(/(\d+)/);
              if (match) reviewCount = parseInt(match[1]);
            }

            let priceRange = null;
            if (priceEl) priceRange = priceEl.textContent.trim();

            const neighborhood = hoodEl ? hoodEl.textContent.trim() : '';
            const imageUrl = imgEl ? imgEl.getAttribute('src') : '';

            if (name && slug) {
              results.push({ name, slug, rating, reviewCount, priceRange, neighborhood, imageUrl, href });
            }
          } catch (e) {}
        });

        return results;
      });

      console.log(`  Found ${cards.length} results`);

      // Visit each business detail page for more info
      for (const card of cards) {
        try {
          const detailUrl = `https://www.yelp.com${card.href}`;
          const detailPage = await context.newPage();
          await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await sleep(2000);

          const details = await detailPage.evaluate(() => {
            const address = document.querySelector('address p, [class*="map"] p')?.textContent?.trim() || '';
            const phone = document.querySelector('p[class*="css-"] a[href^="tel:"]')?.textContent?.trim() || '';
            const website = document.querySelector('a[href*="biz_redir"][class*="css-"]')?.getAttribute('href') || '';
            const descEl = document.querySelector('[class*="fromTheBusiness"] p, [class*="description"] p');
            const description = descEl ? descEl.textContent.trim() : '';

            return { address, phone, website, description };
          });

          businesses.push({
            name: card.name,
            slug: card.slug,
            category: 'Med Spas',
            city: 'New York',
            neighborhood: card.neighborhood,
            address: details.address,
            phone: details.phone,
            website: details.website,
            description: details.description,
            image_url: card.imageUrl,
            rating: card.rating,
            review_count: card.reviewCount,
            price_range: card.priceRange,
            source: 'Yelp'
          });

          console.log(`  + ${card.name} (${card.rating || 'N/A'} stars)`);
          await detailPage.close();
          await sleep(1500);
        } catch (err) {
          console.log(`  ! Error on ${card.name}: ${err.message}`);
        }
      }

      if (pageNum < MAX_PAGES - 1) await sleep(2000);
    }
  } catch (err) {
    console.error('Scraper error:', err.message);
  } finally {
    await browser.close();
  }

  console.log(`\nTotal scraped: ${businesses.length}`);
  await pushToAirtable(businesses);
}

scrape().catch(console.error);
