// Shared portal session helpers.
// The portal (/api/portal) issues the session cookie; the other private
// functions (Airtable proxy, mail, Stripe, AI proxies) only verify it.
// Files in /api/_lib are not deployed as routes.

const crypto = require('crypto');

const USER_MAP = {
  zaria: { department: 'director', name: 'Zaria' },
  cscott: { department: 'producer', name: 'Ceion' },
  creeves: { department: 'producer', name: 'Carmen' },
  ftorres: { department: 'producer', name: 'Fabiola' },
  ookezie: { department: 'dp', name: 'Obi' },
  rgalindo: { department: 'ad', name: 'Regan' },
  ckudulis: { department: 'scriptsupervisor', name: 'Catherine' },
  sound: { department: 'sound', name: 'Sound' }
};

// Matches DEPT_LABELS in portal/index.html.
const DEPT_LABELS = {
  director: 'Director',
  producer: 'Producer',
  dp: 'DP / Camera',
  ad: 'AD',
  scriptsupervisor: 'Script Supervisor',
  sound: 'Sound'
};

const COOKIE = 'bleuskm_portal_session';
const SESSION_SECONDS = 8 * 60 * 60;

function equal(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signature(data) {
  return crypto.createHmac('sha256', process.env.PORTAL_SESSION_SECRET).update(data).digest('hex');
}

function createSession(username) {
  const data = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + SESSION_SECONDS * 1000 })).toString('base64url');
  return data + '.' + signature(data);
}

function headerValue(headers, name) {
  if (!headers) return '';
  return String(headers[name] || headers[name.toLowerCase()] || headers[name.charAt(0).toUpperCase() + name.slice(1)] || '');
}

// Returns { username, department, name } or null.
function verifySession(headers) {
  if (!process.env.PORTAL_SESSION_SECRET) return null;
  const cookies = headerValue(headers, 'cookie').split(';').map(x => x.trim());
  const cookie = cookies.find(x => x.startsWith(COOKIE + '='));
  if (!cookie) return null;
  const value = cookie.slice(COOKIE.length + 1);
  const dot = value.lastIndexOf('.');
  if (dot < 0) return null;
  const data = value.slice(0, dot);
  if (!equal(value.slice(dot + 1), signature(data))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.exp > Date.now() && USER_MAP[payload.u] ? { username: payload.u, ...USER_MAP[payload.u] } : null;
  } catch (_) { return null; }
}

// True when the request has no Origin header (same-origin GET/HEAD from a
// browser, or server-to-server) or the Origin host matches the Host header.
function sameOrigin(headers) {
  const origin = headerValue(headers, 'origin');
  if (!origin) return true;
  try { return new URL(origin).host === headerValue(headers, 'host'); } catch (_) { return false; }
}

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
function isRecordId(v) { return RECORD_ID.test(String(v || '')); }

// Makes a value safe to place inside a double-quoted Airtable formula string.
function formulaText(v) {
  return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const ALL_DEPARTMENTS = Object.keys(DEPT_LABELS);

// Guard for Vercel (req, res) handlers. Sends 401/403 and returns null when
// the caller has no valid portal session, comes from another origin, or is
// not in one of the allowed departments; otherwise returns the session.
function requirePortalSession(req, res, departments = ALL_DEPARTMENTS) {
  const headers = req.headers || {};
  const fail = (status, error) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).send(JSON.stringify({ ok: false, error }));
    return null;
  };
  if (req.method === 'OPTIONS') return fail(403, 'not_allowed');
  if (!sameOrigin(headers)) return fail(403, 'origin_not_allowed');
  const session = verifySession(headers);
  if (!session) return fail(401, 'authentication_required');
  if (!departments.includes(session.department)) return fail(403, 'not_permitted');
  return session;
}

module.exports = {
  USER_MAP, DEPT_LABELS, ALL_DEPARTMENTS, COOKIE, SESSION_SECONDS,
  equal, createSession, verifySession, sameOrigin, isRecordId, formulaText,
  requirePortalSession
};
