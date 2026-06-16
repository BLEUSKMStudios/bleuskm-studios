const tableCache = new Map();
const inFlight = new Map();
let airtableQueue = Promise.resolve();
let lastAirtableRequestAt = 0;

const CACHE_MS = 5 * 60 * 1000;
const MIN_AIRTABLE_GAP_MS = 260;

function cacheKey(base, table) {
  return `${base}:${String(table || '').toLowerCase()}`;
}

function text(value) {
  return String(value || '').trim();
}

function baseForTable(table, fallbackBase) {
  const tableName = String(table || '').toLowerCase();
  const castingBase = text(process.env.AIRTABLE_CASTING_BASE) || fallbackBase;
  const productionBase = text(process.env.AIRTABLE_PRODUCTION_BASE) || fallbackBase;

  if (tableName === 'casting submissions') return castingBase;

  if ([
    'crew applications',
    'contracts',
    'production timeline',
    'portal notes',
    'locations',
    'call sheets',
    'tasks'
  ].includes(tableName)) {
    return productionBase;
  }

  return fallbackBase;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queuedAirtableFetch(url, token, options = {}) {
  const run = airtableQueue.then(async () => {
    const sinceLast = Date.now() - lastAirtableRequestAt;
    if (sinceLast < MIN_AIRTABLE_GAP_MS) await sleep(MIN_AIRTABLE_GAP_MS - sinceLast);
    lastAirtableRequestAt = Date.now();
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  });
  airtableQueue = run.catch(() => {});
  return run;
}

async function airtableJson(url, token, options = {}) {
  const delays = [0, 1200, 2500, 4200];
  let lastStatus = 500;
  let lastData = { error: 'Airtable request failed' };

  for (const delay of delays) {
    if (delay) await sleep(delay);
    const res = await queuedAirtableFetch(url, token, options);
    lastStatus = res.status;
    lastData = await res.json().catch(() => ({ error: res.statusText || 'Airtable request failed' }));
    if (res.status !== 429 && res.status < 500) return { status: res.status, data: lastData };
  }

  return { status: lastStatus, data: lastData };
}

async function getTable(base, token, table) {
  const key = cacheKey(base, table);
  const cached = tableCache.get(key);

  if (cached && Date.now() - cached.savedAt < CACHE_MS) {
    return { status: 200, data: { ...cached.data, cached: true } };
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    let records = [];
    let offset = '';
    let result = { status: 200, data: {} };

    do {
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
      result = await airtableJson(url, token);
      if (result.status !== 200) break;
      records = records.concat(result.data.records || []);
      offset = result.data.offset || '';
    } while (offset);

    if (result.status === 200) {
      const data = { records };
      tableCache.set(key, { savedAt: Date.now(), data });
      return { status: 200, data };
    }

    if (cached?.data?.records) {
      return {
        status: 200,
        data: {
          ...cached.data,
          cached: true,
          airtableStatus: result.status,
          airtableError: result.data?.error || result.data
        }
      };
    }

    return result;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, job);
  return job;
}

function clearTableCache(base, table) {
  tableCache.delete(cacheKey(base, table));
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const defaultBase = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;

  if (!defaultBase || !token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing AIRTABLE_BASE or AIRTABLE_TOKEN" }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const table = event.queryStringParameters?.table;
      if (!table) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table parameter" }) };
      const base = baseForTable(table, defaultBase);
      const result = await getTable(base, token, table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (event.httpMethod === "POST") {
      const { table, fields } = JSON.parse(event.body || "{}");
      if (!table || !fields) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table or fields" }) };
      const base = baseForTable(table, defaultBase);
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
      const result = await airtableJson(url, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, typecast: true })
      });
      if (result.status >= 200 && result.status < 300) clearTableCache(base, table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (event.httpMethod === "PATCH") {
      const { table, id, fields } = JSON.parse(event.body || "{}");
      if (!table || !id || !fields) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table, id, or fields" }) };
      const base = baseForTable(table, defaultBase);
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;
      const result = await airtableJson(url, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (result.status >= 200 && result.status < 300) clearTableCache(base, table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (event.httpMethod === "DELETE") {
      const { table, id } = JSON.parse(event.body || "{}");
      if (!table || !id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table or id" }) };
      const base = baseForTable(table, defaultBase);
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;
      const result = await airtableJson(url, token, { method: "DELETE" });
      if (result.status >= 200 && result.status < 300) clearTableCache(base, table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
