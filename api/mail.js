// api/mail.js — Zoho-backed send / inbox / sent-log for BLEUSKM Production Portal
// Aliases crew@bleuskm.com and casting@bleuskm.com both deliver into the studio@bleuskm.com mailbox.

const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const BASE_ID   = process.env.AIRTABLE_PRODUCTION_BASE || process.env.AIRTABLE_BASE || 'appXf1NxIVhYbuV4j';
const TOKEN     = process.env.AIRTABLE_TOKEN;
const SENTTABLE = 'tblshz4V9itp8DTuy'; // Sent Emails table

const ZOHO_USER = process.env.ZOHO_EMAIL || 'studio@bleuskm.com';
const ZOHO_PASS = process.env.ZOHO_APP_PASSWORD;

const FROM_MAP = {
  studio:  { address: 'studio@bleuskm.com',  display: '"BLEUSKM Studios" <studio@bleuskm.com>' },
  crew:    { address: 'crew@bleuskm.com',    display: '"BLEUSKM Studios — Crew" <crew@bleuskm.com>' },
  casting: { address: 'casting@bleuskm.com', display: '"BLEUSKM Studios — Casting" <casting@bleuskm.com>' },
};
const HUB_MAP = { studio: 'Studio', crew: 'Crew', casting: 'Casting' };

async function airtable(method, tableId, body, params) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}${params || ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function getTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: { user: ZOHO_USER, pass: ZOHO_PASS },
  });
}

async function logSent({ subject, fromAlias, to, body, sentBy, status }) {
  try {
    await airtable('POST', SENTTABLE, {
      records: [{
        fields: {
          'Subject':      subject || '(no subject)',
          'From Address': (FROM_MAP[fromAlias] || FROM_MAP.studio).address,
          'To':           to || '',
          'Body':         body || '',
          'Sent By':      sentBy || '',
          'Hub':          HUB_MAP[fromAlias] || 'Studio',
          'Sent At':      new Date().toISOString(),
          'Status':       status || 'Sent',
        },
      }],
    });
  } catch (e) { /* never let logging failure break the send response */ }
}

async function fetchInbox(limit, aliasFilter) {
  const client = new ImapFlow({
    host: 'imap.zoho.com',
    port: 993,
    secure: true,
    auth: { user: ZOHO_USER, pass: ZOHO_PASS },
    logger: false,
  });
  await client.connect();
  const messages = [];
  const lock = await client.getMailboxLock('INBOX');
  try {
    const status = await client.status('INBOX', { messages: true });
    const total = status.messages || 0;
    if (total > 0) {
      const start = Math.max(1, total - 150);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true })) {
        const env = msg.envelope || {};
        messages.push({
          uid: msg.uid,
          from: (env.from && env.from[0] && env.from[0].address) || '',
          fromName: (env.from && env.from[0] && env.from[0].name) || '',
          to: (env.to || []).map(t => t.address),
          subject: env.subject || '',
          date: env.date,
        });
      }
    }
  } finally {
    lock.release();
  }
  await client.logout();
  messages.sort((a, b) => new Date(b.date) - new Date(a.date));
  let filtered = messages;
  if (aliasFilter && FROM_MAP[aliasFilter]) {
    const addr = FROM_MAP[aliasFilter].address.toLowerCase();
    filtered = messages.filter(m => m.to.some(t => (t || '').toLowerCase() === addr));
  }
  return filtered.slice(0, limit);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).send(''); return; }

  const action = (req.query && req.query.action) || '';
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (_) { body = {}; } }
  body = body || {};

  try {
    if (action === 'send') {
      if (!ZOHO_PASS) return res.status(500).json({ ok: false, error: 'Zoho not configured (missing ZOHO_APP_PASSWORD).' });
      const { fromAlias = 'studio', to, bcc, subject, html, text, sentBy } = body;
      if (!to && !bcc) return res.status(400).json({ ok: false, error: 'No recipient provided.' });
      const fromInfo = FROM_MAP[fromAlias] || FROM_MAP.studio;
      const transporter = getTransporter();
      await transporter.sendMail({
        from: fromInfo.display,
        to: to || undefined,
        bcc: bcc || undefined,
        replyTo: fromInfo.address,
        subject: subject || '(no subject)',
        html: html || undefined,
        text: text || (html ? undefined : ''),
      });
      await logSent({ subject, fromAlias, to: to || bcc || '', body: html || text || '', sentBy, status: 'Sent' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'inbox') {
      if (!ZOHO_PASS) return res.status(500).json({ ok: false, error: 'Zoho not configured.' });
      const limit = parseInt((req.query && req.query.limit) || '20', 10);
      const alias = (req.query && req.query.alias) || null;
      const messages = await fetchInbox(limit, alias);
      return res.status(200).json({ ok: true, messages });
    }

    if (action === 'sent-log') {
      const hub = req.query && req.query.hub;
      const filter = hub
        ? `?filterByFormula=${encodeURIComponent(`{Hub}="${hub}"`)}&sort[0][field]=Sent At&sort[0][direction]=desc`
        : `?sort[0][field]=Sent At&sort[0][direction]=desc`;
      const data = await airtable('GET', SENTTABLE, null, filter);
      return res.status(200).json({ ok: true, records: data.records || [] });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err && err.message) || 'Server error' });
  }
};
