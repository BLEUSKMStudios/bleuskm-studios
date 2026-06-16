const tableCache = new Map();
const inFlight = new Map();
let airtableQueue = Promise.resolve();
let lastAirtableRequestAt = 0;

const CACHE_MS = 5 * 60 * 1000;
const MIN_AIRTABLE_GAP_MS = 260;

function cacheKey(table) {
  return String(table || '').toLowerCase();
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
  const key = cacheKey(table);
  const cached = tableCache.get(key);

  if (cached && Date.now() - cached.savedAt < CACHE_MS) {
    return { status: 200, data: { ...cached.data, cached: true } };
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?maxRecords=100`;
    const result = await airtableJson(url, token);

    if (result.status === 200) {
      tableCache.set(key, { savedAt: Date.now(), data: result.data });
      return result;
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

function clearTableCache(table) {
  tableCache.delete(cacheKey(table));
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;

  if (!base || !token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing AIRTABLE_BASE or AIRTABLE_TOKEN" }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const table = event.queryStringParameters?.table;
      if (!table) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table parameter" }) };
      const result = await getTable(base, token, table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (event.httpMethod === "POST") {
      const { table, fields } = JSON.parse(event.body || "{}");
      if (!table || !fields) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table or fields" }) };
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
      const result = await airtableJson(url, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, typecast: true })
      });
      if (result.status >= 200 && result.status < 300) clearTableCache(table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (event.httpMethod === "PATCH") {
      const { table, id, fields } = JSON.parse(event.body || "{}");
      if (!table || !id || !fields) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table, id, or fields" }) };
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;
      const result = await airtableJson(url, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (result.status >= 200 && result.status < 300) clearTableCache(table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (event.httpMethod === "DELETE") {
      const { table, id } = JSON.parse(event.body || "{}");
      if (!table || !id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing table or id" }) };
      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;
      const result = await airtableJson(url, token, { method: "DELETE" });
      if (result.status >= 200 && result.status < 300) clearTableCache(table);
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
