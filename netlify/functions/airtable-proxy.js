const memoryCache = new Map();

function cacheKey(table) {
  return `table:${table}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airtableFetch(url, token, options = {}, tries = 3) {
  let lastResponse;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    lastResponse = res;
    if (res.status !== 429 && res.status < 500) return res;
    await wait(350 * (attempt + 1));
  }
  return lastResponse;
}

async function listAllRecords(base, token, table, requestedMax) {
  const key = cacheKey(table);
  const cached = memoryCache.get(key);
  const maxRecords = Number(requestedMax || 0);
  const all = [];
  let offset = "";

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?${params.toString()}`;
    const res = await airtableFetch(url, token);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (cached?.records?.length) {
        return { status: 200, data: { records: cached.records, cached: true, airtableStatus: res.status, airtableError: data.error || data } };
      }
      return { status: res.status, data };
    }

    all.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset && (!maxRecords || all.length < maxRecords));

  const records = maxRecords ? all.slice(0, maxRecords) : all;
  memoryCache.set(key, { records, savedAt: Date.now() });
  return { status: 200, data: { records } };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;

  if (!base || !token) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing AIRTABLE_BASE or AIRTABLE_TOKEN" })
    };
  }

  try {
    if (event.httpMethod === "GET") {
      const table = event.queryStringParameters?.table;

      if (!table) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing table parameter" })
        };
      }

      const result = await listAllRecords(base, token, table, event.queryStringParameters?.maxRecords);
      return {
        statusCode: result.status,
        headers,
        body: JSON.stringify(result.data)
      };
    }

    if (event.httpMethod === "PATCH") {
      const { table, id, fields } = JSON.parse(event.body || "{}");

      if (!table || !id || !fields) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing table, id, or fields" })
        };
      }

      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;

      const res = await airtableFetch(url, token, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
      });

      const data = await res.json();
      memoryCache.delete(cacheKey(table));

      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify(data)
      };
    }

    if (event.httpMethod === "POST") {
      const { table, fields } = JSON.parse(event.body || "{}");

      if (!table || !fields) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing table or fields" })
        };
      }

      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

      const res = await airtableFetch(url, token, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields, typecast: true })
      });

      const data = await res.json();
      memoryCache.delete(cacheKey(table));

      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify(data)
      };
    }

    if (event.httpMethod === "DELETE") {
      const { table, id } = JSON.parse(event.body || "{}");

      if (!table || !id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing table or id" })
        };
      }

      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;

      const res = await airtableFetch(url, token, { method: "DELETE" });

      const data = await res.json();
      memoryCache.delete(cacheKey(table));

      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify(data)
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
