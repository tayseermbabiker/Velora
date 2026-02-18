const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appqDOo8GXTDuKYCw';
const TABLE_NAME = 'Businesses';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const params = new URLSearchParams();
    const qs = event.queryStringParameters || {};

    if (qs.filterByFormula) params.set('filterByFormula', qs.filterByFormula);
    if (qs.maxRecords) params.set('maxRecords', qs.maxRecords);
    if (qs.sort) params.set('sort[0][field]', qs.sort);
    if (qs.direction) params.set('sort[0][direction]', qs.direction);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: res.status, headers, body: errText };
    }

    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
