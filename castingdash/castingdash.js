/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Casting Portal
   castingdash.js
═══════════════════════════════════════════════════════════════ */

/* ── Auth guard ─────────────────────────────────────────────── */
(function authGuard() {
  if (sessionStorage.getItem('bleuskm_auth') !== 'true') {
    window.location.replace('./login.html');
  }
})();

/* ── Constants ──────────────────────────────────────────────── */
const TABLE        = 'Casting Submissions';
const AIRTABLE_URL = '/.netlify/functions/airtable-proxy';
const BREVO_URL    = '/.netlify/functions/brevo-proxy';
const BREVO_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const TEMPLATE = {
  Callback: 15,
  Redirect: 17,
  Pass:     null,   // no email
};

const FILM_LINK = 'https://bleuskm.com/my-productions/#notify';

/* ── State ──────────────────────────────────────────────────── */
let allRecords   = [];   // raw from Airtable
let activeFilter = 'All';
let searchQuery  = '';
let selectedIds  = new Set();
let sentMap      = {};   // recordId → true (session-only)

/* ── DOM refs ───────────────────────────────────────────────── */
const el = {
  loading:      document.getElementById('stateLoading'),
  error:        document.getElementById('stateError'),
  errorMsg:     document.getElementById('stateErrorMsg'),
  empty:        document.getElementById('stateEmpty'),
  tableWrap:    document.getElementById('tableWrap'),
  tbody:        document.getElementById('castingTableBody'),
  recordCount:  document.getElementById('recordCount'),
  refreshBtn:   document.getElementById('refreshBtn'),
  logoutBtn:    document.getElementById('logoutBtn'),
  userChip:     document.getElementById('userChip'),
  selectAll:    document.getElementById('selectAll'),
  searchInput:  document.getElementById('searchInput'),
  searchClear:  document.getElementById('searchClear'),
  batchCount:   document.getElementById('batchCount'),
  batchSendBtn: document.getElementById('batchSendBtn'),
  retryBtn:     document.getElementById('retryBtn'),
  toastStack:   document.getElementById('toastStack'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Show logged-in user
  const user = sessionStorage.getItem('bleuskm_user') || '';
  el.userChip.textContent = user.toUpperCase();

  loadSubmissions();
  bindFilters();
  bindSearch();
  bindBatch();
  bindSelectAll();

  el.refreshBtn.addEventListener('click', loadSubmissions);
  el.retryBtn.addEventListener('click', loadSubmissions);
  el.logoutBtn.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.replace('./login.html');
  });
});

/* ════════════════════════════════════════════════════════════════
   AIRTABLE — FETCH ALL
════════════════════════════════════════════════════════════════ */
async function loadSubmissions() {
  showState('loading');
  selectedIds.clear();
  updateBatchUI();

  try {
    // Airtable GET paginates at 100; loop via offset
    let records = [];
    let offset  = null;

    do {
      const qs  = offset
        ? `?table=${encodeURIComponent(TABLE)}&offset=${offset}`
        : `?table=${encodeURIComponent(TABLE)}`;
      const res = await fetch(`${AIRTABLE_URL}${qs}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Airtable ${res.status}`);
      }

      const data = await res.json();
      records    = records.concat(data.records || []);
      offset     = data.offset || null;
    } while (offset);

    allRecords = records;
    el.recordCount.textContent = `${records.length} submission${records.length !== 1 ? 's' : ''}`;
    renderTable();

  } catch (err) {
    el.errorMsg.textContent = err.message || 'Could not load submissions.';
    showState('error');
  }
}

/* ════════════════════════════════════════════════════════════════
   AIRTABLE — PATCH (inline edit)
════════════════════════════════════════════════════════════════ */
async function patchRecord(recordId, fields) {
  const res = await fetch(AIRTABLE_URL, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ table: TABLE, id: recordId, fields }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Patch failed ${res.status}`);
  }

  return res.json();
}

/* ════════════════════════════════════════════════════════════════
   BREVO — SEND EMAIL
════════════════════════════════════════════════════════════════ */
async function sendBrevoEmail(email, templateId, params) {
  const res = await fetch(BREVO_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      endpoint: BREVO_EMAIL_ENDPOINT,
      payload: {
        to:         [{ email }],
        templateId,
        params,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Brevo ${res.status}`);
  }

  return res.json();
}

