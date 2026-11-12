// BLEUSKM Studios: public form submission core (server-side only).
//
// Public pages POST { form, fields, newsletter, submissionId } here. This
// module decides which Airtable table and which Brevo list / template are
// used. The browser never chooses a table, base, record ID, list ID, template
// ID, sender, or HTTP method, and nothing is ever read back to the browser.
//
// Secrets come only from environment variables. Never log their values.

const AIRTABLE_API = 'https://api.airtable.com/v0';
const BREVO_API = 'https://api.brevo.com/v3';

// The five permanent intake tables. IDs are not secrets; they can be
// overridden with env vars if a table is ever recreated.
const TABLES = {
  casting:    { env: 'AIRTABLE_TBL_CASTING',    id: 'tblLGmXULNb9ebFxH', name: 'Casting Submissions' },
  newsletter: { env: 'AIRTABLE_TBL_NEWSLETTER', id: 'tblSMb3y7vrvjbONx', name: 'Newsletter' },
  inquiries:  { env: 'AIRTABLE_TBL_INQUIRIES',  id: 'tblwfk7tmoFhGIia5', name: 'Project Inquiries' },
  crew:       { env: 'AIRTABLE_TBL_CREW',       id: 'tblCR7Cg3WugORlwO', name: 'Crew applications' },
  notify:     { env: 'AIRTABLE_TBL_NOTIFY',     id: 'tblcSHay5dfYcbDKC', name: 'Film Notifications' }
};

const SENDERS = {
  1: { email: 'casting@bleuskm.com', name: 'BLEUSKM Studios Casting' },
  2: { email: 'crew@bleuskm.com', name: 'BLEUSKM Studios Crew' },
  3: { email: 'newsletter@bleuskm.com', name: 'BLEUSKM Studios' },
  4: { email: 'films@bleuskm.com', name: 'BLEUSKM Studios Films' }
};

// Allowed fields per form, with type and max length. Anything not listed is dropped.
const S = (max) => ({ type: 'text', max });
const U = { type: 'url', max: 1000 };
const FORMS = {
  casting: {
    table: 'casting',
    fields: {
      Name: S(200), Email: { type: 'email' }, Phone: S(40), Age: { type: 'number', min: 0, max: 120 },
      Location: S(200), Film: S(200), Role: S(200), 'Reel/Portfolio Link': U, Headshot: U, About: S(5000)
    },
    required: ['Name', 'Email', 'Film'],
    fixed: { 'Casting Status': 'Reviewing' },
    dedupeOn: ['Film', 'Role'],
    list: { id: 4, attrs: { FILM: 'Film', ROLE: 'Role' } },
    email: { template: 1, params: { FIRSTNAME: 'Name', FILM: 'Film', ROLE: 'Role' } },
    newsletterOption: 'full' // record + list 2 + welcome email
  },
  notify: {
    table: 'notify',
    fields: { Name: S(200), Email: { type: 'email' }, Film: S(200), 'Role Interested In': S(200) },
    required: ['Email', 'Film'],
    fixed: { Type: 'Casting Soon' },
    dedupeOn: ['Film', 'Type'],
    list: { id: 2, attrs: { FILM: 'Film', ROLE_INTEREST: 'Role Interested In' } },
    email: { template: 4, params: { FIRSTNAME: 'Name', FILM: 'Film' } },
    newsletterOption: 'full'
  },
  'coming-soon': {
    table: 'notify',
    fields: { Name: S(200), Email: { type: 'email' }, Film: S(200) },
    required: ['Email', 'Film'],
    fixed: { Type: 'Coming Soon' },
    dedupeOn: ['Film', 'Type'],
    list: { id: 2, attrs: { FILM: 'Film' } },
    email: { template: 4, params: { FIRSTNAME: 'Name', FILM: 'Film' } },
    newsletterOption: 'full'
  },
  newsletter: {
    table: 'newsletter',
    fields: { Name: S(200), Email: { type: 'email' } },
    required: ['Email'],
    fixed: {},
    dedupeOn: [],
    dedupeForever: true, // one Newsletter row and one welcome email per address
    list: { id: 2, attrs: {} },
    email: { template: 3, params: { FIRSTNAME: 'Name' } },
    newsletterOption: 'none'
  },
  crew: {
    table: 'crew',
    fields: {
      Name: S(200), Email: { type: 'email' }, Role: S(200), Phone: S(40), City: S(200),
      'Resume / Portfolio Link': U, 'Reel / Work Samples': U, 'Gear List': S(5000),
      Availability: S(500), 'Film Interest': S(500), 'Join Collective': { type: 'bool' },
      'LT Roles': S(2000), 'LT Project Types': S(2000), 'Why Build With BLEUSKM': S(5000),
      Inspirations: S(5000), 'Collective Interests': S(2000)
    },
    required: ['Name', 'Email'],
    fixed: {},
    dedupeOn: ['Role'],
    list: { id: 6, attrs: { CREW_ROLE: 'Role' } },
    email: { template: 2, params: { FIRSTNAME: 'Name', ROLE: 'Role' } },
    newsletterOption: 'record-and-email' // matches the live crew page: record + welcome email
  },
  inquiry: {
    table: 'inquiries',
    fields: {
      Name: S(200), Email: { type: 'email' }, 'Phone number': S(40), 'Project Type': S(200),
      Budget: S(200), Concept: S(5000), Timeline: S(500)
    },
    required: ['Email'],
    fixed: {},
    dedupeOn: ['Project Type'],
    list: { id: 5, attrs: { PROJECT_TYPE: 'Project Type' } },
    email: null, // the live contact page sends no confirmation email
    newsletterOption: 'list-only' // matches the live contact page: Brevo list 2 only
  }
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

function env(name) { return String(process.env[name] || '').trim(); }

function tableId(key) { const t = TABLES[key]; return env(t.env) || t.id; }

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function sanitize(spec, raw) {
  const out = {};
  for (const [name, rule] of Object.entries(spec.fields)) {
    if (!Object.prototype.hasOwnProperty.call(raw, name)) continue;
    const v = raw[name];
    if (rule.type === 'bool') { if (v === true) out[name] = true; continue; }
    if (rule.type === 'number') {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n >= rule.min && n <= rule.max) out[name] = n;
      continue;
    }
    if (rule.type === 'email') { const e = cleanText(v, 254).toLowerCase(); if (e) out[name] = e; continue; }
    if (rule.type === 'url') {
      const u = cleanText(v, rule.max);
      if (u && !/^(javascript|data|vbscript):/i.test(u)) out[name] = u;
      continue;
    }
    const t = cleanText(v, rule.max);
    if (t) out[name] = t;
  }
  return Object.assign(out, spec.fixed);
}

