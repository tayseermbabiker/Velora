const { execSync } = require('child_process');
const path = require('path');

const scrapers = [
  'yelp-med-spas.js',
  'yelp-private-chefs.js',
  'yelp-interior-designers.js'
];

async function runAll() {
  console.log('=== VELORA: Running all scrapers ===\n');

  for (const scraper of scrapers) {
    const file = path.join(__dirname, scraper);
    console.log(`\n>>> Running ${scraper}...`);
    try {
      execSync(`node "${file}"`, { stdio: 'inherit', timeout: 300000 });
    } catch (err) {
      console.error(`!!! ${scraper} failed: ${err.message}`);
    }
  }

  console.log('\n=== All scrapers complete ===');
}

runAll();
