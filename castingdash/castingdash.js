/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Casting Portal v5
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
  TABLE:         'Casting Submissions',
  TL_TABLE:      'Production Timeline',
  AIRTABLE:      '/.netlify/functions/airtable-proxy',
  BREVO:         '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:   'https://api.brevo.com/v3/smtp/email',
  CALENDLY:      'https://calendly.com/studio-bleuskm/30min',
  FILM_LINK:     'https://bleuskm.com/casting/',
  RESPONSE_BASE: 'https://bleuskm.com/redirect-response',
  SELFTAPE_BASE: 'https://bleuskm.com/selftape',
  TEMPLATE: {
    Callback:     15,
    Redirect:     17,
    RedirectRole: 18,
    Pass:         16,
    Availability: 19,
  },
};

/* ── Role map by film ───────────────────────────────────────── */
const FILM_ROLES = {
  'The Final Hand': [
    'High John — Lead (Black American Male, 35-60)',
    'The Player — Lead (Caucasian Male, 25-40)',
    'The Stranger — Supporting (Any Ethnicity Male, 25-40)',
    'Bartender / Waitress — Supporting (Any Ethnicity Female, 21+)',
    'Table Patron — Background (Male or Female, 21+)',
    'The Couple — Background (Male & Female, 21+)',
    '__custom',
  ],
};

/* ── State ──────────────────────────────────────────────────── */
let allRecords      = [];
let tlRecords       = [];
let activeFilter    = 'All';
let searchQuery     = '';
let selectedIds     = new Set();
let sentMap         = {};
let scheduledMap    = {};
let expandedIds     = new Set();
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
  calClose:        document.getElementById('calClose'),
  redirectModal:   document.getElementById('redirectModal'),
  filmSelect:      document.getElementById('filmSelect'),
  roleSelect:      document.getElementById('roleSelect'),
  customFilmGroup: document.getElementById('customFilmGroup'),
  customFilmInput: document.getElementById('customFilmInput'),
  customRoleGroup: document.getElementById('customRoleGroup'),
  customRoleInput: document.getElementById('customRoleInput'),
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
  bindRedirectModal();
  bindTimelineModal();
  bindCalendar();
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
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CFG.TABLE, id, fields }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Patch ${res.status}`); }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE
═══════════════════════════════════════════════════════════════ */
async function loadTimeline() {
  el.timelineTrack.innerHTML = `<div class="timeline-loading"><div class="loader-ring-sm"></div><span>Loading...</span></div>`;
  try {
    const res  = await fetch(CFG.AIRTABLE + `?table=${encodeURIComponent(CFG.TL_TABLE)}`);
    if (!res.ok) throw new Error('Timeline fetch failed');
    const data = await res.json();
    // Sort by Start Date
    tlRecords = (data.records || []).sort((a, b) => {
      const da = a.fields['Start Date'] || '';
      const db = b.fields['Start Date'] || '';
      return da.localeCompare(db);
    });
    renderTimeline();
    renderCalendar();
  } catch (err) {
    el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);">Could not load timeline.</span>`;
  }
}

async function patchTimeline(id, fields) {
  const res = await fetch(CFG.AIRTABLE, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CFG.TL_TABLE, id, fields }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || 'Patch failed'); }
  return res.json();
}

function renderTimeline() {
  if (!tlRecords.length) {
    el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);">No phases found.</span>`;
    return;
  }
  el.timelineTrack.innerHTML = '';
  tlRecords.forEach(record => {
    const f      = record.fields;
    const status = (f['Status'] || 'Upcoming').toLowerCase();
    const start  = f['Start Date'] || '';
    const end    = f['End Date']   || '';
    const dateStr = [formatDate(start), formatDate(end)].filter(Boolean).join(' — ');

    const card = document.createElement('div');
    card.className  = `phase-card ${status}`;
    card.dataset.id = record.id;
    card.innerHTML  = `
      <div class="phase-status-dot"></div>
      <div class="phase-name">${esc(f['Phase'] || 'Untitled')}</div>
      <div class="phase-dates">${esc(dateStr) || 'No dates set'}</div>
      <div class="phase-status-label ${status}">${esc(f['Status'] || 'Upcoming')}</div>
      <span class="phase-edit-hint">Edit</span>`;
    card.addEventListener('click', () => openTimelineModal(record));
    el.timelineTrack.appendChild(card);
  });
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