/* ════════════════════════════════════════════════════════════════
   EMAIL DISPATCH — single record
════════════════════════════════════════════════════════════════ */
async function dispatchEmail(record, btn) {
  const f      = record.fields;
  const email  = (f['Email'] || '').trim();
  const role   = (f['Role']  || '').trim();
  const status = (f['Casting Status'] || '').trim();

  if (!email) { toast('No email address for this record.', 'error'); return; }

  const templateId = TEMPLATE[status];
  if (!templateId)  { toast('No email template for this status.', 'error'); return; }

  // Build params
  const params = { ROLE: role };

  if (status === 'Callback') {
    // Self-tape link uses name derived from email prefix
    const name = email.split('@')[0];
    params.SELFTAPE_URL = buildSelfTapeLink(name, role, email);
  }

  if (status === 'Redirect') {
    // Callback/Redirect is a multi-select → array of film names
    const films   = f['Callback/Redirect'] || [];
    const filmArr = Array.isArray(films) ? films : [films];
    params.FILM_NAME = filmArr.filter(Boolean).join(', ') || '';
    params.FILM_LINK = FILM_LINK;
  }

  // UI feedback
  if (btn) {
    btn.classList.add('sending');
    btn.textContent = '…';
  }

  try {
    await sendBrevoEmail(email, templateId, params);
    sentMap[record.id] = true;

    if (btn) {
      btn.classList.remove('sending');
      btn.classList.add('sent');
      btn.textContent = 'Sent ✓';
      btn.disabled    = true;
    }

    toast(`Email sent → ${email}`, 'success');

  } catch (err) {
    if (btn) {
      btn.classList.remove('sending');
      btn.textContent = 'Send Email';
    }
    toast(`Failed: ${err.message}`, 'error');
    throw err; // let batch catch it
  }
}

/* ════════════════════════════════════════════════════════════════
   FILTER + SEARCH
════════════════════════════════════════════════════════════════ */
function bindFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      selectedIds.clear();
      updateBatchUI();
      renderTable();
    });
  });
}

function bindSearch() {
  el.searchInput.addEventListener('input', () => {
    searchQuery = el.searchInput.value.trim().toLowerCase();
    el.searchClear.classList.toggle('hidden', !searchQuery);
    selectedIds.clear();
    updateBatchUI();
    renderTable();
  });

  el.searchClear.addEventListener('click', () => {
    el.searchInput.value = '';
    searchQuery = '';
    el.searchClear.classList.add('hidden');
    selectedIds.clear();
    updateBatchUI();
    renderTable();
    el.searchInput.focus();
  });
}

function getVisible() {
  return allRecords.filter(r => {
    const f      = r.fields;
    const status = (f['Casting Status'] || '').trim();

    // Filter
    if (activeFilter !== 'All' && status !== activeFilter) return false;

    // Search
    if (searchQuery) {
      const haystack = [
        f['Email']    || '',
        f['Role']     || '',
        f['Location'] || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }

    return true;
  });
}

/* ════════════════════════════════════════════════════════════════
   BATCH EMAIL
════════════════════════════════════════════════════════════════ */
function bindBatch() {
  el.batchSendBtn.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;

    el.batchSendBtn.disabled    = true;
    el.batchSendBtn.textContent = 'Sending…';

    const targets = allRecords.filter(r => selectedIds.has(r.id));
    let ok = 0, fail = 0;

    for (const record of targets) {
      const status = (record.fields['Casting Status'] || '').trim();
      if (!TEMPLATE[status]) { fail++; continue; }

      try {
        await dispatchEmail(record, null);
        // update the matching row button if visible
        const rowBtn = document.querySelector(`[data-action-id="${record.id}"]`);
        if (rowBtn) {
          rowBtn.classList.add('sent');
          rowBtn.textContent = 'Sent ✓';
          rowBtn.disabled    = true;
        }
        ok++;
      } catch { fail++; }

      // Small delay to avoid Brevo rate limits
      await sleep(300);
    }

    el.batchSendBtn.disabled    = false;
    el.batchSendBtn.textContent = 'Send Emails to Selected';

    toast(`Batch complete: ${ok} sent${fail ? `, ${fail} failed` : ''}`, fail ? 'error' : 'success');
    selectedIds.clear();
    updateBatchUI();
    renderTable();
  });
}

