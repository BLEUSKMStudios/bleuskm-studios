(function () {
  if (window.__bleuskmAirtableThrottle) return;
  window.__bleuskmAirtableThrottle = true;

  const rawFetch = window.fetch.bind(window);
  let queue = Promise.resolve();
  let lastRequestAt = 0;
  const minGapMs = 450;
  const retryDelays = [0, 1200, 2600, 5200, 8500];

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function endpointUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function tableFromUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      if (!parsed.pathname.includes('/.netlify/functions/airtable-proxy')) return '';
      return parsed.searchParams.get('table') || '';
    } catch {
      return '';
    }
  }

  function cacheKey(table) {
    return `bleuskm_airtable_cache:${table}`;
  }

  function readCache(table) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(table)) || 'null');
      return Array.isArray(cached?.records) ? cached.records : [];
    } catch {
      return [];
    }
  }

  function writeCache(table, records) {
    if (!Array.isArray(records) || !records.length) return;
    try {
      localStorage.setItem(cacheKey(table), JSON.stringify({
        savedAt: new Date().toISOString(),
        records
      }));
    } catch {}
  }

  function cachedResponse(table, records) {
    return new Response(JSON.stringify({ records, cached: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function queuedFetch(input, init) {
    const run = queue.then(async () => {
      const sinceLast = Date.now() - lastRequestAt;
      if (sinceLast < minGapMs) await wait(minGapMs - sinceLast);
      lastRequestAt = Date.now();
      return rawFetch(input, init);
    });
    queue = run.catch(() => {});
    return run;
  }

  window.fetch = async function bleuskmAirtableFetch(input, init = {}) {
    const url = endpointUrl(input);
    const method = String(init.method || 'GET').toUpperCase();
    const table = method === 'GET' ? tableFromUrl(url) : '';

    if (!table) return rawFetch(input, init);

    let lastResponse = null;
    for (const delay of retryDelays) {
      if (delay) await wait(delay);
      lastResponse = await queuedFetch(input, init);
      if (lastResponse.ok || (lastResponse.status !== 429 && lastResponse.status < 500)) {
        if (lastResponse.ok) {
          const clone = lastResponse.clone();
          clone.json().then((data) => writeCache(table, data.records || [])).catch(() => {});
        }
        return lastResponse;
      }
    }

    const cached = readCache(table);
    if (cached.length) return cachedResponse(table, cached);
    return lastResponse || rawFetch(input, init);
  };
})();
