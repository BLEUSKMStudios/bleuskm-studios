// netlify/functions/portal.js
// Multipurpose backend for BLEUSKM Production Portal

const BASE_ID = process.env.AIRTABLE_PRODUCTION_BASE || process.env.AIRTABLE_BASE || 'appXf1NxIVhYbuV4j';
const TOKEN   = process.env.AIRTABLE_TOKEN;

const TABLES = {
  files:      'tblRcNwwGKpl4IylQ',
  locations:  'tblNXw83wijZmQqBA',
  notes:      'tblFDppXUIgiH52K8',
  crew:       'tblCR7Cg3WugORlwO',
  contracts:  'tbl9V7tnVsuccyNsv',
  timeline:   'tblQ5GVTrUFhOWMiQ',
  scenes:     'tblH9bkPLY9u029Ji',
  continuity: 'tblZ4GGCao9uzczxe',
  takelog:    'tblM7lhg0pbtKhFP8',
  budget:     'tblOKyFUK9MP0E1Rk',
  soundmoments:'tbl59oUC6f3hKeauN',
  casting:    'tblLGmXULNb9ebFxH',
  settings:   'tbl8Z3kwQmrnga4sU',
  polls:        'tblBQ2y1z2KeGSs6S',
  pollresponses:'tbll27h1bqQh02KMJ',
  characternotes:'tbliAd7h6AVuP9ej6',
  tasks:        'tbl7TxX0xPNI7YxZ9',
  pushednotes:  'tblkr4cvu7qCbCD0e',
};

const FILES_ATTACHMENT_FIELD = 'fldlZcbMXEFM0AfQH'; // Portal Files → Attachment (multipleAttachments)

const USER_MAP = {
  // Director
  'zaria':     { password: 'bleuskm2026', department: 'director',        name: 'Zaria' },
  // Producers
  'cscott':    { password: 'bleuskmcrew', department: 'producer',        name: 'Ceion' },
  'creeves':   { password: 'bleuskmcrew', department: 'producer',        name: 'Carmen' },
  'ftorres':   { password: 'bleuskmcrew', department: 'producer',        name: 'Fabiola' },
  // DP
  'ookezie':   { password: 'bleuskmcam',  department: 'dp',              name: 'Obi' },
  // AD
  'rgalindo':  { password: 'bleuskm2026', department: 'ad',              name: 'Regan' },
  // Script Supervisor
  'ckudulis':  { password: 'bleuscript',  department: 'scriptsupervisor', name: 'Catherine' },
  // Sound
  'sound':     { password: 'sound2026',   department: 'sound',           name: 'Sound' },
};