function bindSelectAll() {
  el.selectAll.addEventListener('change', () => {
    const visible = getVisible();
    if (el.selectAll.checked) {
      visible.forEach(r => {
        if (TEMPLATE[(r.fields['Casting Status'] || '').trim()]) {
          selectedIds.add(r.id);
        }
      });
    } else {
      visible.forEach(r => selectedIds.delete(r.id));
    }
    updateBatchUI();
    renderTable();
  });
}

function updateBatchUI() {
  const count = selectedIds.size;
  el.batchCount.textContent = `${count} selected`;
  el.batchCount.classList.toggle('hidden', count === 0);
  el.batchSendBtn.classList.toggle('hidden', count === 0);
}

/* ════════════════════════════════════════════════════════════════
   RENDER TABLE
════════════════════════════════════════════════════════════════ */
function renderTable() {
  const records = getVisible();

  if (records.length === 0) {
    showState('empty');
    return;
  }

  el.tbody.innerHTML = '';
  records.forEach(r => buildRow(r));
  showState('table');

  // Sync select-all checkbox state
  const emailable = records.filter(r => TEMPLATE[(r.fields['Casting Status'] || '').trim()]);
  const allSel    = emailable.length > 0 && emailable.every(r => selectedIds.has(r.id));
  el.selectAll.checked       = allSel;
  el.selectAll.indeterminate = !allSel && selectedIds.size > 0;
}

/* ── Build one table row ─────────────────────────────────────── */
function buildRow(record) {
  const f      = record.fields;
  const id     = record.id;
  const email  = (f['Email']    || '').trim();
  const phone  = (f['Phone']    || '').trim();
  const age    = (f['Age']      || '').toString().trim();
  const role   = (f['Role']     || '—').trim();
  const loc    = (f['Location'] || '').trim();
  const about  = (f['About']    || '').trim();
  const reel   = (f['Reel/Portfolio Link'] || '').trim();
  const status = (f['Casting Status'] || '').trim();
  const films  = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(films) ? films : (films ? [films] : []);

  const isSelected   = selectedIds.has(id);
  const alreadySent  = sentMap[id] || false;
  const templateId   = TEMPLATE[status];
  const isPass       = status === 'Pass';

  const tr = document.createElement('tr');
  tr.dataset.id = id;
  if (isSelected) tr.classList.add('row-selected');

  // ── Checkbox ──
  const tdCheck = document.createElement('td');
  tdCheck.className = 'col-check';
  if (!isPass && templateId) {
    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = isSelected;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(id);
      else            selectedIds.delete(id);
      tr.classList.toggle('row-selected', cb.checked);
      updateBatchUI();
      // sync header checkbox
      const visible  = getVisible();
      const emailable = visible.filter(r => TEMPLATE[(r.fields['Casting Status'] || '').trim()]);
      el.selectAll.checked = emailable.length > 0 && emailable.every(r => selectedIds.has(r.id));
      el.selectAll.indeterminate = !el.selectAll.checked && selectedIds.size > 0;
    });
    tdCheck.appendChild(cb);
  }
  tr.appendChild(tdCheck);

  // ── Email ──
  tr.appendChild(cell(`<span class="cell-email">${esc(email) || '—'}</span>`));

  // ── Phone (editable) ──
  tr.appendChild(editableCell(id, phone, 'Phone', 'cell-phone'));

  // ── Age ──
  tr.appendChild(cell(`<span style="font-size:12px;color:var(--text-muted)">${esc(age) || '—'}</span>`));

  // ── Role ──
  tr.appendChild(cell(`<span class="cell-role">${esc(role)}</span>`));

  // ── Location (editable) ──
  tr.appendChild(editableCell(id, loc, 'Location', 'cell-location'));

  // ── About (editable, truncated) ──
  tr.appendChild(editableCell(id, about, 'About', 'cell-about'));

  // ── Reel ──
  const reelHtml = reel
    ? `<span class="cell-reel"><a href="${esc(reel)}" target="_blank" rel="noopener">View ↗</a></span>`
    : `<span style="color:var(--text-dim);font-size:11px;">—</span>`;
  tr.appendChild(cell(reelHtml));

  // ── Status badge + redirect films ──
  let statusHtml = statusBadge(status);
  if (status === 'Redirect' && filmArr.length) {
    statusHtml += `<span style="display:block;font-size:9px;letter-spacing:0.06em;color:var(--redirect);opacity:0.75;margin-top:4px;line-height:1.4;">${filmArr.map(esc).join('<br>')}</span>`;
  }
  tr.appendChild(cell(statusHtml));

  // ── Action button ──
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';

  if (!isPass && templateId) {
    const btn = document.createElement('button');
    btn.className        = `action-btn btn-${status.toLowerCase()}`;
    btn.dataset.actionId = id;
    btn.textContent      = alreadySent ? 'Sent ✓' : 'Send Email';
    if (alreadySent) {
      btn.classList.add('sent');
      btn.disabled = true;
    }
    btn.addEventListener('click', () => dispatchEmail(record, btn));
    tdAction.appendChild(btn);
  } else {
    tdAction.innerHTML = `<span style="font-size:9px;color:var(--text-dim);letter-spacing:0.1em;">—</span>`;
  }

  tr.appendChild(tdAction);
  el.tbody.appendChild(tr);
}

