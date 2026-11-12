// HTTP layer for the public form endpoint. Shared by the Vercel route
// (api/form-submit.js) and the Netlify mirror (netlify/functions/form-submit.js).

const crypto = require('crypto');
const { processSubmission } = require('./forms-core');

const MAX_BODY = 32 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 10;
const hits = new Map();       // best-effort per warm instance
const seenIds = new Map();    // submissionId -> time, best-effort per warm instance

function allowedOrigins() {
  const fromEnv = String(process.env.FORMS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : ['https://bleuskm.com', 'https://www.bleuskm.com'];
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

// event: { method, headers (lower-case keys), body (string) }
async function handle(event) {
  const h = event.headers || {};
  const origin = h.origin || '';
  const origins = allowedOrigins();
  const originOk = origins.includes(origin);
  const cors = {
    'Access-Control-Allow-Origin': originOk ? origin : origins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };
  const reply = (status, body) => ({ status, headers: cors, body: JSON.stringify(body) });

  if (event.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
  if (event.method !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' });

  const testKey = String(process.env.FORMS_TEST_KEY || '');
  const isTest = !!testKey && !!h['x-forms-test-key'] && safeEqual(h['x-forms-test-key'], testKey);
  const dryRun = String(process.env.FORMS_DRY_RUN || '').toLowerCase() === 'true' || isTest;

  if (!originOk && !isTest) return reply(403, { ok: false, error: 'origin_not_allowed' });
  if (!String(h['content-type'] || '').toLowerCase().startsWith('application/json')) return reply(415, { ok: false, error: 'json_required' });
  if (Buffer.byteLength(event.body || '') > MAX_BODY) return reply(413, { ok: false, error: 'too_large' });

  const ip = String(h['x-forwarded-for'] || h['x-real-ip'] || 'unknown').split(',')[0].trim();
  if (!isTest && rateLimited(ip)) return reply(429, { ok: false, error: 'too_many_requests' });

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'invalid_json' }); }
  if (!input || typeof input !== 'object') return reply(400, { ok: false, error: 'invalid_json' });

  // Same submissionId twice on a warm instance: answer success without repeating work.
  const sid = typeof input.submissionId === 'string' ? input.submissionId.slice(0, 80) : '';
  if (sid && !dryRun && seenIds.has(sid)) return reply(200, { ok: true, duplicate: true, warnings: [] });

  const result = await processSubmission(input, { dryRun });
  if (sid && !dryRun && result.status === 200) {
    seenIds.set(sid, Date.now());
    if (seenIds.size > 5000) seenIds.clear();
  }
  return reply(result.status, result.body);
}

function lowerHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) out[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
  return out;
}

module.exports = { handle, lowerHeaders };
