let allBusinesses = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Load all businesses from static JSON (one request, zero API calls)
  try {
    const res = await fetch('businesses.json');
    if (!res.ok) throw new Error('Failed to load data');
    const data = await res.json();
    if (data.success && data.businesses) {
      allBusinesses = data.businesses;
    }
  } catch (e) {
    console.error('Failed to load businesses:', e);
  }

  const path = window.location.pathname;
  const categoryMatch = path.match(/^\/new-york\/([\w-]+)\/?$/);

  if (categoryMatch) {
    const slug = categoryMatch[1];
    const category = SLUG_TO_CATEGORY[slug];
    if (category) loadCategoryPage(category);
    return;
  }

  loadHomePage();
});

function filterBusinesses(predicate) {
  return allBusinesses.filter(predicate).map(b => ({
    id: b.id,
    fields: b
  }));
}

function loadHomePage() {
  // Featured businesses
  let featured = filterBusinesses(b => b.featured);
  const featuredGrid = document.getElementById('featured-grid');

  if (featured.length > 0) {
    featured.forEach(biz => featuredGrid.appendChild(createBusinessCard(biz)));
  } else {
    // If no featured, show latest 6
    const all = filterBusinesses(() => true);
    if (all.length > 0) {
      all.slice(0, 6).forEach(biz => featuredGrid.appendChild(createBusinessCard(biz)));
    } else {
      featuredGrid.innerHTML = '<div class="empty-state">Listings coming soon.</div>';
    }
  }

  // Category counts (instant, no API calls)
  for (const [category, slug] of Object.entries(CATEGORY_SLUGS)) {
    const count = allBusinesses.filter(b => b.category === category).length;
    const el = document.querySelector(`[data-cat="${category}"]`);
    if (el) el.textContent = `${count} listing${count !== 1 ? 's' : ''}`;
  }

  // Search
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  searchBtn.addEventListener('click', () => doSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch(searchInput.value);
  });
}

function doSearch(query) {
  if (!query.trim()) return;
  const q = query.trim().toLowerCase();
  const results = filterBusinesses(b =>
    (b.name || '').toLowerCase().includes(q) ||
    (b.category || '').toLowerCase().includes(q) ||
    (b.neighborhood || '').toLowerCase().includes(q) ||
    (b.services || '').toLowerCase().includes(q)
  );

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

function loadCategoryPage(category) {
  const seo = CATEGORY_SEO[category] || {};
  document.title = seo.title || `${category} in New York | Velora`;

  // Update meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && seo.description) metaDesc.setAttribute('content', seo.description);

  // Update canonical
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', `https://velorra.netlify.app/new-york/${CATEGORY_SLUGS[category]}`);

  document.querySelector('.hero').classList.add('hidden');
  document.querySelector('.categories').classList.add('hidden');
  document.getElementById('featured').classList.add('hidden');
  document.querySelector('.about').classList.add('hidden');
  document.getElementById('listings').classList.remove('hidden');
  document.getElementById('listings').style.paddingTop = '100px';
  document.getElementById('listings-title').textContent = seo.h1 || `${category} in New York`;

  const records = filterBusinesses(b => b.category === category);
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '';

  if (records.length > 0) {
    sortBusinesses(records, 'rating');
    records.forEach(biz => grid.appendChild(createBusinessCard(biz)));
  } else {
    grid.innerHTML = '<div class="empty-state">Listings coming soon.</div>';
  }

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
