const AIRTABLE_BASE_ID = 'appqDOo8GXTDuKYCw';

const CATEGORY_SLUGS = {
  'Med Spas': 'med-spas',
  'Private Chefs': 'private-chefs',
  'Interior Designers': 'interior-designers'
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