/* ── Editable cell (Phone, Location, About) ─────────────────── */
function editableCell(recordId, value, fieldName, className) {
  const td  = document.createElement('td');
  const div = document.createElement('div');

  div.className       = `editable ${className}`;
  div.contentEditable = 'true';
  div.textContent     = value;
  div.setAttribute('data-original', value);
  div.setAttribute('aria-label', `Edit ${fieldName}`);

  // Save on blur if changed
  div.addEventListener('blur', async () => {
    const newVal  = div.textContent.trim();
    const origVal = div.getAttribute('data-original');
    if (newVal === origVal) return;

    div.classList.add('saving');
    try {
      await patchRecord(recordId, { [fieldName]: newVal });
      div.setAttribute('data-original', newVal);
      div.classList.remove('saving');
      div.classList.add('saved');
      setTimeout(() => div.classList.remove('saved'), 1400);

      // Update local state so filter/search reflects change
      const rec = allRecords.find(r => r.id === recordId);
      if (rec) rec.fields[fieldName] = newVal;

    } catch (err) {
      div.textContent = origVal;
      div.classList.remove('saving');
      div.classList.add('err');
      setTimeout(() => div.classList.remove('err'), 1400);
      toast(`Save failed: ${err.message}`, 'error');
    }
  });

  // Prevent newlines in single-line fields
  if (fieldName !== 'About') {
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); div.blur(); }
    });
  }

  td.appendChild(div);
  return td;
}

/* ════════════════════════════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════════════════════════════ */
function showState(state) {
  el.loading.classList.add('hidden');
  el.error.classList.add('hidden');
  el.empty.classList.add('hidden');
  el.tableWrap.classList.add('hidden');

  if      (state === 'loading') el.loading.classList.remove('hidden');
  else if (state === 'error')   el.error.classList.remove('hidden');
  else if (state === 'empty')   el.empty.classList.remove('hidden');
  else if (state === 'table')   el.tableWrap.classList.remove('hidden');
}

function cell(innerHTML) {
  const td = document.createElement('td');
  td.innerHTML = innerHTML;
  return td;
}

function statusBadge(status) {
  const cls = { Callback: 'callback', Redirect: 'redirect', Pass: 'pass' }[status] || 'unknown';
  return `<span class="status-badge ${cls}">${esc(status) || 'Unknown'}</span>`;
}

function buildSelfTapeLink(name, role, email) {
  return 'https://bleuskm.com/selftape'
    + '?name='  + encodeURIComponent(name)
    + '&role='  + encodeURIComponent(role)
    + '&email=' + encodeURIComponent(email);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Toast ───────────────────────────────────────────────────── */
function toast(message, type = 'success') {
  const div = document.createElement('div');
  div.className   = `toast toast-${type}`;
  div.textContent = message;
  el.toastStack.appendChild(div);
  setTimeout(() => {
    div.classList.add('toast-out');
    div.addEventListener('animationend', () => div.remove(), { once: true });
  }, 4000);
}
