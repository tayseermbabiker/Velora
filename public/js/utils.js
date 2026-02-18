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

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function createBusinessCard(biz) {
  const slug = biz.fields.slug || slugify(biz.fields.name);
  const card = document.createElement('a');
  card.className = 'business-card';
  card.href = `/go/${biz.id}`;

  const imgSrc = biz.fields.image_url || '';
  const imgHtml = imgSrc
    ? `<img class="business-card-img" src="${imgSrc}" alt="${biz.fields.name}" loading="lazy">`
    : `<div class="business-card-img"></div>`;

  card.innerHTML = `
    ${imgHtml}
    <div class="business-card-body">
      <div class="business-card-category">${biz.fields.category || ''}</div>
      <div class="business-card-name">${biz.fields.name || ''}</div>
      <div class="business-card-neighborhood">${biz.fields.neighborhood || 'New York'}</div>
      <div class="business-card-meta">
        <span class="business-card-rating">${biz.fields.rating ? renderStars(biz.fields.rating) + ' ' + biz.fields.rating : ''}</span>
        <span class="business-card-price">${biz.fields.price_range || ''}</span>
      </div>
    </div>
  `;
  return card;
}
