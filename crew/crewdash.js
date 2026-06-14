/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Crew Portal v4
   crewdash.js
═══════════════════════════════════════════════════════════════ */

(function () {
  if (sessionStorage.getItem('bleuskm_crew_auth') !== 'true') {
    window.location.replace('./login.html');
  }
})();

const ADMIN_USER = 'zaria';

const CFG = {
  CREW_TABLE:       'Crew applications',
  CONTRACT_TABLE:   'Contracts',
  CASTING_TABLE:    'Casting Submissions',
  TL_TABLE:         'Production Timeline',
  AIRTABLE:         '/.netlify/functions/airtable-proxy',
  BREVO:            '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:      'https://api.brevo.com/v3/smtp/email',
  CONTRACT_BASE:    'https://bleuskm.com/crew/contract',
  CASTING_DASH:     '/castingdash/',
  LOCATION:         'Denton, TX',
  T: {
    RoleRedirect: 20,
    Contract:     21,
    NotProject:   22,
    Support:      23,
    Core:         25,
    Guide:        26,
  },
};

/* ── State ──────────────────────────────────────────────────── */
let crewRecords     = [];
let contractRecords = [];
let castingRecords  = [];
let tlRecords       = [];
let calCurrentDate  = new Date();
let activeFilter    = 'All';
let searchQuery     = '';
let expandedIds     = new Set();
let sessionSent     = {};
let selectedIds     = new Set();
let pendingEmailRecord = null;
let isAdmin         = false;

/* ── DOM ────────────────────────────────────────────────────── */
const el = {
  loading:          document.getElementById('stateLoading'),
  error:            document.getElementById('stateError'),
  errorMsg:         document.getElementById('stateErrorMsg'),
  empty:            document.getElementById('stateEmpty'),
  tableWrap:        document.getElementById('tableWrap'),
  tbody:            document.getElementById('crewTableBody'),
  recordCount:      document.getElementById('recordCount'),
  refreshBtn:       document.getElementById('refreshBtn'),
  logoutBtn:        document.getElementById('logoutBtn'),
  userChip:         document.getElementById('userChip'),
  searchInput:      document.getElementById('searchInput'),
  searchClear:      document.getElementById('searchClear'),
  retryBtn:         document.getElementById('retryBtn'),
  toastStack:       document.getElementById('toastStack'),
  statTotal:        document.getElementById('statTotal'),
  statSigned:       document.getElementById('statSigned'),
  statPending:      document.getElementById('statPending'),
  statConfirmed:    document.getElementById('statConfirmed'),
  timelineTrack:    document.getElementById('timelineTrack'),
  timelineRefresh:  document.getElementById('timelineRefreshBtn'),
  calToggleBtn:     document.getElementById('calendarToggleBtn'),
  calendarWrap:     document.getElementById('calendarWrap'),
  calGrid:          document.getElementById('calendarGrid'),
  calMonthLabel:    document.getElementById('calMonthLabel'),
  calPrev:          document.getElementById('calPrev'),
  calNext:          document.getElementById('calNext'),
  calClose:         document.getElementById('calClose'),
  castingToggleBtn: document.getElementById('castingToggleBtn'),
  selectAllCheck:   document.getElementById('selectAllCheck'),
  batchBar:         document.getElementById('batchBar'),
  batchCount:       document.getElementById('batchCount'),
  batchTemplateSelect: document.getElementById('batchTemplateSelect'),
  batchSendBtn:     document.getElementById('batchSendBtn'),
  batchClearBtn:    document.getElementById('batchClearBtn'),
  // contracts panel
  contractsPanelToggle: document.getElementById('contractsPanelToggle'),
  contractsBody:    document.getElementById('contractsBody'),
  contractsArrow:   document.getElementById('contractsArrow'),
  contractsCount:   document.getElementById('contractsCount'),
  contractsGrid:    document.getElementById('contractsGrid'),
  // contacts
  contactsPanelToggle: document.getElementById('contactsPanelToggle'),
  contactsBody:     document.getElementById('contactsBody'),
  contactsArrow:    document.getElementById('contactsArrow'),
  contactsCounts:   document.getElementById('contactsCounts'),
  contactsGrid:     document.getElementById('contactsGrid'),
  contactsSearch:   document.getElementById('contactsSearch'),
  // timeline modal
  tlModal:          document.getElementById('tlModal'),
  tlModalPhase:     document.getElementById('tlModalPhase'),
  tlModalId:        document.getElementById('tlModalId'),
  tlPhaseInput:     document.getElementById('tlPhaseInput'),
  tlStartInput:     document.getElementById('tlStartInput'),
  tlEndInput:       document.getElementById('tlEndInput'),
  tlStatusInput:    document.getElementById('tlStatusInput'),
  tlDescInput:      document.getElementById('tlDescInput'),
  tlModalClose:     document.getElementById('tlModalClose'),
  tlModalCancel:    document.getElementById('tlModalCancel'),
  tlModalSave:      document.getElementById('tlModalSave'),
  // email modal
  emailModal:       document.getElementById('emailModal'),
  emailModalClose:  document.getElementById('emailModalClose'),
  emailModalCancel: document.getElementById('emailModalCancel'),
  emailModalSend:   document.getElementById('emailModalSend'),
  emailModalRecipient: document.getElementById('emailModalRecipient'),
  emailModalTemplate:  document.getElementById('emailModalTemplate'),
  guideLinkField:   document.getElementById('guideLinkField'),
  guideLinkInput:   document.getElementById('guideLinkInput'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const user = sessionStorage.getItem('bleuskm_crew_user') || '';
  el.userChip.textContent = user.toUpperCase();
  isAdmin = user.toLowerCase() === ADMIN_USER;

  // Show casting toggle only for admin
  if (isAdmin && el.castingToggleBtn) {
    el.castingToggleBtn.classList.remove('hidden');
    el.castingToggleBtn.addEventListener('click', () => {
      window.location.href = CFG.CASTING_DASH;
    });
  }

  loadData();
  loadTimeline();
  loadContacts();

  el.refreshBtn.addEventListener('click', () => { loadData(); loadContacts(); });
  if (el.timelineRefresh) el.timelineRefresh.addEventListener('click', loadTimeline);
  el.retryBtn.addEventListener('click', loadData);
  el.logoutBtn.addEventListener('click', () => { sessionStorage.clear(); window.location.replace('./login.html'); });

  bindFilters();
  bindSearch();
  bindSelectAll();
  bindBatchBar();
  bindCalendar();
  bindTimelineModal();
  bindEmailModal();
  bindContactsPanel();
  bindContractsPanel();
});