function formulaString(v) {
  return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

// ── Airtable (create + duplicate check only) ────────────────────────────────
async function airtable(path, token, options = {}) {
  const delays = [0, 800, 2000];
  let last;
  for (const d of delays) {
    if (d) await new Promise(r => setTimeout(r, d));
    last = await fetch(AIRTABLE_API + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    if (last.status !== 429 && last.status < 500) break;
  }
  const data = await last.json().catch(() => ({}));
  return { ok: last.ok, status: last.status, data };
}

async function findDuplicate(ctx, spec, fields) {
  const parts = ['LOWER({Email})=' + formulaString(fields.Email)];
  for (const f of spec.dedupeOn) parts.push('{' + f + '}=' + formulaString(fields[f] || ''));
  if (!spec.dedupeForever) {
    const mins = Math.max(1, parseInt(env('FORMS_DEDUPE_MINUTES') || '15', 10));
    parts.push("IS_AFTER(CREATED_TIME(), DATEADD(NOW(), -" + mins + ", 'minutes'))");
  }
  const formula = parts.length > 1 ? 'AND(' + parts.join(',') + ')' : parts[0];
  const qs = new URLSearchParams({ filterByFormula: formula, maxRecords: '1', 'fields[]': 'Email' });
  const r = await airtable('/' + ctx.base + '/' + tableId(spec.table) + '?' + qs.toString(), ctx.token);
  if (!r.ok) throw new Error('airtable_lookup_' + r.status);
  return (r.data.records || []).length > 0;
}

async function createRecord(ctx, tableKey, fields) {
  const r = await airtable('/' + ctx.base + '/' + tableId(tableKey), ctx.token, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  });
  if (!r.ok) {
    const type = r.data && r.data.error && (r.data.error.type || r.data.error);
    throw new Error('airtable_create_' + r.status + (typeof type === 'string' ? '_' + type : ''));
  }
}

// ── Brevo ────────────────────────────────────────────────────────────────────
async function brevo(ctx, path, payload) {
  const res = await fetch(BREVO_API + path, {
    method: 'POST',
    headers: { 'api-key': ctx.brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    const code = String(data.code || '').slice(0, 100).replace(/[^a-zA-Z0-9_.-]/g, '');
    const message = String(data.message || '').slice(0, 240).replace(/[\r\n]/g, ' ');
    throw new Error('brevo_' + path.replace(/\W+/g, '_') + '_' + res.status + ' code=' + code + ' message=' + message);
  }
}

function pick(map, fields) {
  const out = {};
  for (const [k, f] of Object.entries(map)) out[k] = fields[f] || '';
  return out;
}

// ── Main entry ───────────────────────────────────────────────────────────────
// Returns { status, body }. Body never contains Airtable or Brevo data.
async function processSubmission(input, opts = {}) {
  const spec = FORMS[input && input.form];
  if (!spec) return { status: 400, body: { ok: false, error: 'unknown_form' } };
  const raw = input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? input.fields : {};
  const fields = sanitize(spec, raw);

  if (fields.Email && !EMAIL_RE.test(fields.Email)) return { status: 400, body: { ok: false, error: 'invalid_email' } };
  for (const r of spec.required) if (!fields[r]) return { status: 400, body: { ok: false, error: 'missing_' + r.toLowerCase().replace(/\W+/g, '_') } };

  const wantsNewsletter = input.newsletter === true && spec.newsletterOption !== 'none';
  const name = fields.Name || '';

  const plan = [];
  plan.push({ step: 'airtable.create', table: TABLES[spec.table].name, fields: Object.keys(fields) });
  plan.push({ step: 'brevo.contact', list: spec.list.id });
  if (spec.email) plan.push({ step: 'brevo.email', template: spec.email.template });
  if (wantsNewsletter) {
    if (spec.newsletterOption !== 'list-only') plan.push({ step: 'airtable.create', table: 'Newsletter', fields: ['Name', 'Email'] });
    if (spec.newsletterOption !== 'record-and-email') plan.push({ step: 'brevo.contact', list: 2 });
    if (spec.newsletterOption !== 'list-only') plan.push({ step: 'brevo.email', template: 3 });
  }

  if (opts.dryRun) return { status: 200, body: { ok: true, dryRun: true, plan } };

  const ctx = {
    base: env('AIRTABLE_BASE'),
    token: env('AIRTABLE_FORMS_TOKEN') || env('AIRTABLE_TOKEN'),
    brevoKey: env('BREVO_KEY')
  };
  if (!ctx.base || !ctx.token) return { status: 500, body: { ok: false, error: 'server_not_configured' } };

  // 1) Main record, unless an identical one was just created (double click, retry, refresh).
  let duplicate = false;
  try {
    duplicate = await findDuplicate(ctx, spec, fields);
    if (!duplicate) await createRecord(ctx, spec.table, fields);
  } catch (e) {
    console.error('[form-submit] ' + input.form + ' record failed: ' + e.message);
    return { status: 502, body: { ok: false, error: 'save_failed' } };
  }

  // 2) Brevo follow-ups. Emails go out only when a new record was created.
  const warnings = [];
  const run = async (label, fn) => { try { await fn(); } catch (e) { warnings.push(label); console.error('[form-submit] ' + label + ': ' + e.message); } };
  const brevoReady = !!ctx.brevoKey;
  if (!brevoReady) warnings.push('brevo_not_configured');

  if (brevoReady) {
    await run('contact', () => brevo(ctx, '/contacts', {
      email: fields.Email, attributes: Object.assign({ FIRSTNAME: name }, pick(spec.list.attrs, fields)),
      listIds: [spec.list.id], updateEnabled: true
    }));
    if (spec.email && !duplicate) {
      await run('email', () => brevo(ctx, '/smtp/email', {
        sender: SENDERS[spec.email.template], to: [{ email: fields.Email, name: name || fields.Email }],
        templateId: spec.email.template, params: pick(spec.email.params, fields)
      }));
    }
  }

  if (wantsNewsletter) {
    let newSubscriber = false;
    if (spec.newsletterOption !== 'list-only') {
      await run('newsletter_record', async () => {
        const nlSpec = FORMS.newsletter;
        const nl = { Name: name, Email: fields.Email };
        if (!(await findDuplicate(ctx, nlSpec, nl))) { await createRecord(ctx, 'newsletter', nl); newSubscriber = true; }
      });
    }
    if (brevoReady && spec.newsletterOption !== 'record-and-email') {
      await run('newsletter_contact', () => brevo(ctx, '/contacts', {
        email: fields.Email, attributes: { FIRSTNAME: name }, listIds: [2], updateEnabled: true
      }));
    }
    if (brevoReady && newSubscriber && spec.newsletterOption !== 'list-only') {
      await run('newsletter_email', () => brevo(ctx, '/smtp/email', {
        sender: SENDERS[3], to: [{ email: fields.Email, name: name || fields.Email }],
        templateId: 3, params: { FIRSTNAME: name }
      }));
    }
  }

  return { status: 200, body: { ok: true, duplicate, warnings } };
}

module.exports = { processSubmission, FORMS, TABLES, _sanitize: sanitize };
