/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Casting Portal v4
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
  TL_TABLE:     'Production Timeline',
  AIRTABLE:     '/.netlify/functions/airtable-proxy',
  BREVO:        '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:  'https://api.brevo.com/v3/smtp/email',
  CALENDLY:     'https://calendly.com/studio-bleuskm/30min',
  FILM_LINK:    'https://bleuskm.com/casting/',
  RESPONSE_BASE:'https://bleuskm.com/redirect-response',
  SELFTAPE_BASE:'https://bleuskm.com/selftape',
  TEMPLATE: {
    Callback:     15,
    Redirect:     17,
    RedirectRole: 18,
    Pass:         16,
  },
};

/* ── State ──────────────────────────────────────────────────── */
let allRecords      = [];
let tlRecords       = [];
let activeFilter    = 'All';
let searchQuery     = '';
let selectedIds     = new Set();
let sentMap         = {};
let pendingRedirect = null;
let calCurrentDate  = new Date();

/* ── DOM ────────────────────────────────────────────────────── */
const el = {
  loading:         document.getElementById('stateLoading'),
  error:           document.getElementById('stateError'),
  errorMsg:        document.getElementById('stateErrorMsg'),
  empty:           document.getElementById('stateEmpty'),
  tableWrap:       document.getElementById('tableWrap'),
  tbody:           document.getElementById('castingTableBody'),
  recordCount:     document.getElementById('recordCount'),
  refreshBtn:      document.getElementById('refreshBtn'),
  logoutBtn:       document.getElementById('logoutBtn'),
  userChip:        document.getElementById('userChip'),
  selectAll:       document.getElementById('selectAll'),
  searchInput:     document.getElementById('searchInput'),
  searchClear:     document.getElementById('searchClear'),
  batchCount:      document.getElementById('batchCount'),
  batchSendBtn:    document.getElementById('batchSendBtn'),
  retryBtn:        document.getElementById('retryBtn'),
  toastStack:      document.getElementById('toastStack'),
  timelineTrack:   document.getElementById('timelineTrack'),
  timelineRefresh: document.getElementById('timelineRefreshBtn'),
  calToggleBtn:    document.getElementById('calendarToggleBtn'),
  calendarWrap:    document.getElementById('calendarWrap'),
  calGrid:         document.getElementById('calendarGrid'),
  calMonthLabel:   document.getElementById('calMonthLabel'),
  calPrev:         document.getElementById('calPrev'),
  calNext:         document.getElementById('calNext'),
  redirectModal:   document.getElementById('redirectModal'),
  filmSelect:      document.getElementById('filmSelect'),
  customFilmGroup: document.getElementById('customFilmGroup'),
  customFilmInput: document.getElementById('customFilmInput'),
  toRoleInput:     document.getElementById('toRoleInput'),
  modalActorName:  document.getElementById('modalActorName'),
  modalCancel:     document.getElementById('modalCancel'),
  modalSend:       document.getElementById('modalSend'),
  tlModal:         document.getElementById('timelineModal'),
  tlModalPhase:    document.getElementById('tlModalPhase'),
  tlModalId:       document.getElementById('tlModalId'),
  tlPhaseInput:    document.getElementById('tlPhaseInput'),
  tlStartInput:    document.getElementById('tlStartInput'),
  tlEndInput:      document.getElementById('tlEndInput'),
  tlStatusInput:   document.getElementById('tlStatusInput'),
  tlDescInput:     document.getElementById('tlDescInput'),
  tlModalCancel:   document.getElementById('tlModalCancel'),
  tlModalSave:     document.getElementById('tlModalSave'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  el.userChip.textContent = (sessionStorage.getItem('bleuskm_user') || '').toUpperCase();

  loadSubmissions();
  loadTimeline();

  el.refreshBtn.addEventListener('click', loadSubmissions);
  el.retryBtn.addEventListener('click', loadSubmissions);
  el.timelineRefresh.addEventListener('click', loadTimeline);
  el.logoutBtn.addEventListener('click', () => { sessionStorage.clear(); window.location.replace('./login.html'); });

  bindFilters();
  bindSearch();
  bindBatch();
  bindSelectAll();
  bindModal();
  bindTimelineModal();
  bindCalendar();
});