/* ═══════════════════════════════════════════════════════════════
   CALENDAR
═══════════════════════════════════════════════════════════════ */
function bindCalendar() {
  el.calToggleBtn.addEventListener('click', () => {
    const nowHidden = el.calendarWrap.classList.toggle('hidden');
    el.calToggleBtn.style.color = nowHidden ? '' : 'var(--gold)';
    if (!nowHidden) renderCalendar();
  });
  el.calClose.addEventListener('click', () => {
    el.calendarWrap.classList.add('hidden');
    el.calToggleBtn.style.color = '';
  });
  el.calPrev.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() - 1); renderCalendar(); });
  el.calNext.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() + 1); renderCalendar(); });
}

function renderCalendar() {
  const year  = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  const today = new Date();

  el.calMonthLabel.textContent = calCurrentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  el.calGrid.innerHTML = '';

  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(d => {
    const h = document.createElement('div'); h.className = 'cal-day-header'; h.textContent = d; el.calGrid.appendChild(h);
  });

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  // Build phase event map
  const phaseEvents = {};
  tlRecords.forEach(r => {
    const f = r.fields;
    if (!f['Start Date']) return;
    const start = new Date(f['Start Date'] + 'T00:00:00');
    const end   = f['End Date'] ? new Date(f['End Date'] + 'T00:00:00') : new Date(start);
    const name  = f['Phase'] || '';
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      const key  = d.getDate();
      const isStart = d.getTime() === start.getTime();
      const isEnd   = d.getTime() === end.getTime();
      const type = isStart ? 'phase-start' : (isEnd ? 'phase-end' : 'phase-span');
      if (!phaseEvents[key]) phaseEvents[key] = [];
      phaseEvents[key].push({ name, type });
    }
  });

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = document.createElement('div'); d.className = 'cal-day other-month';
    d.innerHTML = `<div class="cal-day-num">${daysInPrev - i}</div>`; el.calGrid.appendChild(d);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const cell = document.createElement('div');
    cell.className = `cal-day${isToday ? ' today' : ''}`;
    cell.innerHTML = `<div class="cal-day-num">${d}</div>`;
    (phaseEvents[d] || []).forEach(ev => {
      const evEl = document.createElement('div');
      evEl.className = `cal-event ${ev.type}`;
      evEl.textContent = ev.type === 'phase-span' ? '' : ev.name;
      if (ev.type === 'phase-span') { evEl.style.height = '4px'; evEl.style.marginBottom = '2px'; }
      cell.appendChild(evEl);
    });
    el.calGrid.appendChild(cell);
  }

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let d = 1; d <= totalCells - firstDay - daysInMonth; d++) {
    const cell = document.createElement('div'); cell.className = 'cal-day other-month';
    cell.innerHTML = `<div class="cal-day-num">${d}</div>`; el.calGrid.appendChild(cell);
  }
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE EDIT MODAL
═══════════════════════════════════════════════════════════════ */
function openTimelineModal(record) {
  const f = record.fields;
  el.tlModalPhase.textContent = f['Phase'] || 'Phase';
  el.tlModalId.value           = record.id;
  el.tlPhaseInput.value        = f['Phase']       || '';
  el.tlStartInput.value        = f['Start Date']  || '';
  el.tlEndInput.value          = f['End Date']    || '';
  el.tlStatusInput.value       = f['Status']      || 'Upcoming';
  el.tlDescInput.value         = f['Description'] || '';
  el.tlModal.classList.remove('hidden');
}