/* ═══════════════════════════════════════════════════════════════
   DATA
═══════════════════════════════════════════════════════════════ */
async function loadData() {
  showState('loading');
  try {
    const [crewRes, contractRes] = await Promise.all([
      fetch(CFG.AIRTABLE + `?table=${encodeURIComponent(CFG.CREW_TABLE)}`),
      fetch(CFG.AIRTABLE + `?table=${encodeURIComponent(CFG.CONTRACT_TABLE)}`),
    ]);
    if (!crewRes.ok) throw new Error('Could not load crew data');
    const crewData     = await crewRes.json();
    const contractData = contractRes.ok ? await contractRes.json() : { records: [] };
    crewRecords     = crewData.records     || [];
    contractRecords = contractData.records || [];
    el.recordCount.textContent = `${crewRecords.length} crew member${crewRecords.length !== 1 ? 's' : ''}`;
    updateStats();
    renderTable();
    renderContractsPanel();
  } catch (err) {
    el.errorMsg.textContent = err.message;
    showState('error');
  }
}

async function loadContacts() {
  try {
    const res  = await fetch(CFG.AIRTABLE + `?table=${encodeURIComponent(CFG.CASTING_TABLE)}`);
    const data = res.ok ? await res.json() : { records: [] };
    castingRecords = (data.records || []).filter(r =>
      (r.fields['Cast Status'] || '').toLowerCase() === 'confirmed'
    );
    renderContacts();
  } catch { castingRecords = []; renderContacts(); }
}

function findContract(email) {
  return contractRecords.find(r =>
    (r.fields['Email'] || '').trim().toLowerCase() === (email || '').trim().toLowerCase()
  );
}

function updateStats() {
  const total     = crewRecords.length;
  const signed    = crewRecords.filter(r => findContract(r.fields['Email'] || '')).length;
  const pending   = crewRecords.filter(r => !findContract(r.fields['Email'] || '') && sessionSent[r.id] === CFG.T.Contract).length;
  const confirmed = crewRecords.filter(r => isForFinalHand(r.fields)).length;
  el.statTotal.textContent     = total;
  el.statSigned.textContent    = signed;
  el.statPending.textContent   = pending;
  el.statConfirmed.textContent = confirmed;
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE
═══════════════════════════════════════════════════════════════ */
async function loadTimeline() {
  if (!el.timelineTrack) return;
  el.timelineTrack.innerHTML = `<div class="timeline-loading"><div class="loader-ring-sm"></div><span>Loading...</span></div>`;
  try {
    const res  = await fetch(CFG.AIRTABLE + `?table=${encodeURIComponent(CFG.TL_TABLE)}`);
    if (!res.ok) throw new Error('failed');
    const data = await res.json();
    tlRecords  = (data.records || []).sort((a, b) =>
      (a.fields['Start Date'] || '').localeCompare(b.fields['Start Date'] || ''));
    renderTimeline();
    renderCalendar();
  } catch {
    if (el.timelineTrack) el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);">Could not load timeline.</span>`;
  }
}