/* ═══════════════════════════════════════════════════════════════
   AIRTABLE — SUBMISSIONS
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

/* ═══════════════════════════════════════════════════════════════
   AIRTABLE — TIMELINE
═══════════════════════════════════════════════════════════════ */
async function loadTimeline() {
  el.timelineTrack.innerHTML = `<div class="timeline-loading"><div class="loader-ring-sm"></div><span>Loading timeline...</span></div>`;
  try {
    const qs  = `?table=${encodeURIComponent(CFG.TL_TABLE)}`;
    const res = await fetch(CFG.AIRTABLE + qs);
    if (!res.ok) throw new Error('Timeline fetch failed');
    const data = await res.json();
    tlRecords = data.records || [];
    renderTimeline();
    renderCalendar();
  } catch (err) {
    el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);letter-spacing:0.08em;">Could not load timeline.</span>`;
  }
}

async function patchTimeline(id, fields) {
  const res = await fetch(CFG.AIRTABLE, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ table: CFG.TL_TABLE, id, fields }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || 'Patch failed'); }
  return res.json();
}

/* ── Render timeline track ───────────────────────────────────── */
function renderTimeline() {
  if (!tlRecords.length) {
    el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);">No phases found in Production Timeline table.</span>`;
    return;
  }

  el.timelineTrack.innerHTML = '';
  tlRecords.forEach(record => {
    const f      = record.fields;
    const phase  = f['Phase']       || 'Untitled';
    const start  = f['Start Date']  || '';
    const end    = f['End Date']    || '';
    const status = (f['Status']     || 'Upcoming').toLowerCase();

    const card = document.createElement('div');
    card.className = `phase-card ${status}`;
    card.dataset.id = record.id;

    const dateStr = [formatDate(start), formatDate(end)].filter(Boolean).join(' — ');

    card.innerHTML = `
      <div class="phase-status-dot"></div>
      <div class="phase-name">${esc(phase)}</div>
      <div class="phase-dates">${esc(dateStr) || 'No dates set'}</div>
      <div class="phase-status-label ${status}">${esc(f['Status'] || 'Upcoming')}</div>
      <span class="phase-edit-hint">Edit</span>
    `;

    card.addEventListener('click', () => openTimelineModal(record));
    el.timelineTrack.appendChild(card);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

/* ═══════════════════════════════════════════════════════════════
   CALENDAR
═══════════════════════════════════════════════════════════════ */
function bindCalendar() {
  el.calToggleBtn.addEventListener('click', () => {
    const hidden = el.calendarWrap.classList.toggle('hidden');
    el.calToggleBtn.style.color = hidden ? '' : 'var(--gold)';
  });
  el.calPrev.addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
    renderCalendar();
  });
  el.calNext.addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
    renderCalendar();
  });
}

