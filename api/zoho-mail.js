// IMPORTANT: this function uses raw TLS sockets (tls.connect) to talk to Zoho's
// SMTP server directly. Do NOT deploy as an Edge Function — it requires the
// Node.js serverless runtime (which is Vercel's default for files in /api).
const tls = require('tls');

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function text(value) {
  return String(value ?? '').trim();
}

function env(name, fallback = '') {
  return text(process.env[name]) || fallback;
}

function allowedSenders() {
  return env('ZOHO_ALLOWED_SENDERS', env('ZOHO_MAIL_USER'))
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function senderNameFor(email, displayName) {
  if (displayName) return displayName;
  const lower = email.toLowerCase();
  if (lower === 'studio@bleuskm.com') return 'Zaria - Director/Founder';
  if (lower === 'casting@bleuskm.com') return 'BLEUSKM Casting';
  if (lower === 'crew@bleuskm.com') return 'BLEUSKM Crew';
  return 'BLEUSKM Studios';
}

function encodeHeader(value) {
  const clean = text(value).replace(/[\r\n]/g, ' ');
  return /[^\x20-\x7e]/.test(clean)
    ? `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`
    : clean;
}

function normalizeRecipients(input) {
  const list = Array.isArray(input) ? input : [input];
  return list
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function smtpConfig() {
  const user = env('ZOHO_MAIL_USER');
  const pass = env('ZOHO_MAIL_APP_PASSWORD');
  if (!user || !pass) throw new Error('Missing ZOHO_MAIL_USER or ZOHO_MAIL_APP_PASSWORD');
  return {
    host: env('ZOHO_SMTP_HOST', 'smtp.zoho.com'),
    port: Number(env('ZOHO_SMTP_PORT', '465')),
    user,
    pass
  };
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('SMTP timeout')), 20000);
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (lines.length && /^\d{3} /.test(lines[lines.length - 1])) {
        clearTimeout(timer);
        socket.off('data', onData);
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.off('data', onData);
      reject(err);
    });
  });
}

async function smtpCommand(socket, command, expected) {
  if (command) socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  const code = Number(response.slice(0, 3));
  const ok = Array.isArray(expected) ? expected.includes(code) : code === expected;
  if (!ok) throw new Error(`SMTP ${command || 'connect'} failed: ${response.trim()}`);
  return response;
}

function buildMessage({ from, fromName, to, cc, bcc, subject, textContent, htmlContent, replyTo, inReplyTo }) {
  const recipients = normalizeRecipients(to);
  const ccList = normalizeRecipients(cc);
  const fromLabel = `${encodeHeader(senderNameFor(from, fromName))} <${from}>`;
  const boundary = `bleuskm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const headers = [
    `From: ${fromLabel}`,
    `To: ${recipients.join(', ')}`,
    ccList.length ? `Cc: ${ccList.join(', ')}` : '',
    replyTo ? `Reply-To: ${replyTo}` : '',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
    inReplyTo ? `References: ${inReplyTo}` : '',
    `Subject: ${encodeHeader(subject || 'BLEUSKM Studios')}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ].filter(Boolean);
  const safeText = textContent || text(htmlContent).replace(/<[^>]+>/g, ' ');
  const safeHtml = htmlContent || `<p>${text(safeText).replace(/\n/g, '<br>')}</p>`;
  return `${headers.join('\r\n')}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${safeText}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${safeHtml}\r\n\r\n--${boundary}--\r\n`;
}

async function sendMail(body) {
  const config = smtpConfig();
  const from = text(body.from || body.sender?.email || config.user).toLowerCase();
  if (!allowedSenders().includes(from)) throw new Error(`Sender not allowed: ${from}`);
  const to = normalizeRecipients(body.to);
  const cc = normalizeRecipients(body.cc);
  const bcc = normalizeRecipients(body.bcc);
  if (!to.length && !cc.length && !bcc.length) throw new Error('Missing recipient');
  const message = buildMessage({
    from,
    fromName: text(body.fromName || body.sender?.name),
    to,
    cc,
    bcc,
    subject: text(body.subject),
    textContent: text(body.textContent || body.text),
    htmlContent: text(body.htmlContent || body.html),
    replyTo: text(body.replyTo || from),
    inReplyTo: text(body.inReplyTo)
  });

  const socket = tls.connect({ host: config.host, port: config.port, servername: config.host });
  await smtpCommand(socket, '', 220);
  await smtpCommand(socket, 'EHLO bleuskm.com', 250);
  await smtpCommand(socket, 'AUTH LOGIN', 334);
  await smtpCommand(socket, Buffer.from(config.user).toString('base64'), 334);
  await smtpCommand(socket, Buffer.from(config.pass).toString('base64'), 235);
  await smtpCommand(socket, `MAIL FROM:<${config.user}>`, 250);
  [...to, ...cc, ...bcc].forEach((recipient) => socket.write(`RCPT TO:<${recipient}>\r\n`));
  for (let i = 0; i < to.length + cc.length + bcc.length; i += 1) {
    const response = await smtpRead(socket);
    const code = Number(response.slice(0, 3));
    if (![250, 251].includes(code)) throw new Error(`SMTP recipient failed: ${response.trim()}`);
  }
  await smtpCommand(socket, 'DATA', 354);
  socket.write(`${message.replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`);
  await smtpCommand(socket, '', 250);
  await smtpCommand(socket, 'QUIT', 221).catch(() => {});
  socket.end();
  return { ok: true, from, to, cc, bcc };
}

async function netlifyHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: JSON_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const result = await sendMail(body);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
}

// ── Vercel adapter ──
module.exports = async (req, res) => {
  const event = {
    httpMethod: req.method,
    queryStringParameters: req.query || {},
    headers: req.headers || {},
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
  };
  const result = await netlifyHandler(event);
  const { statusCode = 200, headers = {}, body = '', isBase64Encoded } = result || {};
  Object.entries(headers).forEach(([k, v]) => { try { res.setHeader(k, v); } catch (e) {} });
  if (isBase64Encoded) {
    res.status(statusCode).send(Buffer.from(body, 'base64'));
  } else {
    res.status(statusCode).send(body);
  }
};
