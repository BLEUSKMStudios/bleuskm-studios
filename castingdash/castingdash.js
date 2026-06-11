/* ─── Config ────────────────────────────────────────────────── */
const CONFIG = {
  AIRTABLE_API_KEY: '',
  BASE_ID:          'appXf1NxIVhYbuV4j',
  TABLE_NAME:       'Casting Submissions',
  BREVO_API_KEY:    '',
  TEMPLATE: {
    CALLBACK:  15,
    REDIRECT:  17,
    REJECTION: 16,
  },
};

/* ─── State ─────────────────────────────────────────────────── */
let allRecords    = [];
let activeFilter  = 'All';
let sentEmails    = {}; // recordId -> Set of sent types

/* ─── DOM refs ───────────────────────────────────────────────── */
const el = {
  loading:     document.getElementById('stateLoading'),
  error:       document.getElementById('stateError'),
  errorMsg:    document.getElementById('stateErrorMsg'),
  empty:       document.getElementById('stateEmpty'),
  tableWrap:   document.getElementById('tableWrap'),
  tbody:       document.getElementById('castingTableBody'),
  recordCount: document.getElementById('recordCount'),
  filterTally: document.getElementById('filterTally'),
  refreshBtn:  document.getElementById('refreshBtn'),
  toastStack:  document.getElementById('toastStack'),
};

/* ─── Init ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadSubmissions();
  bindFilters();
  el.refreshBtn.addEventListener('click', () => loadSubmissions());
});

/* ─── Airtable fetch ─────────────────────────────────────────── */
async function loadSubmissions() {
  showState('loading');

  try {
    const res = await fetch(
  `/.netlify/functions/airtable-proxy?table=${encodeURIComponent(CONFIG.TABLE_NAME)}`
);

    if (!res.ok) {
      throw new Error(`Proxy error ${res.status}`);
    }

    const data = await res.json();
    const records = data.records || [];

    allRecords = records;
    el.recordCount.textContent = `${records.length} submission${records.length !== 1 ? 's' : ''}`;
    renderTable();

  } catch (err) {
    el.errorMsg.textContent = err.message || 'Could not load submissions.';
    showState('error');
  }
}
/* ─── Filter ────────────────────────────────────────────────── */
function bindFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderTable();
    });
  });
}

function getFiltered() {
  if (activeFilter === 'All') return allRecords;
  return allRecords.filter(r => {
    const status = (r.fields['Casting Status'] || '').trim();
    return status === activeFilter;
  });
}

/* ─── Render ─────────────────────────────────────────────────── */
function renderTable() {
  const records = getFiltered();

  el.filterTally.textContent = `${records.length} shown`;

  if (records.length === 0) {
    showState('empty');
    return;
  }

  el.tbody.innerHTML = '';
  records.forEach(record => buildRow(record));
  showState('table');
}

function buildRow(record) {
  const f      = record.fields;
  const id     = record.id;
  const email  = (f['Email'] || '').trim();
  const role   = (f['Role'] || '—').trim();
  const status = (f['Casting Status'] || '').trim();
const rawFilm = f['Callback/Redirect'];

let film = '';

if (Array.isArray(rawFilm)) {
  film = rawFilm
    .map(item => (typeof item === 'object' ? item.name : item))
    .join(', ');
} else if (typeof rawFilm === 'string') {
  film = rawFilm.trim();
}

  const tr = document.createElement('tr');
  tr.dataset.id = id;

  tr.innerHTML = `
    <td><span class="cell-email">${escHtml(email) || '—'}</span></td>
    <td><span class="cell-role">${escHtml(role)}</span></td>
    <td>${statusBadge(status)}</td>
    <td>
      <div class="action-group">
        <button
          class="action-btn btn-callback"
          data-id="${id}"
          data-type="callback"
          ${alreadySent(id, 'callback') ? 'disabled data-sent="true"' : ''}>
          ${alreadySent(id, 'callback') ? 'Sent' : 'Callback'}
        </button>
        <button
          class="action-btn btn-redirect"
          data-id="${id}"
          data-type="redirect"
          ${alreadySent(id, 'redirect') ? 'disabled data-sent="true"' : ''}>
          ${alreadySent(id, 'redirect') ? 'Sent' : 'Redirect'}
        </button>
        <button
          class="action-btn btn-reject"
          data-id="${id}"
          data-type="reject"
          ${alreadySent(id, 'reject') ? 'disabled data-sent="true"' : ''}>
          ${alreadySent(id, 'reject') ? 'Sent' : 'Reject'}
        </button>
      </div>
    </td>
  `;

  tr.querySelectorAll('.action-btn').forEach(btn => {
    if (!btn.disabled) {
      btn.addEventListener('click', () => handleAction(btn, record));
    }
  });

  el.tbody.appendChild(tr);
}