function renderCalendar() {
  const year  = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  const today = new Date();

  el.calMonthLabel.textContent = calCurrentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  el.calGrid.innerHTML = '';

  // Day headers
  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-header';
    h.textContent = d;
    el.calGrid.appendChild(h);
  });

  // Build phase event map
  const phaseEvents = {};
  tlRecords.forEach(r => {
    const f = r.fields;
    if (!f['Start Date']) return;
    const start = new Date(f['Start Date'] + 'T00:00:00');
    const end   = f['End Date'] ? new Date(f['End Date'] + 'T00:00:00') : start;
    const name  = f['Phase'] || '';

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      const key  = d.getDate();
      const type = +d === +start ? 'phase-start' : (+d === +end ? 'phase-end' : 'phase-span');
      if (!phaseEvents[key]) phaseEvents[key] = [];
      phaseEvents[key].push({ name, type });
    }
  });

  // Prev month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.className = 'cal-day other-month';
    d.innerHTML = `<div class="cal-day-num">${daysInPrev - i}</div>`;
    el.calGrid.appendChild(d);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    cell.className = `cal-day${isToday ? ' today' : ''}`;
    cell.innerHTML = `<div class="cal-day-num">${d}</div>`;

    if (phaseEvents[d]) {
      phaseEvents[d].forEach(ev => {
        const evEl = document.createElement('div');
        evEl.className = `cal-event ${ev.type}`;
        evEl.textContent = ev.type === 'phase-span' ? '' : ev.name;
        if (ev.type === 'phase-span') {
          evEl.style.height = '4px';
          evEl.style.marginBottom = '2px';
        }
        cell.appendChild(evEl);
      });
    }

    el.calGrid.appendChild(cell);
  }

  // Next month filler
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let d = 1; d <= totalCells - firstDay - daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    cell.innerHTML = `<div class="cal-day-num">${d}</div>`;
    el.calGrid.appendChild(cell);
  }
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE EDIT MODAL
═══════════════════════════════════════════════════════════════ */
function openTimelineModal(record) {
  const f = record.fields;
  el.tlModalPhase.textContent  = f['Phase'] || 'Phase';
  el.tlModalId.value            = record.id;
  el.tlPhaseInput.value         = f['Phase']       || '';
  el.tlStartInput.value         = f['Start Date']  || '';
  el.tlEndInput.value           = f['End Date']    || '';
  el.tlStatusInput.value        = f['Status']      || 'Upcoming';
  el.tlDescInput.value          = f['Description'] || '';
  el.tlModal.classList.remove('hidden');
}

