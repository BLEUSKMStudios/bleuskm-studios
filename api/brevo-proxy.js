const SELF_TAPE_DEADLINE = 'June 20th, 2026';
const REDIRECT_FILMS = ['Liminal County', 'Love me like this', 'Book of Beginnings', 'Of blood and dominion', 'As Is', 'Overstood', 'The 15th Hour'];

function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
  return String(value ?? '').trim();
}

function contractLink(name, email, role) {
  const qs = new URLSearchParams({ name: name || '', email: email || '', role: role || '', film: 'The Final Hand' });
  return `https://bleuskm.com/crew/contract?${qs.toString()}`;
}

function selfTapeLink(record, fields, role) {
  const qs = new URLSearchParams({
    id: record.id,
    name: text(fields.Name),
    email: text(fields.Email),
    role: role || text(fields['To Role']) || text(fields.Role),
    film: text(fields.Film) || 'The Final Hand'
  });
  return `https://bleuskm.com/selftape/?${qs.toString()}`;
}

function responseLink(record, fields, answer, film, flow, role) {
  const qs = new URLSearchParams({
    id: record.id,
    response: answer,
    film: film || 'The Final Hand',
    flow: flow || 'consideration',
    name: text(fields.Name),
    email: text(fields.Email),
    role: role || text(fields['To Role']) || text(fields.Role)
  });
  return `https://bleuskm.com/redirect-response?${qs.toString()}`;
}

function selectedRedirectFilm(fields) {
  const raw = Array.isArray(fields['Callback/Redirect']) ? fields['Callback/Redirect'].map(text) : [text(fields['Callback/Redirect'])];
  return raw.find(value => REDIRECT_FILMS.some(film => film.toLowerCase() === value.toLowerCase()))
    || text(fields.FILM_NAME)
    || text(fields.Film)
    || 'The Final Hand';
}

async function findByEmail(base, token, table, email) {
  if (!base || !token || !email) return null;
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?maxRecords=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.records || []).find(record => text(record.fields?.Email).toLowerCase() === email.toLowerCase()) || null;
}

async function enrichPayload(payload) {
  const defaultBase = process.env.AIRTABLE_BASE;
  const castingBase = process.env.AIRTABLE_CASTING_BASE || defaultBase;
  const productionBase = process.env.AIRTABLE_PRODUCTION_BASE || defaultBase;
  const token = process.env.AIRTABLE_TOKEN;
  const templateId = Number(payload.templateId);
  const email = text(payload.to?.[0]?.email);

  if ([15, 17, 18, 19].includes(templateId)) {
    const record = await findByEmail(castingBase, token, 'Casting Submissions', email);
    if (!record) return payload;
    const f = record.fields || {};
    const redirectFilm = selectedRedirectFilm(f);
    const templateFilm = templateId === 17 ? redirectFilm : (text(payload.params?.FILM_NAME) || text(f.Film) || 'The Final Hand');
    const role = text(f['To Role']) || text(f.Role);
    const tapeUrl = text(payload.params?.SELFTAPE_URL)
      || text(payload.params?.SELF_TAPE_URL)
      || text(payload.params?.SELF_TAPE_LINK)
      || text(payload.params?.SUBMIT_SELF_TAPE_URL)
      || text(payload.params?.SUBMIT_URL)
      || selfTapeLink(record, f, role);
    payload.params = {
      ...(payload.params || {}),
      NAME: text(f.Name),
      EMAIL: email,
      PHONE: text(f.Phone),
      LOCATION: text(f.Location),
      ROLE: role,
      TO_ROLE: role,
      NEW_ROLE: role,
      FILM: templateFilm,
      FILM_NAME: templateFilm,
      DEADLINE: text(payload.params?.DEADLINE) || SELF_TAPE_DEADLINE,
      SELFTAPE_URL: tapeUrl,
      SELF_TAPE_URL: tapeUrl,
      SELF_TAPE_LINK: tapeUrl,
      SUBMIT_SELF_TAPE_URL: tapeUrl,
      SUBMIT_URL: tapeUrl
    };
    if (templateId === 17) {
      payload.params.FILM = redirectFilm;
      payload.params.FILM_NAME = redirectFilm;
      payload.params.CONSENT_YES_URL = responseLink(record, f, 'yes', redirectFilm, 'consideration', role);
      payload.params.CONSENT_NO_URL = responseLink(record, f, 'no', redirectFilm, 'consideration', role);
    }
    if (templateId === 18) {
      payload.params.CONSENT_YES_URL = responseLink(record, f, 'yes', templateFilm, 'selftape', role);
      payload.params.CONSENT_NO_URL = responseLink(record, f, 'no', templateFilm, 'selftape', role);
    }
  }

  if ([20, 21, 25, 27].includes(templateId)) {
    const record = await findByEmail(productionBase, token, 'Crew applications', email);
    if (!record) return payload;
    const f = record.fields || {};
    const appliedRole = text(f.Role);
    const preferredRole = text(f['Preferred role by Director'] || f.Preferred_role_by_Director);
    const role = preferredRole || appliedRole;
    payload.params = {
      ...(payload.params || {}),
      NAME: text(f.Name),
      EMAIL: email,
      ROLE: role,
      APPLIED_ROLE: appliedRole,
      ORIGINAL_ROLE: appliedRole,
      ON_SET_ROLE: role,
      PREFERRED_ROLE_BY_DIRECTOR: role,
      FILM: 'The Final Hand',
      CONTRACT_LINK: contractLink(text(f.Name), email, role)
    };
    if (templateId === 27) {
      const link = payload.params.CONTRACT_LINK;
      delete payload.templateId;
      payload.subject = 'The Final Hand | Crew Agreement Link';
      payload.htmlContent = `<p>Hi ${text(f.Name) || 'there'},</p><p>Your agreement for <strong>The Final Hand</strong> is ready here:</p><p><a href="${link}">${link}</a></p><p>Thank you,<br>BLEUSKM Studios</p>`;
      payload.textContent = `Hi ${text(f.Name) || 'there'},\n\nYour agreement for The Final Hand is ready here:\n${link}\n\nThank you,\nBLEUSKM Studios`;
    }
  }

  return payload;
}

async function netlifyHandler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const BREVO_KEY = process.env.BREVO_KEY;
  if (!BREVO_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Missing BREVO_KEY' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { endpoint } = body;
  let { payload } = body;

  const allowed = [
    'https://api.brevo.com/v3/smtp/email',
    'https://api.brevo.com/v3/contacts'
  ];
  if (!allowed.includes(endpoint)) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden endpoint' }) };

  try {
    if (endpoint === 'https://api.brevo.com/v3/smtp/email') {
      payload = await enrichPayload(payload || {});
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Brevo response:', response.status, JSON.stringify(data));

    return {
      statusCode: response.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('Brevo error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
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
