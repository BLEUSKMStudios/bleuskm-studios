/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Casting Portal v2
   castingdash.js
═══════════════════════════════════════════════════════════════ */

/* ── Auth guard ─────────────────────────────────────────────── */
(function () {
  if (sessionStorage.getItem('bleuskm_auth') !== 'true') {
    window.location.replace('./login.html');
  }
})();

/* ── Config ─────────────────────────────────────────────────── */
const CFG = {
  TABLE:        'Casting Submissions',
  AIRTABLE:     '/.netlify/functions/airtable-proxy',
  BREVO:        '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:  'https://api.brevo.com/v3/smtp/email',
  CALENDLY:     'https://calendly.com/studio-bleuskm/30min',
  FILM_LINK:    'https://bleuskm.com/my-productions/#notify',
  TEMPLATE: {
    Callback:   15,
    Redirect:   17,
    Pass:       16,
  },
};

/* ── State ──────────────────────────────────────────────────── */
let allRecords   = [];
let activeFilter = 'All';
let searchQuery  = '';
let selectedIds  = new Set();
let sentMap      = {};        // recordId → true
let pendingRedirect = null;   // { record, btn } waiting for modal

/* ── DOM ────────────────────────────────────────────────────── */
const el = {
  loading:     document.getElementById('stateLoading'),
  error:       document.getElementById('stateError'),
  errorMsg:    document.getElementById('stateErrorMsg'),
  empty:       document.getElementById('stateEmpty'),
  tableWrap:   document.getElementById('tableWrap'),
  tbody:       document.getElementById('castingTableBody'),
  recordCount: document.getElementById('recordCount'),
  refreshBtn:  document.getElementById('refreshBtn'),
  logoutBtn:   document.getElementById('logoutBtn'),
  userChip:    document.getElementById('userChip'),
  selectAll:   document.getElementById('selectAll'),
  searchInput: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  batchCount:  document.getElementById('batchCount'),
  batchSendBtn:document.getElementById('batchSendBtn'),
  retryBtn:    document.getElementById('retryBtn'),
  toastStack:  document.getElementById('toastStack'),
  // Modal
  redirectModal:  document.getElementById('redirectModal'),
  filmSelect:     document.getElementById('filmSelect'),
  customFilmGroup:document.getElementById('customFilmGroup'),
  customFilmInput:document.getElementById('customFilmInput'),
  modalActorName: document.getElementById('modalActorName'),
  modalCancel:    document.getElementById('modalCancel'),
  modalSend:      document.getElementById('modalSend'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  el.userChip.textContent = (sessionStorage.getItem('bleuskm_user') || '').toUpperCase();

  loadSubmissions();

  el.refreshBtn.addEventListener('click', loadSubmissions);
  el.retryBtn.addEventListener('click', loadSubmissions);
  el.logoutBtn.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.replace('./login.html');
  });

  bindFilters();
  bindSearch();
  bindBatch();
  bindSelectAll();
  bindModal();
});

/* ═══════════════════════════════════════════════════════════════
   AIRTABLE
═══════════════════════════════════════════════════════════════ */
async function loadSubmissions() {
  showState('loading');
  selectedIds.clear();
  updateBatchUI();

  try {
    let records = [], offset = null;
    do {
      const qs  = `?table=${encodeURIComponent(CFG.TABLE)}${offset ? '&offset=' + offset : ''}`;
      const res = await fetch(CFG.AIRTABLE + qs);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Airtable ${res.status}`); }
      const data = await res.json();
      records = records.concat(data.records || []);
      offset  = data.offset || null;
    } while (offset);

    allRecords = records;
    el.recordCount.textContent = `${records.length} submission${records.length !== 1 ? 's' : ''}`;
    renderTable();
  } catch (err) {
    el.errorMsg.textContent = err.message || 'Could not load submissions.';
    showState('error');
  }
}

async function patchRecord(id, fields) {
  const res = await fetch(CFG.AIRTABLE, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ table: CFG.TABLE, id, fields }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Patch ${res.status}`); }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════
   BREVO
═══════════════════════════════════════════════════════════════ */
async function sendEmail(email, templateId, params) {
  const res = await fetch(CFG.BREVO, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      endpoint: CFG.BREVO_EMAIL,
      payload:  { to: [{ email }], templateId, params },
    }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || `Brevo ${res.status}`); }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL DISPATCH