function bindTimelineModal() {
  el.tlModalCancel.addEventListener('click', () => el.tlModal.classList.add('hidden'));
  el.tlModal.addEventListener('click', e => { if (e.target === el.tlModal) el.tlModal.classList.add('hidden'); });
  el.tlModalSave.addEventListener('click', async () => {
    const id = el.tlModalId.value;
    el.tlModalSave.disabled = true; el.tlModalSave.textContent = 'Saving...';
    try {
      await patchTimeline(id, {
        'Phase':       el.tlPhaseInput.value.trim(),
        'Start Date':  el.tlStartInput.value  || null,
        'End Date':    el.tlEndInput.value    || null,
        'Status':      el.tlStatusInput.value,
        'Description': el.tlDescInput.value.trim(),
      });
      const rec = tlRecords.find(r => r.id === id);
      if (rec) {
        rec.fields['Phase']       = el.tlPhaseInput.value.trim();
        rec.fields['Start Date']  = el.tlStartInput.value || null;
        rec.fields['End Date']    = el.tlEndInput.value   || null;
        rec.fields['Status']      = el.tlStatusInput.value;
        rec.fields['Description'] = el.tlDescInput.value.trim();
      }
      // Re-sort after edit
      tlRecords.sort((a, b) => (a.fields['Start Date'] || '').localeCompare(b.fields['Start Date'] || ''));
      el.tlModal.classList.add('hidden');
      renderTimeline(); renderCalendar();
      toast('Phase updated', 'success');
    } catch (err) { toast(`Save failed: ${err.message}`, 'error'); }
    finally { el.tlModalSave.disabled = false; el.tlModalSave.textContent = 'Save Changes'; }
  });
}

/* ═══════════════════════════════════════════════════════════════
   BREVO
═══════════════════════════════════════════════════════════════ */
async function sendEmail(email, templateId, params) {
  const res = await fetch(CFG.BREVO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: CFG.BREVO_EMAIL, payload: { to: [{ email }], templateId, params } }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || `Brevo ${res.status}`); }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL DISPATCH
═══════════════════════════════════════════════════════════════ */
function buildConsentUrl(recordId, consent, film) {
  return CFG.RESPONSE_BASE + '?id=' + encodeURIComponent(recordId) + '&consent=' + encodeURIComponent(consent) + '&film=' + encodeURIComponent(film);
}

function buildSelfTapeUrl(name, role, email, id) {
  return CFG.SELFTAPE_BASE + '?name=' + encodeURIComponent(name) + '&role=' + encodeURIComponent(role) + '&email=' + encodeURIComponent(email) + '&id=' + encodeURIComponent(id);
}

async function dispatchEmail(record, btn, overrideFilm, overrideRole) {
  const f      = record.fields;
  const id     = record.id;
  const email  = (f['Email'] || '').trim();
  const name   = (f['Name']  || '').trim();
  const role   = (f['Role']  || '').trim();
  const status = (f['Casting Status'] || '').trim();

  if (!email) { toast('No email address on this record.', 'error'); return; }
  if (status === 'Redirect' && !overrideFilm) { openRedirectModal(record, btn); return; }

  let templateId;
  if (status === 'Callback')      templateId = CFG.TEMPLATE.Callback;
  else if (status === 'Pass')     templateId = CFG.TEMPLATE.Pass;
  else if (status === 'Redirect') templateId = overrideRole ? CFG.TEMPLATE.RedirectRole : CFG.TEMPLATE.Redirect;
  else { toast('No template for this status.', 'error'); return; }

  const params = { NAME: name, ROLE: role };
  if (status === 'Callback') { params.SELFTAPE_URL = buildSelfTapeUrl(name, role, email, id); params.CALENDLY_URL = CFG.CALENDLY; }
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
    updateEmailBadge(id, 'sent');
    toast(`Email sent to ${email}`, 'success');
  } catch (err) {
    setBtnState(btn, 'idle', actionLabel(status));
    toast(`Failed: ${err.message}`, 'error');
    throw err;
  }
}