function renderTimeline() {
  if (!el.timelineTrack) return;
  if (!tlRecords.length) { el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);">No phases found.</span>`; return; }
  el.timelineTrack.innerHTML = '';
  tlRecords.forEach(record => {
    const f      = record.fields;
    const status = (f['Status'] || 'Upcoming').toLowerCase();
    const dates  = [fmtDate(f['Start Date']), fmtDate(f['End Date'])].filter(Boolean).join(' — ');
    const card   = document.createElement('div');
    card.className = `phase-card ${status}`;
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="phase-status-dot"></div>
      <div class="phase-name">${esc(f['Phase'] || 'Untitled')}</div>
      <div class="phase-dates">${esc(dates) || 'No dates set'}</div>
      <div class="phase-status-label ${status}">${esc(f['Status'] || 'Upcoming')}</div>
      <span class="phase-edit-hint">Edit</span>`;
    card.addEventListener('click', () => openTimelineModal(record));
    el.timelineTrack.appendChild(card);
  });
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function getShootDates() {
  const phase = tlRecords.find(r => {
    const p = (r.fields['Phase'] || '').toLowerCase();
    return p.includes('production') && !p.includes('pre') && !p.includes('post');
  });
  if (!phase) return 'July 19–25, 2026';
  const start = phase.fields['Start Date'], end = phase.fields['End Date'];
  if (!start) return '';
  try {
    const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const e = end ? new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    return e ? `${s}–${e}` : s;
  } catch { return start; }
}

/* ── Timeline Modal ─────────────────────────────────────────── */
function openTimelineModal(record) {
  const f = record.fields;
  el.tlModalPhase.textContent = f['Phase'] || 'Phase';
  el.tlModalId.value          = record.id;
  el.tlPhaseInput.value       = f['Phase']       || '';
  el.tlStartInput.value       = f['Start Date']  || '';
  el.tlEndInput.value         = f['End Date']    || '';
  el.tlStatusInput.value      = f['Status']      || 'Upcoming';
  el.tlDescInput.value        = f['Description'] || '';
  el.tlModal.classList.remove('hidden');
}

function bindTimelineModal() {
  const close = () => el.tlModal.classList.add('hidden');
  el.tlModalClose.addEventListener('click', close);
  el.tlModalCancel.addEventListener('click', close);
  el.tlModal.addEventListener('click', e => { if (e.target === el.tlModal) close(); });
  el.tlModalSave.addEventListener('click', async () => {
    const id = el.tlModalId.value;
    el.tlModalSave.disabled = true; el.tlModalSave.textContent = 'Saving...';
    try {
      await patchAirtable(CFG.TL_TABLE, id, {
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
      tlRecords.sort((a, b) => (a.fields['Start Date']||'').localeCompare(b.fields['Start Date']||''));
      close(); renderTimeline(); renderCalendar();
      toast('Phase updated', 'success');
    } catch (err) { toast(`Save failed: ${err.message}`, 'error'); }
    finally { el.tlModalSave.disabled = false; el.tlModalSave.textContent = 'Save Changes'; }
  });
}

/* ── Calendar ───────────────────────────────────────────────── */
function bindCalendar() {
  if (!el.calToggleBtn) return;
  el.calToggleBtn.addEventListener('click', () => {
    const hidden = el.calendarWrap.classList.toggle('hidden');
    el.calToggleBtn.style.color = hidden ? '' : 'var(--gold)';
    if (!hidden) renderCalendar();
  });
  el.calClose.addEventListener('click', () => { el.calendarWrap.classList.add('hidden'); el.calToggleBtn.style.color = ''; });
  el.calPrev.addEventListener('click',  () => { calCurrentDate.setMonth(calCurrentDate.getMonth()-1); renderCalendar(); });
  el.calNext.addEventListener('click',  () => { calCurrentDate.setMonth(calCurrentDate.getMonth()+1); renderCalendar(); });
}

function renderCalendar() {
  if (!el.calGrid) return;
  const year = calCurrentDate.getFullYear(), month = calCurrentDate.getMonth(), today = new Date();
  el.calMonthLabel.textContent = calCurrentDate.toLocaleDateString('en-US', { month:'long', year:'numeric' }).toUpperCase();
  el.calGrid.innerHTML = '';
  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(d => {
    const h = document.createElement('div'); h.className='cal-day-header'; h.textContent=d; el.calGrid.appendChild(h);
  });
  const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate(), daysInPrev=new Date(year,month,0).getDate();
  const events={};
  tlRecords.forEach(r => {
    const f=r.fields; if (!f['Start Date']) return;
    const start=new Date(f['Start Date']+'T00:00:00'), end=f['End Date']?new Date(f['End Date']+'T00:00:00'):new Date(start);
    for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
      if (d.getMonth()!==month||d.getFullYear()!==year) continue;
      const key=d.getDate(), type=d.getTime()===start.getTime()?'phase-start':(d.getTime()===end.getTime()?'phase-end':'phase-span');
      if (!events[key]) events[key]=[];
      events[key].push({name:f['Phase']||'',type});
    }
  });
  for (let i=firstDay-1;i>=0;i--){const d=document.createElement('div');d.className='cal-day other-month';d.innerHTML=`<div class="cal-day-num">${daysInPrev-i}</div>`;el.calGrid.appendChild(d);}
  for (let d=1;d<=daysInMonth;d++){
    const isToday=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
    const cell=document.createElement('div');cell.className=`cal-day${isToday?' today':''}`;cell.innerHTML=`<div class="cal-day-num">${d}</div>`;
    (events[d]||[]).forEach(ev=>{const e=document.createElement('div');e.className=`cal-event ${ev.type}`;e.textContent=ev.type==='phase-span'?'':ev.name;if(ev.type==='phase-span'){e.style.height='4px';e.style.marginBottom='2px';}cell.appendChild(e);});
    el.calGrid.appendChild(cell);
  }
  const total=Math.ceil((firstDay+daysInMonth)/7)*7;
  for(let d=1;d<=total-firstDay-daysInMonth;d++){const c=document.createElement('div');c.className='cal-day other-month';c.innerHTML=`<div class="cal-day-num">${d}</div>`;el.calGrid.appendChild(c);}
}

/* ═══════════════════════════════════════════════════════════════
   CONTACTS PANEL
═══════════════════════════════════════════════════════════════ */
function bindContactsPanel() {
  el.contactsPanelToggle.addEventListener('click', () => {
    const hidden = el.contactsBody.classList.toggle('hidden');
    el.contactsArrow.style.transform = hidden ? '' : 'rotate(90deg)';
  });
  el.contactsSearch.addEventListener('input', () => renderContacts(el.contactsSearch.value.trim().toLowerCase()));
}

function renderContacts(query = '') {
  const coreCrewContacts = crewRecords.filter(r =>
    (r.fields['Status'] || '').toLowerCase() === 'core'
  );
  const castContacts = castingRecords;

  const totalCount = coreCrewContacts.length + castContacts.length;
  el.contactsCounts.textContent = `${coreCrewContacts.length} crew · ${castContacts.length} cast`;

  const filtered = (items, fields) => items.filter(r => {
    if (!query) return true;
    return fields.some(f => (r.fields[f] || '').toLowerCase().includes(query));
  });

  const filteredCrew = filtered(coreCrewContacts, ['Name', 'Email', 'Phone']);
  const filteredCast = filtered(castContacts, ['Name', 'Email', 'Location']);

  if (!filteredCrew.length && !filteredCast.length) {
    el.contactsGrid.innerHTML = `<p style="font-size:10px;color:var(--muted);padding:16px 0;">No contacts match.</p>`;
    return;
  }

  el.contactsGrid.innerHTML = '';

  if (filteredCrew.length) {
    const hdr = document.createElement('div');
    hdr.className = 'contacts-section-label'; hdr.textContent = 'CORE CREW';
    el.contactsGrid.appendChild(hdr);
    filteredCrew.forEach(r => {
      const f = r.fields;
      el.contactsGrid.appendChild(makeContactCard(
        f['Name']  || '—',
        f['Email'] || '—',
        f['Phone'] || '—',
        'crew'
      ));
    });
  }

  if (filteredCast.length) {
    const hdr = document.createElement('div');
    hdr.className = 'contacts-section-label'; hdr.textContent = 'CONFIRMED CAST';
    el.contactsGrid.appendChild(hdr);
    filteredCast.forEach(r => {
      const f = r.fields;
      el.contactsGrid.appendChild(makeContactCard(
        f['Name']     || '—',
        f['Email']    || '—',
        f['Location'] || '—',
        'cast'
      ));
    });
  }
}

function makeContactCard(name, emailOrPhone, detail, type) {
  const card = document.createElement('div');
  card.className = `contact-card contact-${type}`;
  card.innerHTML = `
    <div class="contact-name">${esc(name)}</div>
    <div class="contact-email"><a href="mailto:${esc(emailOrPhone)}">${esc(emailOrPhone)}</a></div>
    <div class="contact-detail">${esc(detail)}</div>`;
  return card;
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACTS PANEL
═══════════════════════════════════════════════════════════════ */
function bindContractsPanel() {
  if (!el.contractsPanelToggle) return;
  el.contractsPanelToggle.addEventListener('click', () => {
    const hidden = el.contractsBody.classList.toggle('hidden');
    el.contractsArrow.style.transform = hidden ? '' : 'rotate(90deg)';
  });
}

function renderContractsPanel() {
  if (!el.contractsGrid) return;
  const signed = contractRecords.filter(r => r.fields['Signature'] && r.fields['Date Signed']);
  el.contractsCount.textContent = `${signed.length} signed`;

  if (!signed.length) {
    el.contractsGrid.innerHTML = `<p style="font-size:10px;color:var(--muted);padding:12px 0;">No signed contracts yet.</p>`;
    return;
  }

  el.contractsGrid.innerHTML = '';
  signed.forEach(r => {
    const f       = r.fields;
    const name    = (f['Name']        || '').trim();
    const role    = (f['Role']        || '').trim();
    const date    = (f['Date Signed'] || '').trim();
    const sigUrl  = Array.isArray(f['Signature']) ? (f['Signature'][0]?.url || '') : (f['Signature'] || '');

    const card = document.createElement('div');
    card.className = 'contract-record-card';
    card.innerHTML = `
      <div class="cr-name">${esc(name) || '—'}</div>
      <div class="cr-role">${esc(role) || '—'}</div>
      <div class="cr-date">${esc(date) || '—'}</div>
      ${sigUrl ? `<img class="cr-sig" src="${esc(sigUrl)}" alt="Signature" />` : '<span class="cr-nosig">No image</span>'}
      ${sigUrl ? `<a class="cr-view" href="${esc(sigUrl)}" target="_blank" rel="noopener">View Full &#8599;</a>` : ''}`;
    el.contractsGrid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   GROUP LOGIC
═══════════════════════════════════════════════════════════════ */
function isForFinalHand(fields) {
  const v = fields['For the Final Hand'];
  return v === true || v === 1 || v === 'true';
}
function hasPrefRole(fields) {
  return (fields['Preferred_role_by_Director'] || '').trim().length > 0;
}
function getGroup(record) {
  const f      = record.fields;
  const status = (f['Status'] || '').toLowerCase().trim();
  const fh     = isForFinalHand(f);
  const pref   = hasPrefRole(f);
  if (pref)                          return 'role_redirect'; // T20
  if (fh && !pref)                   return 'contract';      // T21
  if (status === 'not this project') return 'not_project';   // T22
  if (status === 'support')          return 'support';       // T23
  if (status === 'core' && !fh)      return 'core';          // T25
  return 'unassigned';
}

/* ═══════════════════════════════════════════════════════════════
   CHECKBOXES + BATCH BAR
═══════════════════════════════════════════════════════════════ */
function bindSelectAll() {
  el.selectAllCheck.addEventListener('change', () => {
    const visible = getVisible();
    if (el.selectAllCheck.checked) visible.forEach(r => selectedIds.add(r.id));
    else selectedIds.clear();
    renderTable();
    updateBatchBar();
  });
}

function updateBatchBar() {
  const count = selectedIds.size;
  if (count === 0) {
    el.batchBar.classList.add('hidden');
    return;
  }
  el.batchBar.classList.remove('hidden');
  el.batchCount.textContent = `${count} selected`;
}

function bindBatchBar() {
  el.batchClearBtn.addEventListener('click', () => {
    selectedIds.clear(); el.selectAllCheck.checked = false;
    renderTable(); updateBatchBar();
  });

  el.batchSendBtn.addEventListener('click', async () => {
    const tid = parseInt(el.batchTemplateSelect.value);
    if (!tid) { toast('Please choose a template.', 'error'); return; }

    const targets = crewRecords.filter(r => selectedIds.has(r.id));
    if (!targets.length) return;

    if (!confirm(`Send template ${tid} to ${targets.length} crew member${targets.length!==1?'s':''}?`)) return;

    el.batchSendBtn.disabled = true; el.batchSendBtn.textContent = 'Sending...';
    let ok=0, fail=0;
    for (const record of targets) {
      try { await fireEmail(record, tid); sessionSent[record.id] = tid; ok++; }
      catch { fail++; }
      await sleep(280);
    }
    el.batchSendBtn.disabled = false; el.batchSendBtn.textContent = 'Send to Selected';
    toast(`${ok} sent${fail?`, ${fail} failed`:''}`, fail&&!ok?'error':'success');
    selectedIds.clear(); el.selectAllCheck.checked = false;
    renderTable(); updateBatchBar(); updateStats();
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL MODAL (per-row send)
═══════════════════════════════════════════════════════════════ */
function bindEmailModal() {
  const close = () => { el.emailModal.classList.add('hidden'); pendingEmailRecord = null; el.emailModalTemplate.value = ''; el.guideLinkField.classList.add('hidden'); };
  el.emailModalClose.addEventListener('click', close);
  el.emailModalCancel.addEventListener('click', close);
  el.emailModal.addEventListener('click', e => { if (e.target === el.emailModal) close(); });

  el.emailModalTemplate.addEventListener('change', () => {
    el.guideLinkField.classList.toggle('hidden', el.emailModalTemplate.value !== '26');
  });

  el.emailModalSend.addEventListener('click', async () => {
    const tid = parseInt(el.emailModalTemplate.value);
    if (!tid) { toast('Select a template.', 'error'); return; }
    if (!pendingEmailRecord) return;

    el.emailModalSend.disabled = true; el.emailModalSend.textContent = '...';
    try {
      if (tid === CFG.T.ContractOnly) {
    params.CONTRACT_LINK = buildContractLink(name, email, role, 'The Final Hand');
  }
  if (tid === CFG.T.Guide) {
        const guideLink = el.guideLinkInput.value.trim();
        if (!guideLink) { toast('Paste the guide link first.', 'error'); el.emailModalSend.disabled=false; el.emailModalSend.textContent='Send Email'; return; }
        await fireEmail(pendingEmailRecord, tid, guideLink);
      } else {
        await fireEmail(pendingEmailRecord, tid);
      }
      sessionSent[pendingEmailRecord.id] = tid;
      toast('Email sent', 'success');
      renderTable(); updateStats();
      close();
    } catch (err) {
      toast(`Failed: ${err.message}`, 'error');
    }
    el.emailModalSend.disabled = false; el.emailModalSend.textContent = 'Send Email';
  });
}

function openEmailModal(record) {
  pendingEmailRecord = record;
  const f = record.fields;
  const name  = (f['Name']  || '').trim();
  const email = (f['Email'] || '').trim();
  const group = getGroup(record);

  // Pre-select the correct template based on group
  const groupTemplate = {
    role_redirect: '20', contract: '21', not_project: '22', support: '23', core: '25',
  };
  el.emailModalTemplate.value = groupTemplate[group] || '';
  el.guideLinkField.classList.add('hidden');
  el.guideLinkInput.value = (f['Guide Link'] || '').trim();
  el.emailModalRecipient.textContent = `${name} — ${email}`;
  el.emailModal.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL FIRE
═══════════════════════════════════════════════════════════════ */
async function fireEmail(record, tid, guideLink = '') {
  const f        = record.fields;
  const email    = (f['Email'] || '').trim();
  const name     = (f['Name']  || '').trim();
  const role     = (f['Role']  || '').trim();
  const prefRole = (f['Preferred_role_by_Director'] || '').trim();
  const onSetRole= prefRole || role;
  const ltRoles  = (f['LT_Roles'] || '').trim();

  if (!email) throw new Error('No email address');

  const params = {
    NAME:                       name,
    ROLE:                       onSetRole,
    LT_ROLES:                   ltRoles,
    FILM:                       'The Final Hand',
    PREFERRED_ROLE_BY_DIRECTOR: prefRole,
  };

  if (tid === CFG.T.Contract) {
    params.CONTRACT_LINK = buildContractLink(name, email, role, 'The Final Hand');
  }
  if (tid === CFG.T.Guide) {
    const gl = guideLink || (f['Guide Link'] || '').trim();
    if (!gl) throw new Error('No guide link set for this crew member');
    params.GUIDE_LINK     = gl;
    params.SHOOT_DATES    = getShootDates();
    params.SHOOT_LOCATION = CFG.LOCATION;
  }

  await sendBrevo(email, tid, params);
}

async function sendBrevo(email, templateId, params) {
  const res = await fetch(CFG.BREVO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: CFG.BREVO_EMAIL, payload: { to: [{ email }], templateId, params } }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.message || `Brevo ${res.status}`); }
  return res.json();
}

function buildContractLink(name, email, role, film) {
  return CFG.CONTRACT_BASE
    + '?name='  + encodeURIComponent(name)
    + '&email=' + encodeURIComponent(email)
    + '&role='  + encodeURIComponent(role)
    + '&film='  + encodeURIComponent(film || 'The Final Hand');
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
      renderTable();
    });
  });
}
function bindSearch() {
  el.searchInput.addEventListener('input', () => {
    searchQuery = el.searchInput.value.trim().toLowerCase();
    el.searchClear.classList.toggle('hidden', !searchQuery);
    renderTable();
  });
  el.searchClear.addEventListener('click', () => {
    el.searchInput.value = ''; searchQuery = '';
    el.searchClear.classList.add('hidden'); renderTable(); el.searchInput.focus();
  });
}

function getVisible() {
  return crewRecords.filter(r => {
    const email    = (r.fields['Email'] || '').trim();
    const contract = findContract(email);
    const sent     = sessionSent[r.id] === CFG.T.Contract;
    if (activeFilter === 'Signed'  && !contract)            return false;
    if (activeFilter === 'Sent'    && !sent)                return false;
    if (activeFilter === 'Pending' && !(sent && !contract)) return false;
    if (searchQuery) {
      const hay = [r.fields['Name']||'', r.fields['Email']||'', r.fields['Role']||''].join(' ').toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════
   RENDER TABLE
═══════════════════════════════════════════════════════════════ */
const GROUP_LABEL = { role_redirect:'Role Redirect', contract:'Final Hand', not_project:'Not This Project', support:'Support', core:'Core', unassigned:'' };
const GROUP_COLOR = { role_redirect:'rgba(218,175,55,0.85)', contract:'rgba(120,180,130,0.85)', not_project:'rgba(200,80,80,0.85)', support:'rgba(130,170,220,0.85)', core:'rgba(180,140,220,0.85)', unassigned:'var(--dim)' };

function renderTable() {
  const records = getVisible();
  if (!records.length) { showState('empty'); return; }
  el.tbody.innerHTML = '';
  records.forEach(r => buildRow(r));
  showState('table');
}

function buildRow(record) {
  const f   = record.fields;
  const id  = record.id;
  const name     = (f['Name']     || '').trim();
  const email    = (f['Email']    || '').trim();
  const role     = (f['Role']     || '').trim();
  const phone    = (f['Phone']    || '').trim();
  const ltRoles  = (f['LT_Roles'] || '').trim();
  const prefRole = (f['Preferred_role_by_Director'] || '').trim();
  const status   = (f['Status']   || '').trim();
  const fh       = isForFinalHand(f);
  const group    = getGroup(record);
  const contract = findContract(email);
  const isExpanded   = expandedIds.has(id);
  const isSelected   = selectedIds.has(id);
  const isSigned     = !!contract;
  const contractSent = sessionSent[id] === CFG.T.Contract;
  const sigUrl       = contract ? (Array.isArray(contract.fields['Signature']) ? (contract.fields['Signature'][0]?.url||'') : (contract.fields['Signature']||'')) : '';
  const dateSigned   = contract ? (contract.fields['Date Signed']||'') : '';

  const summaryRow = document.createElement('tr');
  summaryRow.className = `summary-row${isSelected ? ' row-sel' : ''}`;
  summaryRow.dataset.id = id;

  // Checkbox
  const tdCb = document.createElement('td'); tdCb.className = 'col-check';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isSelected;
  cb.addEventListener('change', e => {
    e.stopPropagation();
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
    summaryRow.classList.toggle('row-sel', cb.checked);
    updateBatchBar();
  });
  tdCb.appendChild(cb); summaryRow.appendChild(tdCb);

  // Arrow
  const tdArrow = document.createElement('td'); tdArrow.className = 'col-arrow';
  tdArrow.innerHTML = '<span class="expand-arrow">&#9654;</span>';
  summaryRow.appendChild(tdArrow);

  // Name + pill
  const pill = GROUP_LABEL[group] ? `<span style="margin-left:8px;font-size:7px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GROUP_COLOR[group]};border:1px solid ${GROUP_COLOR[group]};padding:2px 6px;border-radius:2px;vertical-align:middle;">${GROUP_LABEL[group]}</span>` : '';
  summaryRow.appendChild(makeTd(`<span class="cell-name">${esc(name)||'—'}</span>${pill}`));

  // Email
  summaryRow.appendChild(makeTd(`<span style="font-size:11px;color:var(--muted);">${esc(email)||'—'}</span>`));

  // Role
  const roleDisplay = prefRole ? `${esc(role)} <span style="font-size:9px;color:var(--golddim);">&#8594; ${esc(prefRole)}</span>` : esc(role)||'—';
  summaryRow.appendChild(makeTd(`<span class="cell-role">${roleDisplay}</span>`));

  // Contract badge
  let contractHtml = '<span style="color:var(--dim);font-size:11px;">—</span>';
  if (isSigned)           contractHtml = `<span class="contract-badge signed">Signed</span>`;
  else if (contractSent)  contractHtml = `<span class="contract-badge sent">Sent</span>`;
  summaryRow.appendChild(makeTd(contractHtml));

  // Date signed
  summaryRow.appendChild(makeTd(dateSigned ? `<span style="font-size:11px;color:var(--muted);">${esc(dateSigned)}</span>` : `<span style="color:var(--dim);font-size:11px;">—</span>`));

  // Actions
  const tdAction = document.createElement('td'); tdAction.className = 'col-action';
  const ag = document.createElement('div'); ag.className = 'action-group';

  if (email) {
    // Primary action button based on group
    if (group === 'role_redirect') {
      makeActionBtn(ag, id, email, 'Send Role Redirect', CFG.T.RoleRedirect, record);
    }
    if (group === 'contract') {
      if (isSigned) {
        const b=document.createElement('button'); b.className='action-btn'; b.textContent='✓ Signed'; b.disabled=true; b.style.color='var(--signed)'; b.style.borderColor='rgba(120,180,130,0.28)'; ag.appendChild(b);
      } else {
        makeActionBtn(ag, id, email, contractSent?'Resend Contract':'Send Contract Email', CFG.T.Contract, record);
      }
    }
    if (group === 'not_project') makeActionBtn(ag, id, email, 'Send Not This Project', CFG.T.NotProject, record);
    if (group === 'support')     makeActionBtn(ag, id, email, 'Send Support Email',     CFG.T.Support,    record);
    if (group === 'core')        makeActionBtn(ag, id, email, 'Send Core Email',        CFG.T.Core,       record);

    // Send Contract Only (T27) — available for any crew member with email
    if (group !== 'not_project' && group !== 'support' && group !== 'core') {
      // only show for role_redirect and contract groups (people who may need contract)
    }
    // Standalone Send Contract button (T27) — shows for role_redirect and contract groups
    if (group === 'role_redirect' || group === 'contract') {
      const scBtn = document.createElement('button');
      scBtn.className = 'action-btn';
      if (sessionSent[id] === CFG.T.ContractOnly) {
        scBtn.textContent = 'Contract Sent ✓'; scBtn.disabled = true;
        scBtn.style.color = 'var(--signed)'; scBtn.style.borderColor = 'rgba(120,180,130,0.28)';
      } else if (isSigned) {
        scBtn.textContent = '✓ Signed'; scBtn.disabled = true;
        scBtn.style.color = 'var(--signed)'; scBtn.style.borderColor = 'rgba(120,180,130,0.28)';
      } else {
        scBtn.textContent = 'Send Contract';
        scBtn.addEventListener('click', async e => {
          e.stopPropagation();
          scBtn.disabled = true; scBtn.textContent = '...';
          try {
            await fireEmail(record, CFG.T.ContractOnly);
            sessionSent[id] = CFG.T.ContractOnly;
            scBtn.textContent = 'Contract Sent ✓';
            scBtn.style.color = 'var(--signed)'; scBtn.style.borderColor = 'rgba(120,180,130,0.28)';
            toast(`Contract sent to ${email}`, 'success');
          } catch(err) {
            scBtn.disabled = false; scBtn.textContent = 'Send Contract';
            toast(`Failed: ${err.message}`, 'error');
          }
        });
      }
      ag.appendChild(scBtn);
    }

    // Send Guide — Final Hand signed only
    if (group === 'contract' && isSigned) {
      const guideLink = (f['Guide Link'] || '').trim();
      const gb = document.createElement('button'); gb.className = 'action-btn';
      if (sessionSent[id] === CFG.T.Guide) { gb.textContent='Guide Sent ✓'; gb.disabled=true; gb.style.color='var(--signed)'; gb.style.borderColor='rgba(120,180,130,0.28)'; }
      else if (!guideLink) { gb.textContent='No Guide Yet'; gb.disabled=true; gb.style.opacity='0.35'; }
      else {
        gb.textContent = 'Send Guide';
        gb.addEventListener('click', async e => {
          e.stopPropagation(); gb.disabled=true; gb.textContent='...';
          try {
            await fireEmail(record, CFG.T.Guide);
            sessionSent[id]=CFG.T.Guide; gb.textContent='Guide Sent ✓'; gb.style.color='var(--signed)'; gb.style.borderColor='rgba(120,180,130,0.28)';
            toast(`Guide sent to ${email}`,'success');
          } catch(err){ gb.disabled=false; gb.textContent='Send Guide'; toast(`Failed: ${err.message}`,'error'); }
        });
      }
      ag.appendChild(gb);
    }

    // View Sig
    if (sigUrl) {
      const vb=document.createElement('button'); vb.className='action-btn'; vb.textContent='View Sig';
      vb.addEventListener('click', e=>{ e.stopPropagation(); window.open(sigUrl,'_blank'); });
      ag.appendChild(vb);
    }

    // Choose Email (modal)
    const chooseBtn=document.createElement('button'); chooseBtn.className='action-btn btn-choose';
    chooseBtn.textContent='Choose Email';
    chooseBtn.addEventListener('click', e=>{ e.stopPropagation(); openEmailModal(record); });
    ag.appendChild(chooseBtn);
  }

  if (!ag.children.length) ag.innerHTML='<span style="font-size:9px;color:var(--dim);">—</span>';
  tdAction.appendChild(ag); summaryRow.appendChild(tdAction);

  summaryRow.addEventListener('click', e => {
    if (e.target.closest('button,a,input')) return;
    toggleExpand(id, detailRow);
    const expanded = expandedIds.has(id);
    summaryRow.classList.toggle('expanded', expanded);
    const arrow = summaryRow.querySelector('.expand-arrow');
    if (arrow) arrow.style.transform = expanded ? 'rotate(90deg)' : '';
  });
  el.tbody.appendChild(summaryRow);

  // Detail row
  const detailRow = document.createElement('tr');
  detailRow.className = `detail-row${isExpanded?' open':''}`;
  const detailTd = document.createElement('td'); detailTd.colSpan = 8;
  const panel = document.createElement('div'); panel.className = 'detail-panel';

  panel.appendChild(detailField('EMAIL', `<a href="mailto:${esc(email)}">${esc(email)||'—'}</a>`));
  panel.appendChild(detailField('PHONE', esc(phone)||'—'));
  panel.appendChild(detailField('STATUS', esc(status)||'—'));
  if (fh)       panel.appendChild(detailField('FINAL HAND', 'Confirmed'));
  if (ltRoles)  panel.appendChild(detailField('EXPERIENCE', esc(ltRoles)));
  if (prefRole) panel.appendChild(detailField('REDIRECT ROLE', esc(prefRole)));
  if (dateSigned) panel.appendChild(detailField('DATE SIGNED', esc(dateSigned)));
  if (sessionSent[id]) {
    const tname={[CFG.T.RoleRedirect]:'Role Redirect',[CFG.T.Contract]:'Contract',[CFG.T.NotProject]:'Not This Project',[CFG.T.Support]:'Support',[CFG.T.Core]:'Core',[CFG.T.Guide]:'Guide'};
    panel.appendChild(detailField('EMAIL SENT THIS SESSION', esc(tname[sessionSent[id]]||'Yes')));
  }
  if (sigUrl) {
    const sd=document.createElement('div'); sd.className='detail-field'; sd.innerHTML=`<span class="detail-label">SIGNATURE</span>`;
    const img=document.createElement('img'); img.src=sigUrl; img.className='sig-preview'; img.alt='Signature';
    sd.appendChild(img); panel.appendChild(sd);
  }

  // Notes
  const notes=(f['Notes']||'').trim();
  const notesDf=document.createElement('div'); notesDf.className='detail-field'; notesDf.style.gridColumn='span 2';
  const notesLbl=document.createElement('span'); notesLbl.className='detail-label'; notesLbl.textContent='NOTES';
  const notesDiv=document.createElement('div');
  notesDiv.className='editable detail-value'; notesDiv.contentEditable='true';
  notesDiv.textContent=notes; notesDiv.setAttribute('data-original',notes);
  notesDiv.addEventListener('blur', async()=>{
    const nv=notesDiv.textContent.trim(), ov=notesDiv.getAttribute('data-original');
    if(nv===ov) return;
    try {
      await patchAirtable(CFG.CREW_TABLE,id,{Notes:nv});
      notesDiv.setAttribute('data-original',nv);
      const rec=crewRecords.find(r=>r.id===id); if(rec) rec.fields['Notes']=nv;
      notesDiv.classList.add('saved'); setTimeout(()=>notesDiv.classList.remove('saved'),1400);
    } catch(err){
      notesDiv.textContent=ov;
      notesDiv.classList.add('saveerr'); setTimeout(()=>notesDiv.classList.remove('saveerr'),1400);
      toast(`Save failed: ${err.message}`,'error');
    }
  });
  notesDiv.addEventListener('keydown', e=>{if(e.key==='Enter'){e.preventDefault();notesDiv.blur();}});
  notesDf.appendChild(notesLbl); notesDf.appendChild(notesDiv); panel.appendChild(notesDf);

  detailTd.appendChild(panel); detailRow.appendChild(detailTd);
  el.tbody.appendChild(detailRow);
}

function makeActionBtn(ag, id, email, label, tid, record) {
  const btn=document.createElement('button'); btn.className='action-btn';
  if (sessionSent[id]===tid){ btn.textContent='Sent ✓'; btn.disabled=true; btn.style.color='var(--signed)'; btn.style.borderColor='rgba(120,180,130,0.28)'; }
  else { btn.textContent=label; }
  btn.addEventListener('click', async e=>{
    e.stopPropagation();
    const orig=btn.textContent; btn.disabled=true; btn.textContent='...';
    try {
      await fireEmail(record,tid);
      sessionSent[id]=tid; btn.textContent='Sent ✓'; btn.style.color='var(--signed)'; btn.style.borderColor='rgba(120,180,130,0.28)';
      toast(`Sent to ${email}`,'success'); updateStats();
    } catch(err){ btn.disabled=false; btn.textContent=orig; toast(`Failed: ${err.message}`,'error'); }
  });
  ag.appendChild(btn);
}

/* ── Airtable ────────────────────────────────────────────────── */
async function patchAirtable(table, id, fields) {
  const res = await fetch(CFG.AIRTABLE, {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table, id, fields }),
  });
  if (!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||'Patch failed'); }
  return res.json();
}