═══════════════════════════════════════════════════════════════ */
async function dispatchEmail(record, btn, overrideFilm) {
  const f      = record.fields;
  const email  = (f['Email'] || '').trim();
  const name   = (f['Name']  || '').trim();
  const role   = (f['Role']  || '').trim();
  const status = (f['Casting Status'] || '').trim();
  const tplId  = CFG.TEMPLATE[status];

  if (!email)  { toast('No email address on this record.', 'error'); return; }
  if (!tplId)  { toast('No template mapped for this status.', 'error'); return; }

  // Redirect requires film — open modal if not provided
  if (status === 'Redirect' && !overrideFilm) {
    openRedirectModal(record, btn);
    return;
  }

  const params = { ROLE: role, NAME: name };

  if (status === 'Callback') {
    params.SELFTAPE_URL = buildSelfTapeLink(name, role, email);
    params.CALENDLY_URL = CFG.CALENDLY;
  }

  if (status === 'Redirect') {
    params.FILM_NAME = overrideFilm;
    params.FILM_LINK = CFG.FILM_LINK;
  }

  setBtnState(btn, 'sending', '…');
  try {
    await sendEmail(email, tplId, params);
    sentMap[record.id] = true;
    setBtnState(btn, 'sent', 'Sent ✓');
    updateEmailBadge(record.id);
    toast(`Email sent → ${email}`, 'success');
  } catch (err) {
    setBtnState(btn, 'idle', actionLabel(status));
    toast(`Failed: ${err.message}`, 'error');
    throw err;
  }
}

function setBtnState(btn, state, label) {
  if (!btn) return;
  btn.classList.remove('sending', 'sent');
  if (state === 'sending') btn.classList.add('sending');
  if (state === 'sent')    { btn.classList.add('sent'); btn.disabled = true; }
  btn.textContent = label;
}

function actionLabel(status) {
  return status === 'Callback' ? 'Send Callback'
       : status === 'Redirect' ? 'Send Redirect'
       : status === 'Pass'     ? 'Send Rejection'
       : 'Send Email';
}

function updateEmailBadge(recordId) {
  const badge = document.querySelector(`[data-email-badge="${recordId}"]`);
  if (badge) {
    badge.textContent = 'Sent';
    badge.className   = 'email-badge sent';
  }
}

/* ── Self-tape link ─────────────────────────────────────────── */
function buildSelfTapeLink(name, role, email) {
  return 'https://bleuskm.com/selftape'
    + '?name='  + encodeURIComponent(name)
    + '&role='  + encodeURIComponent(role)
    + '&email=' + encodeURIComponent(email);
}

/* ═══════════════════════════════════════════════════════════════
   REDIRECT MODAL
═══════════════════════════════════════════════════════════════ */
function openRedirectModal(record, btn) {
  pendingRedirect = { record, btn };

  const f     = record.fields;
  const name  = (f['Name'] || f['Email'] || '').trim();
  const films = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(films) ? films : (films ? [films] : []);

  el.modalActorName.textContent = name;

  // Pre-select first film from Airtable if available
  el.filmSelect.value = '';
  if (filmArr.length) {
    // Try to match to an option
    const match = Array.from(el.filmSelect.options).find(o => o.value === filmArr[0]);
    if (match) el.filmSelect.value = filmArr[0];
    else {
      el.filmSelect.value = '__custom';
      el.customFilmInput.value = filmArr[0];
      el.customFilmGroup.classList.remove('hidden');
    }
  }

  el.customFilmGroup.classList.toggle('hidden', el.filmSelect.value !== '__custom');
  el.redirectModal.classList.remove('hidden');
}

