document.addEventListener('DOMContentLoaded', async () => {
  const path = window.location.pathname;

  // Detect category page: /new-york/med-spas
  const categoryMatch = path.match(/^\/new-york\/([\w-]+)\/?$/);

  if (categoryMatch) {
    const slug = categoryMatch[1];
    const category = SLUG_TO_CATEGORY[slug];
    if (category) {
      await loadCategoryPage(category);
    }
    return;
  }

  // Home page
  await loadHomePage();
});

async function fetchBusinesses(filterFormula) {
  const params = new URLSearchParams();
  if (filterFormula) params.set('filterByFormula', filterFormula);
  params.set('maxRecords', '100');

  const res = await fetch(`/api/businesses?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
}

async function loadHomePage() {
  // Load featured businesses
  const featured = await fetchBusinesses('{featured} = TRUE()');
  const featuredGrid = document.getElementById('featured-grid');

  if (featured.length > 0) {
    featured.forEach(biz => featuredGrid.appendChild(createBusinessCard(biz)));
  } else {
    // If no featured, show latest
    const all = await fetchBusinesses('');
    if (all.length > 0) {
      all.slice(0, 6).forEach(biz => featuredGrid.appendChild(createBusinessCard(biz)));
    } else {
      featuredGrid.innerHTML = '<div class="empty-state">Listings coming soon.</div>';
    }
  }

  // Update category counts
  for (const [category, slug] of Object.entries(CATEGORY_SLUGS)) {
    const records = await fetchBusinesses(`{category} = "${category}"`);
    const el = document.querySelector(`[data-cat="${category}"]`);
    if (el) el.textContent = `${records.length} listing${records.length !== 1 ? 's' : ''}`;
  }

  // Search
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  searchBtn.addEventListener('click', () => doSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch(searchInput.value);
  });
}

async function doSearch(query) {
  if (!query.trim()) return;
  const formula = `SEARCH(LOWER("${query.trim()}"), LOWER({name}))`;
  const results = await fetchBusinesses(formula);

  // Show listings section, hide featured
  document.getElementById('featured').classList.add('hidden');
  document.getElementById('listings').classList.remove('hidden');
  document.getElementById('listings-title').textContent = `Results for "${query}"`;

  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '';

  if (results.length > 0) {
    results.forEach(biz => grid.appendChild(createBusinessCard(biz)));
  } else {
    grid.innerHTML = '<div class="empty-state">No businesses found.</div>';
  }
}

async function loadCategoryPage(category) {
  document.title = `${category} in New York | Velora`;

  // Hide home sections, show listings
  document.querySelector('.hero').classList.add('hidden');
  document.querySelector('.categories').classList.add('hidden');
  document.getElementById('featured').classList.add('hidden');
  document.querySelector('.about').classList.add('hidden');
  document.getElementById('listings').classList.remove('hidden');
  document.getElementById('listings').style.paddingTop = '100px';
  document.getElementById('listings-title').textContent = `${category} in New York`;

  const records = await fetchBusinesses(`{category} = "${category}"`);
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '';

  if (records.length > 0) {
    sortBusinesses(records, 'rating');
    records.forEach(biz => grid.appendChild(createBusinessCard(biz)));
  } else {
    grid.innerHTML = '<div class="empty-state">Listings coming soon.</div>';
  }

  // Sort handler
  document.getElementById('sort-select').addEventListener('change', (e) => {
    sortBusinesses(records, e.target.value);
    grid.innerHTML = '';
    records.forEach(biz => grid.appendChild(createBusinessCard(biz)));
  });
}

function sortBusinesses(records, by) {
  records.sort((a, b) => {
    if (by === 'rating') return (b.fields.rating || 0) - (a.fields.rating || 0);
    if (by === 'reviews') return (b.fields.review_count || 0) - (a.fields.review_count || 0);
    if (by === 'name') return (a.fields.name || '').localeCompare(b.fields.name || '');
    return 0;
  });
}