async function dispatchAvailability(record, btn) {
  const f     = record.fields;
  const id    = record.id;
  const email = (f['Email'] || '').trim();
  const name  = (f['Name']  || '').trim();
  const role  = (f['Role']  || '').trim();
  const film  = (f['Film']  || 'The Final Hand').trim();

  if (!email) { toast('No email address on this record.', 'error'); return; }

  const params = {
    NAME:         name,
    ROLE:         role,
    FILM_NAME:    film,
    CALENDLY_URL: CFG.CALENDLY,
  };

  setBtnState(btn, 'sending', '...');
  try {
    await sendEmail(email, CFG.TEMPLATE.Availability, params);
    scheduledMap[id] = true;
    setBtnState(btn, 'scheduled', 'Scheduled');
    updateEmailBadge(id, 'scheduled');
    toast(`Availability email sent to ${email}`, 'success');
  } catch (err) {
    setBtnState(btn, 'idle', 'Send Availability');
    toast(`Failed: ${err.message}`, 'error');
  }
}

function setBtnState(btn, state, label) {
  if (!btn) return;
  btn.classList.remove('sending', 'sent', 'scheduled');
  if (state === 'sending')   btn.classList.add('sending');
  if (state === 'sent')      { btn.classList.add('sent');      btn.disabled = true; }
  if (state === 'scheduled') { btn.classList.add('scheduled'); btn.disabled = true; }
  btn.textContent = label;
}

function actionLabel(status) {
  return status === 'Callback' ? 'Send Callback'
       : status === 'Redirect' ? 'Send Redirect'
       : status === 'Pass'     ? 'Send Rejection'
       : 'Send Email';
}

function updateEmailBadge(id, type) {
  const b = document.querySelector(`[data-email-badge="${id}"]`);
  if (!b) return;
  if (type === 'sent')      { b.textContent = 'Sent';      b.className = 'email-badge sent'; }
  if (type === 'scheduled') { b.textContent = 'Scheduled'; b.className = 'email-badge scheduled'; }
}

/* ═══════════════════════════════════════════════════════════════
   REDIRECT MODAL — with role auto-populate
═══════════════════════════════════════════════════════════════ */
function openRedirectModal(record, btn) {
  pendingRedirect = { record, btn };
  const f     = record.fields;
  const name  = (f['Name'] || f['Email'] || '').trim();
  const films = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(films) ? films : (films ? [films] : []);

  el.modalActorName.textContent = name;
  el.customFilmGroup.classList.add('hidden');
  el.customRoleGroup.classList.add('hidden');
  el.filmSelect.value   = '';
  el.customFilmInput.value = '';

  // Pre-select film from Airtable
  if (filmArr.length) {
    const match = Array.from(el.filmSelect.options).find(o => o.value === filmArr[0]);
    if (match) { el.filmSelect.value = filmArr[0]; }
    else { el.filmSelect.value = '__custom'; el.customFilmInput.value = filmArr[0]; el.customFilmGroup.classList.remove('hidden'); }
  }

  populateRoles(el.filmSelect.value);
  el.redirectModal.classList.remove('hidden');
}

function populateRoles(filmName) {
  const roles  = FILM_ROLES[filmName] || [];
  el.roleSelect.innerHTML = '<option value="">— General redirect (no role) —</option>';

  roles.forEach(r => {
    const opt = document.createElement('option');
    if (r === '__custom') { opt.value = '__custom'; opt.textContent = 'Custom role...'; }
    else { opt.value = r; opt.textContent = r; }
    el.roleSelect.appendChild(opt);
  });

  if (!roles.length) {
    // Non-Final-Hand films — just show free text
    const opt = document.createElement('option'); opt.value = '__custom'; opt.textContent = 'Enter role...';
    el.roleSelect.appendChild(opt);
  }
}