function bindTimelineModal() {
  el.tlModalCancel.addEventListener('click', () => el.tlModal.classList.add('hidden'));
  el.tlModal.addEventListener('click', e => { if (e.target === el.tlModal) el.tlModal.classList.add('hidden'); });

  el.tlModalSave.addEventListener('click', async () => {
    const id = el.tlModalId.value;
    if (!id) return;

    el.tlModalSave.disabled    = true;
    el.tlModalSave.textContent = 'Saving...';

    try {
      await patchTimeline(id, {
        'Phase':       el.tlPhaseInput.value.trim(),
        'Start Date':  el.tlStartInput.value  || null,
        'End Date':    el.tlEndInput.value    || null,
        'Status':      el.tlStatusInput.value,
        'Description': el.tlDescInput.value.trim(),
      });

      // Update local state
      const rec = tlRecords.find(r => r.id === id);
      if (rec) {
        rec.fields['Phase']       = el.tlPhaseInput.value.trim();
        rec.fields['Start Date']  = el.tlStartInput.value || null;
        rec.fields['End Date']    = el.tlEndInput.value   || null;
        rec.fields['Status']      = el.tlStatusInput.value;
        rec.fields['Description'] = el.tlDescInput.value.trim();
      }

      el.tlModal.classList.add('hidden');
      renderTimeline();
      renderCalendar();
      toast('Phase updated', 'success');
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    } finally {
      el.tlModalSave.disabled    = false;
      el.tlModalSave.textContent = 'Save Changes';
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   AIRTABLE — PATCH SUBMISSIONS
═══════════════════════════════════════════════════════════════ */
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
   CONSENT URLS
═══════════════════════════════════════════════════════════════ */
function buildConsentUrl(recordId, consent, film) {
  return CFG.RESPONSE_BASE
    + '?id='      + encodeURIComponent(recordId)
    + '&consent=' + encodeURIComponent(consent)
    + '&film='    + encodeURIComponent(film);
}

function buildSelfTapeUrl(name, role, email, recordId) {
  return CFG.SELFTAPE_BASE
    + '?name='  + encodeURIComponent(name)
    + '&role='  + encodeURIComponent(role)
    + '&email=' + encodeURIComponent(email)
    + '&id='    + encodeURIComponent(recordId);
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL DISPATCH
═══════════════════════════════════════════════════════════════ */
async function dispatchEmail(record, btn, overrideFilm, overrideRole) {
  const f      = record.fields;
  const id     = record.id;
  const email  = (f['Email'] || '').trim();
  const name   = (f['Name']  || '').trim();
  const role   = (f['Role']  || '').trim();
  const status = (f['Casting Status'] || '').trim();

  if (!email) { toast('No email address on this record.', 'error'); return; }

  if (status === 'Redirect' && !overrideFilm) {
    openRedirectModal(record, btn);
    return;
  }

  let templateId;
  if (status === 'Callback')      templateId = CFG.TEMPLATE.Callback;
  else if (status === 'Pass')     templateId = CFG.TEMPLATE.Pass;
  else if (status === 'Redirect') templateId = overrideRole ? CFG.TEMPLATE.RedirectRole : CFG.TEMPLATE.Redirect;
  else { toast('No template for this status.', 'error'); return; }

  const params = { NAME: name, ROLE: role };

  if (status === 'Callback') {
    params.SELFTAPE_URL = buildSelfTapeUrl(name, role, email, id);
    params.CALENDLY_URL = CFG.CALENDLY;
  }

  if (status === 'Redirect') {
    params.FILM_NAME       = overrideFilm;
    params.FILM_LINK       = CFG.FILM_LINK;
    params.CONSENT_YES_URL = buildConsentUrl(id, 'yes', overrideFilm);
    params.CONSENT_NO_URL  = buildConsentUrl(id, 'no',  overrideFilm);
    if (overrideRole) params.TO_ROLE = overrideRole;
  }

  setBtnState(btn, 'sending', '...');
  try {
    await sendEmail(email, templateId, params);
    sentMap[id] = true;
    setBtnState(btn, 'sent', 'Sent');
    updateEmailBadge(id);
    toast(`Email sent to ${email}`, 'success');
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

function updateEmailBadge(id) {
  const b = document.querySelector(`[data-email-badge="${id}"]`);
  if (b) { b.textContent = 'Sent'; b.className = 'email-badge sent'; }
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
  el.toRoleInput.value  = '';
  el.filmSelect.value   = '';
  el.customFilmInput.value = '';
  el.customFilmGroup.classList.add('hidden');

  if (filmArr.length) {
    const match = Array.from(el.filmSelect.options).find(o => o.value === filmArr[0]);
    if (match) { el.filmSelect.value = filmArr[0]; }
    else { el.filmSelect.value = '__custom'; el.customFilmInput.value = filmArr[0]; el.customFilmGroup.classList.remove('hidden'); }
  }
  el.redirectModal.classList.remove('hidden');
}

function bindModal() {
  el.filmSelect.addEventListener('change', () => {
    el.customFilmGroup.classList.toggle('hidden', el.filmSelect.value !== '__custom');
  });
  el.modalCancel.addEventListener('click', () => el.redirectModal.classList.add('hidden'));
  el.redirectModal.addEventListener('click', e => { if (e.target === el.redirectModal) el.redirectModal.classList.add('hidden'); });
  el.modalSend.addEventListener('click', async () => {
    let film = el.filmSelect.value;
    if (film === '__custom') film = el.customFilmInput.value.trim();
    const toRole = el.toRoleInput.value.trim();
    if (!film) { toast('Please select or enter a film name.', 'error'); return; }
    const { record, btn } = pendingRedirect;
    el.redirectModal.classList.add('hidden');
    pendingRedirect = null;
    try { await dispatchEmail(record, btn, film, toRole || null); } catch {}
  });
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
      selectedIds.clear(); updateBatchUI(); renderTable();
    });
  });
}

function bindSearch() {
  el.searchInput.addEventListener('input', () => {
    searchQuery = el.searchInput.value.trim().toLowerCase();
    el.searchClear.classList.toggle('hidden', !searchQuery);
    selectedIds.clear(); updateBatchUI(); renderTable();
  });
  el.searchClear.addEventListener('click', () => {
    el.searchInput.value = ''; searchQuery = '';
    el.searchClear.classList.add('hidden');
    selectedIds.clear(); updateBatchUI(); renderTable(); el.searchInput.focus();
  });
}

function getVisible() {
  return allRecords.filter(r => {
    const f = r.fields;
    const status = (f['Casting Status'] || '').trim();
    if (activeFilter !== 'All' && status !== activeFilter) return false;
    if (searchQuery) {
      const hay = [f['Name']||'', f['Email']||'', f['Role']||'', f['Location']||''].join(' ').toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════
   BATCH
═══════════════════════════════════════════════════════════════ */
function bindBatch() {
  el.batchSendBtn.addEventListener('click', async () => {
    if (!selectedIds.size) return;
    el.batchSendBtn.disabled = true;
    el.batchSendBtn.textContent = 'Sending...';
    const targets = allRecords.filter(r => selectedIds.has(r.id));
    let ok = 0, skip = 0, fail = 0;
    for (const record of targets) {
      const status = (record.fields['Casting Status'] || '').trim();
      if (status === 'Redirect') {
        const films   = record.fields['Callback/Redirect'] || [];
        const filmArr = Array.isArray(films) ? films : (films ? [films] : []);
        const film    = filmArr[0] || '';
        if (!film) { skip++; continue; }
        const rowBtn = document.querySelector(`[data-action-id="${record.id}"]`);
        try { await dispatchEmail(record, rowBtn, film, null); ok++; } catch { fail++; }
      } else if (CFG.TEMPLATE[status]) {
        const rowBtn = document.querySelector(`[data-action-id="${record.id}"]`);
        try { await dispatchEmail(record, rowBtn); ok++; } catch { fail++; }
      } else { skip++; }
      await sleep(280);
    }
    el.batchSendBtn.disabled = false;
    el.batchSendBtn.textContent = 'Send Emails to Selected';
    toast(`Batch: ${ok} sent${skip ? `, ${skip} skipped` : ''}${fail ? `, ${fail} failed` : ''}`, fail ? 'error' : 'success');
    selectedIds.clear(); updateBatchUI(); renderTable();
  });
}

function bindSelectAll() {
  el.selectAll.addEventListener('change', () => {
    const visible = getVisible();
    if (el.selectAll.checked) visible.forEach(r => selectedIds.add(r.id));
    else                       visible.forEach(r => selectedIds.delete(r.id));
    updateBatchUI(); renderTable();
  });
}

function updateBatchUI() {
  const n = selectedIds.size;
  el.batchCount.textContent = `${n} selected`;
  el.batchCount.classList.toggle('hidden', n === 0);
  el.batchSendBtn.classList.toggle('hidden', n === 0);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER TABLE
═══════════════════════════════════════════════════════════════ */
function renderTable() {
  const records = getVisible();
  if (!records.length) { showState('empty'); return; }
  el.tbody.innerHTML = '';
  records.forEach(r => buildRow(r));
  showState('table');
  const allSel = records.length > 0 && records.every(r => selectedIds.has(r.id));
  el.selectAll.checked       = allSel;
  el.selectAll.indeterminate = !allSel && selectedIds.size > 0;
}

function buildRow(record) {
  const f  = record.fields;
  const id = record.id;

  const name    = (f['Name']     || '').trim();
  const email   = (f['Email']    || '').trim();
  const phone   = (f['Phone']    || '').trim();
  const role    = (f['Role']     || '').trim();
  const film    = (f['Film']     || '').trim();
  const loc     = (f['Location'] || '').trim();
  const reel    = (f['Reel/Portfolio Link'] || '').trim();
  const head    = (f['Headshot'] || '').trim();
  const status  = (f['Casting Status'] || '').trim();
  const notes   = (f['Notes']    || '').trim();
  const consent = (f['Redirect Consent'] || '').trim();
  const stUrl   = (f['Self Tape URL']    || '').trim();
  const stStatus= (f['Self Tape Status'] || 'Not Submitted').trim();
  const redirectFilms = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(redirectFilms) ? redirectFilms : (redirectFilms ? [redirectFilms] : []);
  const isSelected  = selectedIds.has(id);
  const alreadySent = sentMap[id] || false;

  const tr = document.createElement('tr');
  tr.dataset.id = id;
  if (isSelected) tr.classList.add('row-sel');

  // Checkbox
  const tdCb = document.createElement('td');
  tdCb.className = 'col-check';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = isSelected;
  cb.addEventListener('change', () => {
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
    tr.classList.toggle('row-sel', cb.checked);
    updateBatchUI(); syncSelectAll();
  });
  tdCb.appendChild(cb); tr.appendChild(tdCb);

  tr.appendChild(makeTd(`<span class="cell-name">${esc(name) || '—'}</span>`));
  tr.appendChild(makeTd(`<span class="cell-email">${esc(email) || '—'}</span>`));
  tr.appendChild(editableTd(id, phone, 'Phone'));
  tr.appendChild(makeTd(`<span class="cell-role">${esc(role) || '—'}</span>`));
  tr.appendChild(makeTd(`<span class="cell-film">${esc(film) || '—'}</span>`));
  tr.appendChild(editableTd(id, loc, 'Location'));

  // Media
  const mediaTd = document.createElement('td');
  const mediaDiv = document.createElement('div');
  mediaDiv.className = 'cell-media';
  if (reel) mediaDiv.innerHTML += `<a href="${esc(reel)}" target="_blank" rel="noopener">Reel &#8599;</a>`;
  if (head) mediaDiv.innerHTML += `<a href="${esc(head)}" target="_blank" rel="noopener">Headshot &#8599;</a>`;
  if (!reel && !head) mediaDiv.innerHTML = `<span style="font-size:10px;color:var(--dim)">—</span>`;
  mediaTd.appendChild(mediaDiv); tr.appendChild(mediaTd);

  // Status
  const statusTd = document.createElement('td');
  let statusHtml = statusBadge(status);
  if (status === 'Redirect' && filmArr.length) {
    statusHtml += `<span style="display:block;font-size:9px;color:var(--redirect);opacity:0.7;margin-top:4px;line-height:1.5;">${filmArr.map(esc).join('<br>')}</span>`;
  }
  if (consent) {
    const cc = consent === 'Accepted' ? 'var(--sent)' : 'var(--muted)';
    statusHtml += `<span style="display:block;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:${cc};margin-top:5px;">${esc(consent)}</span>`;
  }
  statusTd.innerHTML = statusHtml; tr.appendChild(statusTd);

  // Self-tape column
  const stTd = document.createElement('td');
  const stDiv = document.createElement('div');
  stDiv.className = 'selftape-cell';

  const stBadgeCls = stStatus === 'Submitted' ? 'submitted' : stStatus === 'Reviewed' ? 'reviewed' : 'not-submitted';
  stDiv.innerHTML = `<span class="st-badge ${stBadgeCls}" data-st-badge="${id}">${esc(stStatus)}</span>`;

  if (stUrl) {
    const link = document.createElement('a');
    link.href = stUrl; link.target = '_blank'; link.rel = 'noopener';
    link.className = 'selftape-link'; link.textContent = 'View Tape ↗';
    stDiv.appendChild(link);
  }

  if (stStatus === 'Submitted') {
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'review-btn';
    reviewBtn.textContent = 'Mark Reviewed';
    reviewBtn.addEventListener('click', async () => {
      reviewBtn.textContent = '...';
      reviewBtn.disabled    = true;
      try {
        await patchRecord(id, { 'Self Tape Status': 'Reviewed' });
        const rec = allRecords.find(r => r.id === id);
        if (rec) rec.fields['Self Tape Status'] = 'Reviewed';
        const badge = document.querySelector(`[data-st-badge="${id}"]`);
        if (badge) { badge.textContent = 'Reviewed'; badge.className = 'st-badge reviewed'; }
        reviewBtn.remove();
        toast('Marked as reviewed', 'success');
      } catch (err) {
        reviewBtn.textContent = 'Mark Reviewed';
        reviewBtn.disabled    = false;
        toast(`Failed: ${err.message}`, 'error');
      }
    });
    stDiv.appendChild(reviewBtn);
  }

  stTd.appendChild(stDiv); tr.appendChild(stTd);

  // Email badge
  const emailBadgeTd = document.createElement('td');
  emailBadgeTd.innerHTML = `<span class="email-badge ${alreadySent ? 'sent' : 'not-sent'}" data-email-badge="${id}">${alreadySent ? 'Sent' : 'Not Sent'}</span>`;
  tr.appendChild(emailBadgeTd);

  // Notes
  const notesTd = document.createElement('td');
  notesTd.className = 'notes-cell';
  const notesTA = document.createElement('textarea');
  notesTA.className = 'notes-edit'; notesTA.value = notes; notesTA.rows = 2;
  notesTA.placeholder = 'Add note...';
  notesTA.setAttribute('data-original', notes);
  notesTA.addEventListener('blur', async () => {
    const newVal = notesTA.value, origVal = notesTA.getAttribute('data-original');
    if (newVal === origVal) return;
    try {
      await patchRecord(id, { Notes: newVal });
      notesTA.setAttribute('data-original', newVal);
      const rec = allRecords.find(r => r.id === id);
      if (rec) rec.fields['Notes'] = newVal;
      flashSaved(notesTA);
    } catch (err) {
      notesTA.value = origVal; flashError(notesTA);
      toast(`Note save failed: ${err.message}`, 'error');
    }
  });
  notesTd.appendChild(notesTA); tr.appendChild(notesTd);

  // Action button
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';
  const hasTemplate = ['Callback','Redirect','Pass'].includes(status);
  if (hasTemplate) {
    const btn = document.createElement('button');
    btn.className = `action-btn btn-${status.toLowerCase()}`;
    btn.dataset.actionId = id;
    btn.textContent = alreadySent ? 'Sent' : actionLabel(status);
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
function editableTd(recordId, value, fieldName) {
  const td = document.createElement('td');
  const div = document.createElement('div');
  div.className = 'editable'; div.contentEditable = 'true';
  div.textContent = value; div.setAttribute('data-original', value);
  div.addEventListener('blur', async () => {
    const newVal = div.textContent.trim(), origVal = div.getAttribute('data-original');
    if (newVal === origVal) return;
    div.classList.add('saving');
    try {
      await patchRecord(recordId, { [fieldName]: newVal });
      div.setAttribute('data-original', newVal); div.classList.remove('saving');
      const rec = allRecords.find(r => r.id === recordId);
      if (rec) rec.fields[fieldName] = newVal;
      flashSaved(div);
    } catch (err) {
      div.textContent = origVal; div.classList.remove('saving'); flashError(div);
      toast(`Save failed: ${err.message}`, 'error');
    }
  });
  div.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); div.blur(); } });
  td.appendChild(div); return td;
}

/* ── Helpers ────────────────────────────────────────────────── */
function flashSaved(el) { el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1400); }
function flashError(el) { el.classList.add('saveerr'); setTimeout(() => el.classList.remove('saveerr'), 1400); }

function syncSelectAll() {
  const visible = getVisible();
  const allSel  = visible.length > 0 && visible.every(r => selectedIds.has(r.id));
  el.selectAll.checked       = allSel;
  el.selectAll.indeterminate = !allSel && selectedIds.size > 0;
}

function showState(state) {
  [el.loading, el.error, el.empty, el.tableWrap].forEach(e => e.classList.add('hidden'));
  if      (state === 'loading') el.loading.classList.remove('hidden');
  else if (state === 'error')   el.error.classList.remove('hidden');
  else if (state === 'empty')   el.empty.classList.remove('hidden');
  else if (state === 'table')   el.tableWrap.classList.remove('hidden');
}

function makeTd(html) { const td = document.createElement('td'); td.innerHTML = html; return td; }

function statusBadge(status) {
  const cls = { Callback:'callback', Redirect:'redirect', Pass:'pass' }[status] || 'unknown';
  return `<span class="badge ${cls}">${esc(status) || '—'}</span>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toast(msg, type = 'success') {
  const d = document.createElement('div');
  d.className = `toast t${type}`; d.textContent = msg;
  el.toastStack.appendChild(d);
  setTimeout(() => {
    d.classList.add('tout');
    d.addEventListener('animationend', () => d.remove(), { once: true });
  }, 4200);
}