function statusBadge(status) {
  const map = {
    'Callback': 'callback',
    'Redirect': 'redirect',
    'Rejected': 'rejected',
  };
  const cls = map[status] || 'unknown';
  return `<span class="status-badge ${cls}">${escHtml(status) || 'Unknown'}</span>`;
}

/* ─── Email actions ──────────────────────────────────────────── */
async function handleAction(btn, record) {
  const f     = record.fields;
  const id    = record.id;
  const email = (f['Email'] || '').trim();
  const role  = (f['Role'] || '').trim();
  const film  = (f['Callback/Redirect'] || '').trim();
  const type  = btn.dataset.type;

  if (!email) {
    toast('No email address for this record.', 'error');
    return;
  }

  const selfTapeLink = buildSelfTapeLink(email, role);

  let templateId;
  let params = { ROLE: role, FILM_NAME: film, SELFTAPE_URL: selfTapeLink };

  if (type === 'callback') {
    templateId = CONFIG.TEMPLATE.CALLBACK;
  } else if (type === 'redirect') {
    templateId = CONFIG.TEMPLATE.REDIRECT;
  } else if (type === 'reject') {
    templateId = CONFIG.TEMPLATE.REJECTION;
  }

  btn.classList.add('sending');
  btn.textContent = '…';

  try {
    await sendBrevoEmail(email, templateId, params);
    markSent(id, type);
    btn.classList.remove('sending');
    btn.classList.add('sent');
    btn.textContent = 'Sent';
    btn.disabled = true;
    toast(`Email sent to ${email}`, 'success');
  } catch (err) {
    btn.classList.remove('sending');
    btn.textContent = type === 'callback' ? 'Callback' : type === 'redirect' ? 'Redirect' : 'Reject';
    toast(`Failed: ${err.message}`, 'error');
  }
}

/* ─── Brevo API ──────────────────────────────────────────────── */
async function sendBrevoEmail(email, templateId, params) {
  const res = await fetch('/.netlify/functions/brevo-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      templateId,
      params
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Proxy error ${res.status}`);
  }

  return res.json();
}
/* ─── Self-tape link ─────────────────────────────────────────── */
function buildSelfTapeLink(email, role) {
  const name = email.split('@')[0] || '';
  return (
    'https://bleuskm.com/selftape' +
    '?name=' + encodeURIComponent(name) +
    '&role=' + encodeURIComponent(role) +
    '&email=' + encodeURIComponent(email)
  );
}

/* ─── Sent tracking (session) ────────────────────────────────── */
function markSent(id, type) {
  if (!sentEmails[id]) sentEmails[id] = new Set();
  sentEmails[id].add(type);
}

function alreadySent(id, type) {
  return sentEmails[id]?.has(type) || false;
}

/* ─── UI state helpers ───────────────────────────────────────── */
function showState(state) {
  el.loading.classList.add('hidden');
  el.error.classList.add('hidden');
  el.empty.classList.add('hidden');
  el.tableWrap.classList.add('hidden');

  if (state === 'loading') el.loading.classList.remove('hidden');
  else if (state === 'error') el.error.classList.remove('hidden');
  else if (state === 'empty') el.empty.classList.remove('hidden');
  else if (state === 'table') el.tableWrap.classList.remove('hidden');
}

/* ─── Toast ──────────────────────────────────────────────────── */
function toast(message, type = 'success') {
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.textContent = message;
  el.toastStack.appendChild(div);

  setTimeout(() => {
    div.classList.add('toast-out');
    div.addEventListener('animationend', () => div.remove(), { once: true });
  }, 3800);
}

/* ─── Utilities ──────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
