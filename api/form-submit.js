// Public, create-only submission endpoint for website forms (Vercel).
// Credentials come from environment variables. See api/_lib/forms-core.js.
const { handle, lowerHeaders } = require('./_lib/forms-http');

module.exports = async (req, res) => {
  const body = typeof req.body === 'string' ? req.body
    : Buffer.isBuffer(req.body) ? req.body.toString('utf8')
    : JSON.stringify(req.body || {});
  const out = await handle({ method: req.method, headers: lowerHeaders(req.headers), body });
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.status(out.status).send(out.body);
};
