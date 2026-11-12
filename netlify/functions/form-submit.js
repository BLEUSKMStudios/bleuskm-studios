// Netlify mirror of api/form-submit.js (the live site runs on Vercel).
const { handle, lowerHeaders } = require('../../api/_lib/forms-http');

exports.handler = async (event) => {
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const out = await handle({ method: event.httpMethod, headers: lowerHeaders(event.headers), body });
  return { statusCode: out.status, headers: out.headers, body: out.body };
};