function bindModal() {
  el.filmSelect.addEventListener('change', () => {
    el.customFilmGroup.classList.toggle('hidden', el.filmSelect.value !== '__custom');
  });

  el.modalCancel.addEventListener('click', closeModal);
  el.redirectModal.addEventListener('click', e => { if (e.target === el.redirectModal) closeModal(); });

  el.modalSend.addEventListener('click', async () => {
    let film = el.filmSelect.value;
    if (film === '__custom') film = el.customFilmInput.value.trim();
    if (!film) { toast('Please select or enter a film name.', 'error'); return; }

    const { record, btn } = pendingRedirect;
    closeModal();

    try {
      await dispatchEmail(record, btn, film);
    } catch { /* already toasted */ }
  });
}

function closeModal() {
  el.redirectModal.classList.add('hidden');
  el.filmSelect.value = '';
  el.customFilmInput.value = '';
  el.customFilmGroup.classList.add('hidden');
  pendingRedirect = null;
}

/* ═══════════════════════════════════════════════════════════════
   FILTER + SEARCH
═══════════════════════════════════════════════════════════════ */
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
    if (activeFilter !== 'All' && status !== activeFilter) return false;
    if (searchQuery) {
      const hay = [f['Name'] || '', f['Email'] || '', f['Role'] || '', f['Location'] || ''].join(' ').toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════
   BATCH EMAIL
═══════════════════════════════════════════════════════════════ */
function bindBatch() {
  el.batchSendBtn.addEventListener('click', async () => {
    if (!selectedIds.size) return;
    el.batchSendBtn.disabled    = true;
    el.batchSendBtn.textContent = 'Sending…';

    const targets = allRecords.filter(r => selectedIds.has(r.id));
    let ok = 0, skip = 0, fail = 0;

    for (const record of targets) {
      const status = (record.fields['Casting Status'] || '').trim();
      if (!CFG.TEMPLATE[status]) { skip++; continue; }

      // Redirect needs film — use first from Airtable field or skip in batch
      if (status === 'Redirect') {
        const films   = record.fields['Callback/Redirect'] || [];
        const filmArr = Array.isArray(films) ? films : (films ? [films] : []);
        const film    = filmArr[0] || '';
        if (!film) { skip++; continue; }
        const rowBtn = document.querySelector(`[data-action-id="${record.id}"]`);
        try {
          await dispatchEmail(record, rowBtn, film);
          ok++;
        } catch { fail++; }
      } else {
        const rowBtn = document.querySelector(`[data-action-id="${record.id}"]`);
        try {
          await dispatchEmail(record, rowBtn);
          ok++;
        } catch { fail++; }
      }
      await sleep(280);
    }

    el.batchSendBtn.disabled    = false;
    el.batchSendBtn.textContent = 'Send Emails to Selected';
    toast(`Batch: ${ok} sent${skip ? `, ${skip} skipped` : ''}${fail ? `, ${fail} failed` : ''}`, fail ? 'error' : 'success');
    selectedIds.clear();
    updateBatchUI();
    renderTable();
  });
}

function bindSelectAll() {
  el.selectAll.addEventListener('change', () => {
    const visible = getVisible();
    if (el.selectAll.checked) visible.forEach(r => selectedIds.add(r.id));
    else                       visible.forEach(r => selectedIds.delete(r.id));
    updateBatchUI();
    renderTable();
  });
}

function updateBatchUI() {
  const n = selectedIds.size;
  el.batchCount.textContent = `${n} selected`;
  el.batchCount.classList.toggle('hidden', n === 0);
  el.batchSendBtn.classList.toggle('hidden', n === 0);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════════ */
function renderTable() {
  const records = getVisible();
  if (!records.length) { showState('empty'); return; }

  el.tbody.innerHTML = '';
  records.forEach(r => buildRow(r));
  showState('table');

  // Sync select-all state
  const allSel = records.length > 0 && records.every(r => selectedIds.has(r.id));
  el.selectAll.checked       = allSel;
  el.selectAll.indeterminate = !allSel && selectedIds.size > 0;
}

/* ── Build row ──────────────────────────────────────────────── */
function buildRow(record) {
  const f      = record.fields;
  const id     = record.id;

  const name   = (f['Name']     || '').trim();
  const email  = (f['Email']    || '').trim();
  const phone  = (f['Phone']    || '').trim();
  const role   = (f['Role']     || '—').trim();
  const film   = (f['Film']     || '').trim();
  const loc    = (f['Location'] || '').trim();
  const reel   = (f['Reel/Portfolio Link'] || '').trim();
  const head   = (f['Headshot'] || '').trim();
  const status = (f['Casting Status'] || '').trim();
  const notes  = (f['Notes']    || '').trim();
  const redirectFilms = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(redirectFilms) ? redirectFilms : (redirectFilms ? [redirectFilms] : []);

  const isSelected = selectedIds.has(id);
  const alreadySent = sentMap[id] || false;

  const tr = document.createElement('tr');
  tr.dataset.id = id;
  if (isSelected) tr.classList.add('row-sel');

  // ── Checkbox ──────────────────────────────────────────────
  const tdCb = document.createElement('td');
  tdCb.className = 'col-check';
  const cb = document.createElement('input');
  cb.type    = 'checkbox';
  cb.checked = isSelected;
  cb.addEventListener('change', () => {
    if (cb.checked) selectedIds.add(id);
    else            selectedIds.delete(id);
    tr.classList.toggle('row-sel', cb.checked);
    updateBatchUI();
    syncSelectAll();
  });
  tdCb.appendChild(cb);
  tr.appendChild(tdCb);

  // ── Name ──────────────────────────────────────────────────
  tr.appendChild(makeTd(`<span class="cell-name">${esc(name) || '—'}</span>`));

  // ── Email ─────────────────────────────────────────────────
  tr.appendChild(makeTd(`<span class="cell-email">${esc(email) || '—'}</span>`));

  // ── Phone (editable) ──────────────────────────────────────
  tr.appendChild(editableTd(id, phone, 'Phone', false));

  // ── Role ──────────────────────────────────────────────────
  tr.appendChild(makeTd(`<span class="cell-role">${esc(role)}</span>`));

  // ── Film ──────────────────────────────────────────────────
  tr.appendChild(makeTd(`<span class="cell-film">${esc(film) || '—'}</span>`));

  // ── Location (editable) ───────────────────────────────────
  tr.appendChild(editableTd(id, loc, 'Location', false));

  // ── Media (Reel + Headshot combined) ──────────────────────
  const mediaDiv = document.createElement('div');
  mediaDiv.className = 'cell-media';
  if (reel) mediaDiv.innerHTML += `<a href="${esc(reel)}" target="_blank" rel="noopener">Reel ↗</a>`;
  if (head) mediaDiv.innerHTML += `<a href="${esc(head)}" target="_blank" rel="noopener">Headshot ↗</a>`;
  if (!reel && !head) mediaDiv.innerHTML = `<span style="font-size:10px;color:var(--dim)">—</span>`;
  const tdMedia = document.createElement('td');
  tdMedia.appendChild(mediaDiv);
  tr.appendChild(tdMedia);

  // ── Casting Status badge (+ redirect films) ───────────────
  const statusCell = document.createElement('td');
  let statusHtml = statusBadge(status);
  if (status === 'Redirect' && filmArr.length) {
    statusHtml += `<span style="display:block;font-size:9px;color:var(--redirect);opacity:0.7;margin-top:4px;line-height:1.5;">${filmArr.map(esc).join('<br>')}</span>`;
  }
  statusCell.innerHTML = statusHtml;
  tr.appendChild(statusCell);

  // ── Email Status badge ────────────────────────────────────
  const emailBadgeTd = document.createElement('td');
  const ebClass = alreadySent ? 'sent' : 'not-sent';
  const ebText  = alreadySent ? 'Sent' : 'Not Sent';
  emailBadgeTd.innerHTML = `<span class="email-badge ${ebClass}" data-email-badge="${id}">${ebText}</span>`;
  tr.appendChild(emailBadgeTd);

  // ── Notes (editable textarea) ─────────────────────────────
  const notesTd = document.createElement('td');
  notesTd.className = 'notes-cell';
  const notesTA = document.createElement('textarea');
  notesTA.className   = 'notes-edit';
  notesTA.value       = notes;
  notesTA.rows        = 2;
  notesTA.placeholder = 'Add note…';
  notesTA.setAttribute('data-original', notes);

  notesTA.addEventListener('blur', async () => {
    const newVal  = notesTA.value;
    const origVal = notesTA.getAttribute('data-original');
    if (newVal === origVal) return;
    try {
      await patchRecord(id, { Notes: newVal });
      notesTA.setAttribute('data-original', newVal);
      const rec = allRecords.find(r => r.id === id);
      if (rec) rec.fields['Notes'] = newVal;
      flashSaved(notesTA);
    } catch (err) {
      notesTA.value = origVal;
      flashError(notesTA);
      toast(`Note save failed: ${err.message}`, 'error');
    }
  });
  notesTd.appendChild(notesTA);
  tr.appendChild(notesTd);

  // ── Action button ─────────────────────────────────────────
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';

  if (CFG.TEMPLATE[status]) {
    const btn = document.createElement('button');
    btn.className        = `action-btn btn-${status.toLowerCase()}`;
    btn.dataset.actionId = id;
    btn.textContent      = alreadySent ? 'Sent ✓' : actionLabel(status);
    if (alreadySent) { btn.classList.add('sent'); btn.disabled = true; }
    btn.addEventListener('click', () => dispatchEmail(record, btn));
    tdAction.appendChild(btn);
  } else {
    tdAction.innerHTML = `<span style="font-size:9px;color:var(--dim)">—</span>`;
  }

  tr.appendChild(tdAction);
  el.tbody.appendChild(tr);
}

/* ── Editable cell ──────────────────────────────────────────── */
function editableTd(recordId, value, fieldName, multiline) {
  const td  = document.createElement('td');
  const div = document.createElement('div');
  div.className       = 'editable';
  div.contentEditable = 'true';
  div.textContent     = value;
  div.setAttribute('data-original', value);
  div.setAttribute('aria-label', `Edit ${fieldName}`);

  div.addEventListener('blur', async () => {
    const newVal  = div.textContent.trim();
    const origVal = div.getAttribute('data-original');
    if (newVal === origVal) return;
    div.classList.add('saving');
    try {
      await patchRecord(recordId, { [fieldName]: newVal });
      div.setAttribute('data-original', newVal);
      div.classList.remove('saving');
      const rec = allRecords.find(r => r.id === recordId);
      if (rec) rec.fields[fieldName] = newVal;
      flashSaved(div);
    } catch (err) {
      div.textContent = origVal;
      div.classList.remove('saving');
      flashError(div);
      toast(`Save failed: ${err.message}`, 'error');
    }
  });

  if (!multiline) {
    div.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); div.blur(); } });
  }

  td.appendChild(div);
  return td;
}