function bindRedirectModal() {
  el.filmSelect.addEventListener('change', () => {
    el.customFilmGroup.classList.toggle('hidden', el.filmSelect.value !== '__custom');
    populateRoles(el.filmSelect.value === '__custom' ? '' : el.filmSelect.value);
    el.customRoleGroup.classList.add('hidden');
  });

  el.roleSelect.addEventListener('change', () => {
    el.customRoleGroup.classList.toggle('hidden', el.roleSelect.value !== '__custom');
  });

  el.modalCancel.addEventListener('click', () => el.redirectModal.classList.add('hidden'));
  el.redirectModal.addEventListener('click', e => { if (e.target === el.redirectModal) el.redirectModal.classList.add('hidden'); });

  el.modalSend.addEventListener('click', async () => {
    let film = el.filmSelect.value;
    if (film === '__custom') film = el.customFilmInput.value.trim();
    let role = el.roleSelect.value;
    if (role === '__custom') role = el.customRoleInput.value.trim();
    if (role === '') role = null;

    if (!film) { toast('Please select or enter a film name.', 'error'); return; }
    const { record, btn } = pendingRedirect;
    el.redirectModal.classList.add('hidden');
    pendingRedirect = null;
    try { await dispatchEmail(record, btn, film, role); } catch {}
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
    el.batchSendBtn.disabled = true; el.batchSendBtn.textContent = 'Sending...';
    const targets = allRecords.filter(r => selectedIds.has(r.id));
    let ok = 0, skip = 0, fail = 0;
    for (const record of targets) {
      const status = (record.fields['Casting Status'] || '').trim();
      const stStatus = (record.fields['Self Tape Status'] || '').trim();
      // Availability batch
      if (stStatus === 'Selected for Final Round') {
        const rowBtn = document.querySelector(`[data-avail-id="${record.id}"]`);
        try { await dispatchAvailability(record, rowBtn); ok++; } catch { fail++; }
      } else if (status === 'Redirect') {
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
    el.batchSendBtn.disabled = false; el.batchSendBtn.textContent = 'Send Emails to Selected';
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

  const name     = (f['Name']     || '').trim();
  const email    = (f['Email']    || '').trim();
  const phone    = (f['Phone']    || '').trim();
  const role     = (f['Role']     || '').trim();
  const film     = (f['Film']     || '').trim();
  const loc      = (f['Location'] || '').trim();
  const reel     = (f['Reel/Portfolio Link'] || '').trim();
  const head     = (f['Headshot'] || '').trim();
  const status   = (f['Casting Status'] || '').trim();
  const notes    = (f['Notes']    || '').trim();
  const consent  = (f['Redirect Consent'] || '').trim();
  const stUrl    = (f['Self Tape URL']    || '').trim();
  const stStatus = (f['Self Tape Status'] || 'Not Submitted').trim();
  const castStatus = (f['Cast Status'] || '').trim();
  const redirectFilms = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(redirectFilms) ? redirectFilms : (redirectFilms ? [redirectFilms] : []);

  const isSelected   = selectedIds.has(id);
  const alreadySent  = sentMap[id]     || false;
  const isScheduled  = scheduledMap[id]|| false;
  const isExpanded   = expandedIds.has(id);

  // ── Summary row ──────────────────────────────────────────
  const summaryRow = document.createElement('tr');
  summaryRow.className = `summary-row${isSelected ? ' row-sel' : ''}${isExpanded ? ' expanded' : ''}`;
  summaryRow.dataset.id = id;

  // Checkbox td
  const tdCb = document.createElement('td');
  tdCb.className = 'col-check';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = isSelected;
  cb.addEventListener('change', e => {
    e.stopPropagation();
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
    summaryRow.classList.toggle('row-sel', cb.checked);
    updateBatchUI(); syncSelectAll();
  });
  tdCb.appendChild(cb); summaryRow.appendChild(tdCb);

  // Name + expand arrow
  summaryRow.appendChild(makeTd(`
    <span class="cell-name">${esc(name) || '—'}</span>
    <span class="expand-arrow">&#9654;</span>
  `));

  // Role
  summaryRow.appendChild(makeTd(`<span class="cell-role">${esc(role) || '—'}</span>`));

  // Status badge
  const statusTd = document.createElement('td');
  let statusHtml = statusBadge(status);
  if (consent) {
    const cc = consent === 'Accepted' ? 'var(--sent)' : 'var(--muted)';
    statusHtml += `<span style="display:block;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:${cc};margin-top:4px;">${esc(consent)}</span>`;
  }
  statusTd.innerHTML = statusHtml; summaryRow.appendChild(statusTd);

  // Self-tape status
  const stTd = document.createElement('td');
  const stCls = stStatus === 'Selected for Final Round' ? 'selected'
              : stStatus === 'Reviewed'   ? 'reviewed'
              : stStatus === 'Submitted'  ? 'submitted'
              : 'not-submitted';
  const stLabel = stStatus === 'Selected for Final Round' ? 'Selected' : stStatus;
  stTd.innerHTML = `<span class="st-badge ${stCls}" data-st-badge="${id}">${esc(stLabel)}</span>`;
  summaryRow.appendChild(stTd);

  // Email status badge
  const emailBadgeTd = document.createElement('td');
  let ebClass = 'not-sent', ebText = 'Not Sent';
  if (isScheduled)  { ebClass = 'scheduled'; ebText = 'Scheduled'; }
  else if (alreadySent) { ebClass = 'sent'; ebText = 'Sent'; }
  emailBadgeTd.innerHTML = `<span class="email-badge ${ebClass}" data-email-badge="${id}">${ebText}</span>`;
  summaryRow.appendChild(emailBadgeTd);

  // Action buttons
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';
  const actionGroup = document.createElement('div');
  actionGroup.className = 'action-group';

  // Primary email action
  if (['Callback','Redirect','Pass'].includes(status)) {
    const btn = document.createElement('button');
    btn.className = `action-btn btn-${status.toLowerCase()}`;
    btn.dataset.actionId = id;
    btn.textContent = alreadySent ? 'Sent' : actionLabel(status);
    if (alreadySent) { btn.classList.add('sent'); btn.disabled = true; }
    btn.addEventListener('click', e => { e.stopPropagation(); dispatchEmail(record, btn); });
    actionGroup.appendChild(btn);
  }

  // Availability button — only for Selected for Final Round
  if (stStatus === 'Selected for Final Round') {
    const availBtn = document.createElement('button');
    availBtn.className = `action-btn btn-availability`;
    availBtn.dataset.availId = id;
    availBtn.textContent = isScheduled ? 'Scheduled' : 'Send Availability';
    if (isScheduled) { availBtn.classList.add('scheduled'); availBtn.disabled = true; }
    availBtn.addEventListener('click', e => { e.stopPropagation(); dispatchAvailability(record, availBtn); });
    actionGroup.appendChild(availBtn);
  }

  // Mark reviewed button
  if (stStatus === 'Submitted') {
    const revBtn = document.createElement('button');
    revBtn.className = 'action-btn';
    revBtn.textContent = 'Mark Reviewed';
    revBtn.addEventListener('click', async e => {
      e.stopPropagation();
      revBtn.textContent = '...'; revBtn.disabled = true;
      try {
        await patchRecord(id, { 'Self Tape Status': 'Reviewed' });
        const rec = allRecords.find(r => r.id === id);
        if (rec) rec.fields['Self Tape Status'] = 'Reviewed';
        const badge = document.querySelector(`[data-st-badge="${id}"]`);
        if (badge) { badge.textContent = 'Reviewed'; badge.className = 'st-badge reviewed'; }
        revBtn.remove();
        toast('Marked as reviewed', 'success');
      } catch (err) { revBtn.textContent = 'Mark Reviewed'; revBtn.disabled = false; toast(`Failed: ${err.message}`, 'error'); }
    });
    actionGroup.appendChild(revBtn);
  }

  if (!actionGroup.children.length) {
    tdAction.innerHTML = `<span style="font-size:9px;color:var(--dim)">—</span>`;
  } else {
    tdAction.appendChild(actionGroup);
  }
  summaryRow.appendChild(tdAction);

  // Click row to expand (not checkbox or buttons)
  summaryRow.addEventListener('click', e => {
    if (e.target.closest('input, button, a')) return;
    toggleExpand(id, detailRow);
    summaryRow.classList.toggle('expanded', expandedIds.has(id));
  });

  el.tbody.appendChild(summaryRow);

  // ── Detail row ───────────────────────────────────────────
  const detailRow = document.createElement('tr');
  detailRow.className = `detail-row${isExpanded ? ' open' : ''}`;
  const detailTd = document.createElement('td');
  detailTd.colSpan = 7;

  const panel = document.createElement('div');
  panel.className = 'detail-panel';

  // Contact info
  panel.appendChild(detailField('EMAIL', `<a href="mailto:${esc(email)}">${esc(email) || '—'}</a>`));
  panel.appendChild(detailEditField(id, phone, 'Phone', 'PHONE'));
  panel.appendChild(detailField('FILM', esc(film) || '—'));
  panel.appendChild(detailEditField(id, loc, 'Location', 'LOCATION'));

  // Media
  let mediaHtml = '';
  if (reel) mediaHtml += `<a href="${esc(reel)}" target="_blank" rel="noopener">Reel &#8599;</a><br>`;
  if (head) mediaHtml += `<a href="${esc(head)}" target="_blank" rel="noopener">Headshot &#8599;</a>`;
  if (!reel && !head) mediaHtml = '<span style="color:var(--dim)">—</span>';
  panel.appendChild(detailField('MEDIA', mediaHtml));

  // Self-tape link
  if (stUrl) {
    panel.appendChild(detailField('SELF-TAPE', `<a href="${esc(stUrl)}" target="_blank" rel="noopener">View Tape &#8599;</a>`));
  }

  // Redirect films
  if (filmArr.length) {
    panel.appendChild(detailField('REDIRECT TO', filmArr.map(esc).join(', ')));
  }

  // Cast status
  if (castStatus) {
    panel.appendChild(detailField('CAST STATUS', esc(castStatus)));
  }

  // Notes (editable, full width)
  const notesDf = document.createElement('div');
  notesDf.className = 'detail-field';
  notesDf.style.gridColumn = 'span 3';
  const notesLabel = document.createElement('span');
  notesLabel.className = 'detail-label'; notesLabel.textContent = 'NOTES';
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
    } catch (err) { notesTA.value = origVal; flashError(notesTA); toast(`Note save failed: ${err.message}`, 'error'); }
  });
  notesDf.appendChild(notesLabel); notesDf.appendChild(notesTA);
  panel.appendChild(notesDf);

  detailTd.appendChild(panel);
  detailRow.appendChild(detailTd);
  el.tbody.appendChild(detailRow);
}

function toggleExpand(id, detailRow) {
  if (expandedIds.has(id)) { expandedIds.delete(id); detailRow.classList.remove('open'); }
  else                      { expandedIds.add(id);    detailRow.classList.add('open'); }
}

function detailField(label, valueHtml) {
  const df = document.createElement('div'); df.className = 'detail-field';
  df.innerHTML = `<span class="detail-label">${label}</span><span class="detail-value">${valueHtml}</span>`;
  return df;
}

function detailEditField(recordId, value, fieldName, label) {
  const df = document.createElement('div'); df.className = 'detail-field';
  const lbl = document.createElement('span'); lbl.className = 'detail-label'; lbl.textContent = label;
  const div = document.createElement('div');
  div.className = 'editable detail-value'; div.contentEditable = 'true';
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
    } catch (err) { div.textContent = origVal; div.classList.remove('saving'); flashError(div); toast(`Save failed: ${err.message}`, 'error'); }
  });
  div.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); div.blur(); } });
  df.appendChild(lbl); df.appendChild(div);
  return df;
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
  setTimeout(() => { d.classList.add('tout'); d.addEventListener('animationend', () => d.remove(), { once: true }); }, 4200);
}
