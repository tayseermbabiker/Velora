const AIRTABLE_BASE_ID = 'appqDOo8GXTDuKYCw';

const CATEGORY_SLUGS = {
  'Med Spas': 'med-spas',
  'Private Chefs': 'private-chefs',
  'Interior Designers': 'interior-designers',
  'Concierge Medicine': 'concierge-medicine',
  'Luxury Relocation': 'luxury-relocation',
  'Fine Art Advisory': 'fine-art-advisory'
};

const CATEGORY_SEO = {
  'Med Spas': {
    title: 'Best Med Spas in NYC | Luxury Medical Aesthetic Directory | Velora',
    description: 'Find the top-rated med spas in New York City. Browse our curated list of luxury Botox, filler, laser, and facial professionals serving Manhattan, Brooklyn, and beyond.',
    h1: 'Best Med Spas in New York City'
  },
  'Private Chefs': {
    title: 'Hire a Private Chef in NYC | Top Personal Chefs & Catering | Velora',
    description: 'Browse top-rated private chefs in New York City for dinner parties, meal prep, and luxury in-home dining. Find Michelin-level personal chefs serving Manhattan and beyond.',
    h1: 'Private Chefs in New York City'
  },
  'Interior Designers': {
    title: 'Luxury Interior Designers NYC | High-End Residential Design | Velora',
    description: 'Discover the best luxury interior designers in New York City. Browse curated listings for high-end residential design firms serving Manhattan, Brooklyn, and beyond.',
    h1: 'Luxury Interior Designers in New York City'
  },
  'Concierge Medicine': {
    title: 'Concierge Doctors NYC | Private Physicians & Wellness | Velora',
    description: 'Find top concierge doctors and private physicians in New York City. Browse curated listings for 24/7 private medical care, IV therapy, and luxury wellness services.',
    h1: 'Concierge Medicine & Private Wellness in NYC'
  },
  'Luxury Relocation': {
    title: 'White-Glove Movers NYC | Luxury Relocation & Home Organizing | Velora',
    description: 'Find the best white-glove moving companies and luxury home organizers in New York City. Fine art movers, turnkey relocation, and estate organizing services.',
    h1: 'Luxury Relocation & Home Organizing in NYC'
  },
  'Fine Art Advisory': {
    title: 'Art Advisors NYC | Fine Art Consultants & Appraisers | Velora',
    description: 'Discover top art advisors and fine art consultants in New York City. Private art buying, collection management, and appraisal services for discerning collectors.',
    h1: 'Fine Art Advisors & Consultants in NYC'
  }
};

const SLUG_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([k, v]) => [v, k])
);

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function createBusinessCard(biz) {
  const slug = biz.fields.slug || slugify(biz.fields.name);
  const card = document.createElement('a');
  card.className = 'business-card';
  card.href = `/go/${biz.id}`;

  const imgSrc = biz.fields.image_url || '';
  const imgHtml = imgSrc
    ? `<img class="business-card-img" src="${imgSrc}" alt="${biz.fields.name}" loading="lazy">`
    : `<div class="business-card-img business-card-img-placeholder"><span>${(biz.fields.name || '')[0] || ''}</span></div>`;

  const featuredBadge = biz.fields.featured
    ? `<span class="business-card-badge">Editor's Pick</span>`
    : '';

  card.innerHTML = `
    ${imgHtml}
    <div class="business-card-body">
      ${featuredBadge}
      <div class="business-card-category">${biz.fields.category || ''}</div>
      <div class="business-card-name">${biz.fields.name || ''}</div>
      <div class="business-card-neighborhood">${biz.fields.neighborhood || 'New York'}</div>
      <div class="business-card-meta">
        <span class="business-card-price">${biz.fields.price_range || ''}</span>
        ${biz.fields.website ? '<span class="business-card-link">View details</span>' : ''}
      </div>
    </div>
  `;
  return card;
}