/* ── Flash helpers ──────────────────────────────────────────── */
function flashSaved(el) {
  el.classList.add('saved');
  setTimeout(() => el.classList.remove('saved'), 1400);
}
function flashError(el) {
  el.classList.add('saveerr');
  setTimeout(() => el.classList.remove('saveerr'), 1400);
}

/* ── Sync select-all checkbox ───────────────────────────────── */
function syncSelectAll() {
  const visible = getVisible();
  const allSel  = visible.length > 0 && visible.every(r => selectedIds.has(r.id));
  el.selectAll.checked       = allSel;
  el.selectAll.indeterminate = !allSel && selectedIds.size > 0;
}

/* ═══════════════════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════════════════ */
function showState(state) {
  [el.loading, el.error, el.empty, el.tableWrap].forEach(e => e.classList.add('hidden'));
  if      (state === 'loading') el.loading.classList.remove('hidden');
  else if (state === 'error')   el.error.classList.remove('hidden');
  else if (state === 'empty')   el.empty.classList.remove('hidden');
  else if (state === 'table')   el.tableWrap.classList.remove('hidden');
}

function makeTd(html) {
  const td = document.createElement('td');
  td.innerHTML = html;
  return td;
}

function statusBadge(status) {
  const cls = { Callback: 'callback', Redirect: 'redirect', Pass: 'pass' }[status] || 'unknown';
  return `<span class="badge ${cls}">${esc(status) || '—'}</span>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const d = document.createElement('div');
  d.className   = `toast t${type}`;
  d.textContent = msg;
  el.toastStack.appendChild(d);
  setTimeout(() => {
    d.classList.add('tout');
    d.addEventListener('animationend', () => d.remove(), { once: true });
  }, 4200);
}