async function airtable(method, tableId, body = null, params = '') {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}${params}`;
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

async function netlifyHandler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) {}

  // ── AUTH ──────────────────────────────────────────────────────────────────
  if (action === 'auth') {
    const username = (body.username || '').toLowerCase().trim();
    const pass     = body.password || '';
    const user     = USER_MAP[username];
    if (user && user.password === pass) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, department: user.department, username, name: user.name }) };
    }
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Invalid username or password' }) };
  }

  // ── CREW ──────────────────────────────────────────────────────────────────
  if (action === 'get-crew') {
    const filter = `filterByFormula=UPPER({Status})="CORE"`;
    const data = await airtable('GET', TABLES.crew, null, `?${filter}&maxRecords=100`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-crew') {
    const data = await airtable('POST', TABLES.crew, {
      records: [{
        fields: {
          'Name':  body.name  || '',
          'Email': body.email || '',
          'Role':  body.role  || '',
          'City':  body.city  || '',
          'Phone': body.phone || '',
          'Status': 'CORE',
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-crew') {
    const data = await airtable('DELETE', TABLES.crew, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── FILES ─────────────────────────────────────────────────────────────────
  if (action === 'get-files') {
    const dept = params.dept || '';
    const filter = encodeURIComponent(`OR({For Department}="${dept}",{For Department}="All")`);
    const data = await airtable('GET', TABLES.files, null, `?filterByFormula=${filter}&sort[0][field]=Created&sort[0][direction]=desc`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-file') {
    // Create the record first so we have a recordId for the attachment upload.
    const created = await airtable('POST', TABLES.files, {
      records: [{
        fields: {
          'Name':            body.name || 'Untitled',
          'File URL':        body.fileBase64 ? '' : (body.url || ''),
          'File Type':       body.fileType || '',
          'For Department':  body.forDept || 'All',
          'From Department': body.fromDept || '',
          'Section':         body.section || '',
          'Notes':           body.notes || '',
          'Created':         new Date().toISOString(),
        },
      }],
    });
    const rec = created.records && created.records[0];
    const recId = rec && rec.id;

    // If raw file bytes were sent, host them directly on Airtable (avoids
    // third-party delivery restrictions that caused 401s on "Open" links).
    if (recId && body.fileBase64) {
      try {
        const attRes = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${recId}/${FILES_ATTACHMENT_FIELD}/uploadAttachment`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType: body.fileType || 'application/octet-stream',
            file: body.fileBase64,
            filename: body.filename || body.name || 'file',
          }),
        });
        const attData = await attRes.json();
        const attField = attData.fields && attData.fields[FILES_ATTACHMENT_FIELD];
        const hostedUrl = attField && attField[0] && attField[0].url;
        if (hostedUrl) {
          await airtable('PATCH', TABLES.files, { records: [{ id: recId, fields: { 'File URL': hostedUrl } }] });
          rec.fields['File URL'] = hostedUrl;
        } else {
          const errMsg = (attData && attData.error && (attData.error.message || attData.error.type)) || 'Attachment upload failed';
          return { statusCode: 200, headers, body: JSON.stringify({ ...created, uploadError: errMsg }) };
        }
      } catch (e) {
        return { statusCode: 200, headers, body: JSON.stringify({ ...created, uploadError: e.message || 'Attachment upload failed' }) };
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(created) };
  }

  if (action === 'delete-file') {
    const data = await airtable('DELETE', TABLES.files, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'mark-read') {
    const recId = body.recordId;
    const dept  = body.department;
    const curr = await airtable('GET', TABLES.files, null, `/${recId}`);
    const existing = (curr.fields || {})['Read By'] || '';
    const updated  = existing ? `${existing},${dept}` : dept;
    const data = await airtable('PATCH', TABLES.files, {
      records: [{ id: recId, fields: { 'Read By': updated } }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (action === 'get-notes') {
    const dept   = params.dept || '';
    const filter = encodeURIComponent(`OR({Audience}="${dept}",{Audience}="All")`);
    const data   = await airtable('GET', TABLES.notes, null, `?filterByFormula=${filter}&sort[0][field]=Created Time&sort[0][direction]=desc&maxRecords=50`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-note') {
    const data = await airtable('POST', TABLES.notes, {
      records: [{
        fields: {
          'Title':    body.title   || 'Note',
          'Note':     body.content || '',
          'Author':   body.author  || '',
          'Audience': body.audience || 'All',
          'Status':   'Active',
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-note') {
    const data = await airtable('DELETE', TABLES.notes, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── LOCATIONS ─────────────────────────────────────────────────────────────
  if (action === 'get-locations') {
    const data = await airtable('GET', TABLES.locations, null, '?maxRecords=100');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-location') {
    const data = await airtable('POST', TABLES.locations, {
      records: [{
        fields: {
          'Location Name': body.name    || '',
          'Address':       body.address || '',
          'Contact Person':body.contact || '',
          'Phone':         body.phone   || '',
          'Email':         body.email   || '',
          'Status':        body.status  || 'Not Yet Contacted',
          'Notes':         body.notes   || '',
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-location') {
    const data = await airtable('PATCH', TABLES.locations, {
      records: [{ id: body.recordId, fields: { 'Status': body.status, 'Notes': body.notes } }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-location') {
    const data = await airtable('DELETE', TABLES.locations, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── CONTRACTS ─────────────────────────────────────────────────────────────
  if (action === 'get-contracts') {
    const data = await airtable('GET', TABLES.contracts, null, '?maxRecords=100&sort[0][field]=Date Signed&sort[0][direction]=desc');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── TIMELINE ──────────────────────────────────────────────────────────────
  if (action === 'get-timeline') {
    const dept = params.dept || '';
    const filter = encodeURIComponent(`{Department}="${dept}"`);
    const data = await airtable('GET', TABLES.timeline, null, `?filterByFormula=${filter}&sort[0][field]=Sort Index&sort[0][direction]=asc`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-timeline') {
    const data = await airtable('POST', TABLES.timeline, {
      records: [{
        fields: {
          'Phase':        body.phase || '',
          'Action Label': body.actionLabel || '',
          'Description':  body.description || '',
          'Status':       body.status || 'Upcoming',
          'Department':   body.department || '',
          'Sort Index':   typeof body.sortIndex === 'number' ? body.sortIndex : 99,
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-timeline') {
    const data = await airtable('DELETE', TABLES.timeline, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-timeline') {
    const fields = {};
    if (body.phase !== undefined)       fields['Phase'] = body.phase;
    if (body.actionLabel !== undefined) fields['Action Label'] = body.actionLabel;
    if (body.description !== undefined) fields['Description'] = body.description;
    if (body.status !== undefined)      fields['Status'] = body.status;
    const data = await airtable('PATCH', TABLES.timeline, {
      records: [{ id: body.recordId, fields }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'reorder-timeline') {
    // body.order = array of {id, sortIndex}
    const records = (body.order || []).map(o => ({ id: o.id, fields: { 'Sort Index': o.sortIndex } }));
    const data = await airtable('PATCH', TABLES.timeline, { records });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── SCENES ────────────────────────────────────────────────────────────────
  if (action === 'get-scenes') {
    const data = await airtable('GET', TABLES.scenes, null, '?maxRecords=200');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-scene') {
    const data = await airtable('POST', TABLES.scenes, {
      records: [{
        fields: {
          'Scene Number': body.num    || '',
          'Location':     body.loc    || '',
          'Characters':   body.chars  || '',
          'Day or Night': body.dn     || 'Day',
          'Key Action':   body.action || '',
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-scene') {
    const data = await airtable('DELETE', TABLES.scenes, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── CONTINUITY NOTES ──────────────────────────────────────────────────────
  if (action === 'get-continuity') {
    const data = await airtable('GET', TABLES.continuity, null, '?maxRecords=200&sort[0][field]=Created&sort[0][direction]=desc');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-continuity') {
    const data = await airtable('POST', TABLES.continuity, {
      records: [{
        fields: {
          'Scene':      body.scene    || '',
          'Take':       body.take     || '',
          'Category':   body.category || 'General',
          'Note':       body.note     || '',
          'Created By': body.createdBy|| '',
          'Created':    new Date().toISOString(),
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-continuity') {
    const data = await airtable('DELETE', TABLES.continuity, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── TAKE LOG ──────────────────────────────────────────────────────────────
  if (action === 'get-takelog') {
    const data = await airtable('GET', TABLES.takelog, null, '?maxRecords=300');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-take') {
    const data = await airtable('POST', TABLES.takelog, {
      records: [{
        fields: {
          'Scene':       body.scene  || '',
          'Take Number': body.take   || '',
          'Notes':       body.notes  || '',
          'Best Take':   !!body.best,
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-take') {
    const data = await airtable('DELETE', TABLES.takelog, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── BUDGET ────────────────────────────────────────────────────────────────
  if (action === 'get-budget') {
    const data = await airtable('GET', TABLES.budget, null, '?maxRecords=100');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-budget-row') {
    const data = await airtable('POST', TABLES.budget, {
      records: [{
        fields: {
          'Category':  body.category  || '',
          'Allocated': Number(body.allocated) || 0,
          'Spent':     Number(body.spent) || 0,
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-budget-row') {
    const data = await airtable('PATCH', TABLES.budget, {
      records: [{
        id: body.recordId,
        fields: {
          'Allocated': Number(body.allocated) || 0,
          'Spent':     Number(body.spent) || 0,
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-budget-row') {
    const data = await airtable('DELETE', TABLES.budget, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── SOUND MOMENTS ─────────────────────────────────────────────────────────
  if (action === 'get-soundmoments') {
    const data = await airtable('GET', TABLES.soundmoments, null, '?maxRecords=100');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-soundmoment') {
    const data = await airtable('POST', TABLES.soundmoments, {
      records: [{ fields: { 'Label': body.label || '', 'Note': body.note || '' } }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-soundmoment') {
    const data = await airtable('DELETE', TABLES.soundmoments, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── CONFIRMED CAST (for Producer's Cast Contracts Hub) ───────────────────
  if (action === 'get-cast') {
    const filter = encodeURIComponent(`{Cast Status}="Confirmed"`);
    const data = await airtable('GET', TABLES.casting, null, `?filterByFormula=${filter}&maxRecords=200`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── CASTING DATABASE (callbacks) ─────────────────────────────────────────
  if (action === 'get-casting') {
    const filter = encodeURIComponent(`{Casting Status}="Callback"`);
    const data = await airtable('GET', TABLES.casting, null, `?filterByFormula=${filter}&maxRecords=200`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-casting-status') {
    const fields = {};
    if (body.castStatus)    fields['Cast Status'] = body.castStatus;
    if (body.castingStatus) fields['Casting Status'] = body.castingStatus;
    const data = await airtable('PATCH', TABLES.casting, {
      records: [{ id: body.recordId, fields }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'add-casting-note') {
    const curr = await airtable('GET', TABLES.casting, null, `/${body.recordId}`);
    const existing = (curr.fields || {})['Notes'] || '';
    const stamp = new Date().toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    const line = `[${body.author || 'Unknown'} • ${stamp}]: ${body.note || ''}`;
    const updated = existing ? `${existing}\n${line}` : line;
    const data = await airtable('PATCH', TABLES.casting, {
      records: [{ id: body.recordId, fields: { 'Notes': updated } }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── SETTINGS (e.g. current film name) ────────────────────────────────────
  if (action === 'get-settings') {
    const data = await airtable('GET', TABLES.settings, null, '?maxRecords=50');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-setting') {
    const filter = encodeURIComponent(`{Setting Name}="${body.name}"`);
    const existing = await airtable('GET', TABLES.settings, null, `?filterByFormula=${filter}`);
    const recs = existing.records || [];
    if (recs.length) {
      const data = await airtable('PATCH', TABLES.settings, {
        records: [{ id: recs[0].id, fields: { 'Value': body.value } }],
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } else {
      const data = await airtable('POST', TABLES.settings, {
        records: [{ fields: { 'Setting Name': body.name, 'Value': body.value } }],
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }
  }

  // ── MEETING POLLS (group-availability scheduling) ────────────────────────
  if (action === 'create-poll') {
    const data = await airtable('POST', TABLES.polls, {
      records: [{
        fields: {
          'Title':      body.title || 'Meeting Poll',
          'Options':    body.options || '',
          'Created By': body.createdBy || '',
          'Status':     'Open',
          'Created':    new Date().toISOString(),
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'get-polls') {
    const data = await airtable('GET', TABLES.polls, null, `?sort[0][field]=Created&sort[0][direction]=desc`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // Public — used by the unauthenticated poll response page.
  if (action === 'get-poll') {
    const data = await airtable('GET', TABLES.polls, null, `/${params.id}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-poll') {
    const fields = {};
    if (body.status)    fields['Status'] = body.status;
    if (body.finalTime) fields['Final Time'] = body.finalTime;
    const data = await airtable('PATCH', TABLES.polls, {
      records: [{ id: body.recordId, fields }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-poll') {
    const data = await airtable('DELETE', TABLES.polls, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // Public — submitted from the poll response page.
  if (action === 'submit-poll-response') {
    const data = await airtable('POST', TABLES.pollresponses, {
      records: [{
        fields: {
          'Respondent Name':  body.name || '',
          'Poll Id':          body.pollId || '',
          'Respondent Email': body.email || '',
          'Respondent Role':  body.role || '',
          'Selected Options': (body.selectedOptions || []).join('\n'),
          'Submitted':        new Date().toISOString(),
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'get-poll-results') {
    const filter = encodeURIComponent(`{Poll Id}="${params.pollId || body.pollId || ''}"`);
    const data = await airtable('GET', TABLES.pollresponses, null, `?filterByFormula=${filter}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── CHARACTER CASTING NOTES (per-role brief for self-tape review) ───────────
  if (action === 'get-character-notes') {
    const data = await airtable('GET', TABLES.characternotes, null, '?maxRecords=200');
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'save-character-note') {
    const character = (body.character || '').trim();
    if (!character) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Missing character name' }) };
    const filter = encodeURIComponent(`{Character}="${character.replace(/"/g, '\\"')}"`);
    const existing = await airtable('GET', TABLES.characternotes, null, `?filterByFormula=${filter}`);
    const recs = existing.records || [];
    if (recs.length) {
      const data = await airtable('PATCH', TABLES.characternotes, {
        records: [{ id: recs[0].id, fields: { 'Casting Notes': body.note || '', 'Updated By': body.updatedBy || '', 'Updated': new Date().toISOString() } }],
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } else {
      const data = await airtable('POST', TABLES.characternotes, {
        records: [{ fields: { 'Character': character, 'Casting Notes': body.note || '', 'Updated By': body.updatedBy || '', 'Updated': new Date().toISOString() } }],
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }
  }

  // ── PRODUCTION TASKS (task board) ────────────────────────────────────────
  if (action === 'get-tasks') {
    const data = await airtable('GET', TABLES.tasks, null, `?sort[0][field]=Created&sort[0][direction]=desc&maxRecords=300`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'create-task') {
    const data = await airtable('POST', TABLES.tasks, {
      records: [{
        fields: {
          'Title':       body.title || 'Untitled Task',
          'Description': body.description || '',
          'Assigned To': body.assignedTo || 'Unassigned',
          'Status':      'To Do',
          'Due Date':    body.dueDate || undefined,
          'Created By':  body.createdBy || '',
          'Created':     new Date().toISOString(),
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'update-task') {
    const fields = {};
    if (body.title !== undefined)       fields['Title'] = body.title;
    if (body.description !== undefined) fields['Description'] = body.description;
    if (body.assignedTo !== undefined)  fields['Assigned To'] = body.assignedTo;
    if (body.status !== undefined)      fields['Status'] = body.status;
    if (body.dueDate !== undefined)     fields['Due Date'] = body.dueDate || null;
    const data = await airtable('PATCH', TABLES.tasks, {
      records: [{ id: body.recordId, fields }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-task') {
    const data = await airtable('DELETE', TABLES.tasks, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // ── PUSHED NOTES (cross-department / cross-person push) ─────────────────
  if (action === 'push-note') {
    const data = await airtable('POST', TABLES.pushednotes, {
      records: [{
        fields: {
          'Title':           body.title || 'Note',
          'Content':         body.content || '',
          'From Department': body.fromDept || '',
          'From Person':     body.fromPerson || '',
          'To Department':   body.toDept || 'all',
          'To Person':       body.toPerson || '',
          'Created':         new Date().toISOString(),
        },
      }],
    });
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'get-pushed-notes') {
    const dept = params.dept || '';
    const filter = encodeURIComponent(`OR({To Department}="${dept}",{To Department}="all")`);
    const data = await airtable('GET', TABLES.pushednotes, null, `?filterByFormula=${filter}&sort[0][field]=Created&sort[0][direction]=desc&maxRecords=200`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (action === 'delete-pushed-note') {
    const data = await airtable('DELETE', TABLES.pushednotes, null, `?records[]=${body.recordId}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
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