/* ── Helpers ────────────────────────────────────────────────── */
function toggleExpand(id, detailRow) {
  if (expandedIds.has(id)){ expandedIds.delete(id); detailRow.classList.remove('open'); }
  else { expandedIds.add(id); detailRow.classList.add('open'); }
}
function detailField(label, valueHtml) {
  const df=document.createElement('div'); df.className='detail-field';
  df.innerHTML=`<span class="detail-label">${label}</span><span class="detail-value">${valueHtml}</span>`;
  return df;
}
function makeTd(html){ const td=document.createElement('td'); td.innerHTML=html; return td; }
function showState(state){
  [el.loading,el.error,el.empty,el.tableWrap].forEach(e=>e.classList.add('hidden'));
  if(state==='loading') el.loading.classList.remove('hidden');
  else if(state==='error') el.error.classList.remove('hidden');
  else if(state==='empty') el.empty.classList.remove('hidden');
  else if(state==='table') el.tableWrap.classList.remove('hidden');
}
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function toast(msg,type='success'){
  const d=document.createElement('div'); d.className=`toast t${type}`; d.textContent=msg;
  el.toastStack.appendChild(d);
  setTimeout(()=>{ d.classList.add('tout'); d.addEventListener('animationend',()=>d.remove(),{once:true}); },4200);
}
