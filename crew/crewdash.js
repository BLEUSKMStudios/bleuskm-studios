/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Crew Portal v3
   crewdash.js
═══════════════════════════════════════════════════════════════ */

(function () {
  if (sessionStorage.getItem('bleuskm_crew_auth') !== 'true') {
    window.location.replace('./login.html');
  }
})();

const CFG = {
  CREW_TABLE:     'Crew applications',
  CONTRACT_TABLE: 'Contracts',
  TL_TABLE:       'Production Timeline',
  AIRTABLE:       '/.netlify/functions/airtable-proxy',
  BREVO:          '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:    'https://api.brevo.com/v3/smtp/email',
  CONTRACT_BASE:  'https://bleuskm.com/crew/contract',
  TEMPLATE: {
    RoleRedirect: 20,  // Has Preferred_role_by_Director value
    Contract:     21,  // For the Final Hand checked + no Preferred_role_by_Director
    NotProject:   22,  // Status = not this project
    Support:      23,  // Status = support
    Core:         25,  // Status = core + For the Final Hand unchecked
  },
};

/* ── State ──────────────────────────────────────────────────── */
let crewRecords     = [];
let contractRecords = [];
let tlRecords       = [];
let calCurrentDate  = new Date();
let activeFilter    = 'All';
let searchQuery     = '';
let expandedIds     = new Set();
let sessionSent     = {};

/* ── DOM ────────────────────────────────────────────────────── */
const el = {
  loading:        document.getElementById('stateLoading'),
  error:          document.getElementById('stateError'),
  errorMsg:       document.getElementById('stateErrorMsg'),
  empty:          document.getElementById('stateEmpty'),
  tableWrap:      document.getElementById('tableWrap'),
  tbody:          document.getElementById('crewTableBody'),
  recordCount:    document.getElementById('recordCount'),
  refreshBtn:     document.getElementById('refreshBtn'),
  logoutBtn:      document.getElementById('logoutBtn'),
  userChip:       document.getElementById('userChip'),
  searchInput:    document.getElementById('searchInput'),
  searchClear:    document.getElementById('searchClear'),
  retryBtn:       document.getElementById('retryBtn'),
  toastStack:     document.getElementById('toastStack'),
  statTotal:      document.getElementById('statTotal'),
  statSigned:     document.getElementById('statSigned'),
  statPending:    document.getElementById('statPending'),
  statConfirmed:  document.getElementById('statConfirmed'),
  timelineTrack:   document.getElementById('timelineTrack'),
  timelineRefresh: document.getElementById('timelineRefreshBtn'),
  calToggleBtn:    document.getElementById('calendarToggleBtn'),
  calendarWrap:    document.getElementById('calendarWrap'),
  calGrid:         document.getElementById('calendarGrid'),
  calMonthLabel:   document.getElementById('calMonthLabel'),
  calPrev:         document.getElementById('calPrev'),
  calNext:         document.getElementById('calNext'),
  calClose:        document.getElementById('calClose'),
  btnRoleRedirect:document.getElementById('btnRoleRedirect'),
  btnContract:    document.getElementById('btnContract'),
  btnNotProject:  document.getElementById('btnNotProject'),
  btnSupport:     document.getElementById('btnSupport'),
  btnCore:        document.getElementById('btnCore'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  el.userChip.textContent = (sessionStorage.getItem('bleuskm_crew_user') || '').toUpperCase();
  loadData();
  loadTimeline();
  el.refreshBtn.addEventListener('click', loadData);
  el.timelineRefresh.addEventListener('click', loadTimeline);
  el.retryBtn.addEventListener('click', loadData);
  el.logoutBtn.addEventListener('click', () => { sessionStorage.clear(); window.location.replace('./login.html'); });
  bindFilters();
  bindSearch();
  bindStatusButtons();
  bindCalendar();
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
    updateGroupCounts();
  } catch (err) {
    el.errorMsg.textContent = err.message;
    showState('error');
  }
}

function findContract(email) {
  return contractRecords.find(r =>
    (r.fields['Email'] || '').trim().toLowerCase() === (email || '').trim().toLowerCase()
  );
}

function updateStats() {
  const total     = crewRecords.length;
  const signed    = crewRecords.filter(r => findContract(r.fields['Email'] || '')).length;
  const pending   = total - signed;
  const confirmed = crewRecords.filter(r => {
    const f = r.fields;
    return isForFinalHand(f) || (f['Status'] || '').toLowerCase() === 'core';
  }).length;
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
    if (!res.ok) throw new Error('Timeline fetch failed');
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
    const dateStr = [formatTLDate(f['Start Date']), formatTLDate(f['End Date'])].filter(Boolean).join(' — ');
    const card   = document.createElement('div');
    card.className = `phase-card ${status}`;
    card.innerHTML = `
      <div class="phase-status-dot"></div>
      <div class="phase-name">${esc(f['Phase'] || 'Untitled')}</div>
      <div class="phase-dates">${esc(dateStr) || 'No dates set'}</div>
      <div class="phase-status-label ${status}">${esc(f['Status'] || 'Upcoming')}</div>`;
    el.timelineTrack.appendChild(card);
  });
}

function formatTLDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function bindCalendar() {
  if (!el.calToggleBtn) return;
  el.calToggleBtn.addEventListener('click', () => {
    const nowHidden = el.calendarWrap.classList.toggle('hidden');
    el.calToggleBtn.style.color = nowHidden ? '' : 'var(--gold)';
    if (!nowHidden) renderCalendar();
  });
  el.calClose.addEventListener('click', () => { el.calendarWrap.classList.add('hidden'); el.calToggleBtn.style.color = ''; });
  el.calPrev.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() - 1); renderCalendar(); });
  el.calNext.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() + 1); renderCalendar(); });
}

function renderCalendar() {
  if (!el.calGrid) return;
  const year = calCurrentDate.getFullYear(), month = calCurrentDate.getMonth(), today = new Date();
  el.calMonthLabel.textContent = calCurrentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  el.calGrid.innerHTML = '';
  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(d => {
    const h = document.createElement('div'); h.className = 'cal-day-header'; h.textContent = d; el.calGrid.appendChild(h);
  });
  const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate(), daysInPrev = new Date(year, month, 0).getDate();
  const phaseEvents = {};
  tlRecords.forEach(r => {
    const f = r.fields; if (!f['Start Date']) return;
    const start = new Date(f['Start Date'] + 'T00:00:00'), end = f['End Date'] ? new Date(f['End Date'] + 'T00:00:00') : new Date(start);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      const key = d.getDate(), type = d.getTime() === start.getTime() ? 'phase-start' : (d.getTime() === end.getTime() ? 'phase-end' : 'phase-span');
      if (!phaseEvents[key]) phaseEvents[key] = [];
      phaseEvents[key].push({ name: f['Phase'] || '', type });
    }
  });
  for (let i = firstDay - 1; i >= 0; i--) { const d = document.createElement('div'); d.className = 'cal-day other-month'; d.innerHTML = `<div class="cal-day-num">${daysInPrev - i}</div>`; el.calGrid.appendChild(d); }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const cell = document.createElement('div'); cell.className = `cal-day${isToday ? ' today' : ''}`; cell.innerHTML = `<div class="cal-day-num">${d}</div>`;
    (phaseEvents[d] || []).forEach(ev => { const evEl = document.createElement('div'); evEl.className = `cal-event ${ev.type}`; evEl.textContent = ev.type === 'phase-span' ? '' : ev.name; if (ev.type === 'phase-span') { evEl.style.height = '4px'; evEl.style.marginBottom = '2px'; } cell.appendChild(evEl); });
    el.calGrid.appendChild(cell);
  }
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let d = 1; d <= totalCells - firstDay - daysInMonth; d++) { const cell = document.createElement('div'); cell.className = 'cal-day other-month'; cell.innerHTML = `<div class="cal-day-num">${d}</div>`; el.calGrid.appendChild(cell); }
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

  if (pref)                          return 'role_redirect'; // template 20 — has redirect role
  if (fh && !pref)                   return 'contract';      // template 21 — Final Hand, no redirect
  if (status === 'not this project') return 'not_project';   // template 22
  if (status === 'support')          return 'support';       // template 23
  if (status === 'core' && !fh)      return 'core';          // template 25
  return 'unassigned';
}

function getGroupMembers(group) {
  return crewRecords.filter(r => getGroup(r) === group);
}

function updateGroupCounts() {
  const counts = {
    role_redirect: getGroupMembers('role_redirect').length,
    contract:      getGroupMembers('contract').length,
    not_project:   getGroupMembers('not_project').length,
    support:       getGroupMembers('support').length,
    core:          getGroupMembers('core').length,
  };
  if (el.btnRoleRedirect) el.btnRoleRedirect.textContent = `Send Role Redirect${counts.role_redirect ? ` (${counts.role_redirect})` : ''}`;
  if (el.btnContract)     el.btnContract.textContent     = `Send Contract${counts.contract ? ` (${counts.contract})` : ''}`;
  if (el.btnNotProject)   el.btnNotProject.textContent   = `Send to Not This Project${counts.not_project ? ` (${counts.not_project})` : ''}`;
  if (el.btnSupport)      el.btnSupport.textContent      = `Send to Support${counts.support ? ` (${counts.support})` : ''}`;
  if (el.btnCore)         el.btnCore.textContent         = `Send to Core${counts.core ? ` (${counts.core})` : ''}`;
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BUTTONS
═══════════════════════════════════════════════════════════════ */
function bindStatusButtons() {
  if (el.btnRoleRedirect) el.btnRoleRedirect.addEventListener('click', () => sendGroupEmails('role_redirect', CFG.TEMPLATE.RoleRedirect, el.btnRoleRedirect));
  if (el.btnContract)     el.btnContract.addEventListener('click',     () => sendGroupEmails('contract',      CFG.TEMPLATE.Contract,     el.btnContract));
  if (el.btnNotProject)   el.btnNotProject.addEventListener('click',   () => sendGroupEmails('not_project',   CFG.TEMPLATE.NotProject,   el.btnNotProject));
  if (el.btnSupport)      el.btnSupport.addEventListener('click',      () => sendGroupEmails('support',       CFG.TEMPLATE.Support,      el.btnSupport));
  if (el.btnCore)         el.btnCore.addEventListener('click',         () => sendGroupEmails('core',          CFG.TEMPLATE.Core,         el.btnCore));
}

async function sendGroupEmails(group, templateId, btn) {
  const members = getGroupMembers(group);
  if (!members.length) { toast(`No crew in this group.`, 'error'); return; }

  const unsent = members.filter(r => !sessionSent[r.id]);
  if (!unsent.length) { toast(`Already sent to all members in this group this session.`, 'error'); return; }

  const confirmed = window.confirm(`Send emails to ${unsent.length} crew member${unsent.length !== 1 ? 's' : ''} in this group?`);
  if (!confirmed) return;

  const origText  = btn.textContent;
  btn.disabled    = true;
  btn.textContent = `Sending...`;

  let ok = 0, fail = 0;

  for (const record of unsent) {
    const f       = record.fields;
    const email   = (f['Email']    || '').trim();
    const name    = (f['Name']     || '').trim();
    const role    = (f['Role']     || '').trim();
    const prefRole= (f['Preferred_role_by_Director'] || '').trim();
    const ltRoles = (f['LT_Roles'] || '').trim();

    if (!email) { fail++; continue; }

    const params = { NAME: name, ROLE: role, LT_ROLES: ltRoles };

    if (templateId === CFG.TEMPLATE.RoleRedirect) {
      params.PREFERRED_ROLE_BY_DIRECTOR = prefRole;
    }
    if (templateId === CFG.TEMPLATE.Contract) {
      params.CONTRACT_LINK = buildContractLink(name, email, role, (record.fields['Film'] || 'The Final Hand').trim());
    }

    try {
      await sendEmail(email, templateId, params);
      sessionSent[record.id] = templateId;
      ok++;
    } catch { fail++; }

    await sleep(280);
  }

  btn.disabled    = false;
  btn.textContent = origText;
  toast(`${ok} sent${fail ? `, ${fail} failed` : ''}`, fail && !ok ? 'error' : 'success');
  renderTable();
  updateGroupCounts();
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

async function sendContractEmail(record, btn) {
  const f     = record.fields;
  const name  = (f['Name']  || '').trim();
  const email = (f['Email'] || '').trim();
  const role  = (f['Role']  || '').trim();
  if (!email) { toast('No email address.', 'error'); return; }
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '...';
  try {
    await sendEmail(email, CFG.TEMPLATE.Contract, {
      NAME: name, ROLE: role,
      CONTRACT_LINK: buildContractLink(name, email, role, (record.fields['Film'] || 'The Final Hand').trim()),
    });
    sessionSent[record.id] = CFG.TEMPLATE.Contract;
    btn.textContent       = 'Sent';
    btn.style.color       = 'var(--signed)';
    btn.style.borderColor = 'rgba(120,180,130,0.28)';
    toast(`Contract email sent to ${email}`, 'success');
  } catch (err) {
    btn.textContent = orig; btn.disabled = false;
    toast(`Failed: ${err.message}`, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACT LINK
═══════════════════════════════════════════════════════════════ */
function buildContractLink(name, email, role, film) {
  return CFG.CONTRACT_BASE
    + '?name='  + encodeURIComponent(name)
    + '&email=' + encodeURIComponent(email)
    + '&role='  + encodeURIComponent(role)
    + '&film='  + encodeURIComponent(film || 'The Final Hand');
}

async function copyLink(name, email, role, btn) {
  const link = buildContractLink(name, email, role, (record.fields['Film'] || 'The Final Hand').trim());
  try { await navigator.clipboard.writeText(link); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
  const orig = btn.textContent;
  btn.textContent = 'Copied!'; btn.classList.add('copied');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  toast(`Link copied for ${name}`, 'success');
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
    el.searchClear.classList.add('hidden');
    renderTable(); el.searchInput.focus();
  });
}

function getVisible() {
  return crewRecords.filter(r => {
    const f        = r.fields;
    const email    = (f['Email'] || '').trim();
    const contract = findContract(email);
    const contractSentThisSession = sessionSent[r.id] === CFG.TEMPLATE.Contract;
    const cStatus = findContract((r.fields['Email']||'').trim()) ? 'Signed' : contractSentThisSession ? 'Sent' : '';
    if (activeFilter === 'Signed'  && cStatus !== 'Signed') return false;
    if (activeFilter === 'Sent'    && cStatus !== 'Sent')   return false;
    if (activeFilter === 'Pending' && cStatus !== 'Sent')   return false;
    if (searchQuery) {
      const hay = [f['Name']||'', f['Email']||'', f['Role']||''].join(' ').toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
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
}

function buildRow(record) {
  const f          = record.fields;
  const id         = record.id;
  const name       = (f['Name']       || '').trim();
  const email      = (f['Email']      || '').trim();
  const role       = (f['Role']       || '').trim();
  const phone      = (f['Phone']      || '').trim();
  const ltRoles    = (f['LT_Roles']   || '').trim();
  const prefRole   = (f['Preferred_role_by_Director'] || '').trim();
  const status     = (f['Status']     || '').trim();
  const fh         = isForFinalHand(f);
  const contract   = findContract(email);
  const group      = getGroup(record);
  const isExpanded = expandedIds.has(id);
  const alreadySent = !!sessionSent[id];

  // Contract status: Signed = contract record exists, Sent = template 21 sent this session, otherwise blank
  const contractSent   = sessionSent[id] === CFG.TEMPLATE.Contract;
  const contractStatus = contract ? 'Signed' : contractSent ? 'Sent' : '';
  const dateSigned     = contract ? (contract.fields['Date Signed'] || '') : '';
  const sigUrl         = contract
    ? (Array.isArray(contract.fields['Signature'])
        ? (contract.fields['Signature'][0]?.url || '')
        : (contract.fields['Signature'] || ''))
    : '';

  // Group pill config
  const groupLabels = {
    role_redirect: 'Role Redirect',
    contract:      'Final Hand',
    not_project:   'Not This Project',
    support:       'Support',
    core:          'Core',
    unassigned:    '',
  };
  const groupColors = {
    role_redirect: 'rgba(218,175,55,0.85)',
    contract:      'rgba(120,180,130,0.85)',
    not_project:   'rgba(200,80,80,0.85)',
    support:       'rgba(130,170,220,0.85)',
    core:          'rgba(180,140,220,0.85)',
    unassigned:    'var(--dim)',
  };

  const summaryRow = document.createElement('tr');
  summaryRow.className = 'summary-row';
  summaryRow.dataset.id = id;

  // Arrow
  const tdArrow = document.createElement('td');
  tdArrow.className = 'col-arrow';
  tdArrow.innerHTML = '<span class="expand-arrow">&#9654;</span>';
  summaryRow.appendChild(tdArrow);

  // Name + group pill
  const groupPill = groupLabels[group]
    ? `<span style="margin-left:8px;font-size:7px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${groupColors[group]};border:1px solid ${groupColors[group]};padding:2px 6px;border-radius:2px;vertical-align:middle;">${groupLabels[group]}</span>`
    : '';
  summaryRow.appendChild(makeTd(`<span class="cell-name">${esc(name) || '—'}</span>${groupPill}`));

  // Email
  summaryRow.appendChild(makeTd(`<span style="font-size:11px;color:var(--muted);">${esc(email) || '—'}</span>`));

  // Role — show redirect arrow if pref role set
  const roleDisplay = prefRole
    ? `${esc(role)} <span style="font-size:9px;color:var(--golddim);">&#8594; ${esc(prefRole)}</span>`
    : esc(role) || '—';
  summaryRow.appendChild(makeTd(`<span class="cell-role">${roleDisplay}</span>`));

  // Contract badge
  const badgeCls = contractStatus === 'Signed' ? 'signed' : contractStatus === 'Sent' ? 'sent' : '';
  const badgeHtml = contractStatus
    ? `<span class="contract-badge ${badgeCls}">${esc(contractStatus)}</span>`
    : `<span style="color:var(--dim);font-size:11px;">—</span>`;
  summaryRow.appendChild(makeTd(badgeHtml));

  // Date
  summaryRow.appendChild(makeTd(
    dateSigned
      ? `<span style="font-size:11px;color:var(--muted);">${esc(dateSigned)}</span>`
      : `<span style="color:var(--dim);font-size:11px;">—</span>`
  ));

  // Actions
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';
  const ag = document.createElement('div');
  ag.className = 'action-group';

  if (name && email) {

    const f2       = record.fields;
    const baseParams = {
      NAME:                       (f2['Name']     || '').trim(),
      ROLE:                       (f2['Role']     || '').trim(),
      LT_ROLES:                   (f2['LT_Roles'] || '').trim(),
      FILM:                       'The Final Hand',
      PREFERRED_ROLE_BY_DIRECTOR: (f2['Preferred_role_by_Director'] || '').trim(),
    };

    // ── Template 20 — Role Redirect ───────────────────────────
    if (group === 'role_redirect') {
      addEmailBtn(ag, id, email, 'Send Role Redirect', CFG.TEMPLATE.RoleRedirect, baseParams);
    }

    // ── Template 21 — Final Hand: send contract email + contract link ──
    if (group === 'contract') {
      if (contractStatus === 'Signed') {
        const signedBtn       = document.createElement('button');
        signedBtn.className   = 'action-btn';
        signedBtn.textContent = '✓ Contract Signed';
        signedBtn.style.color       = 'var(--signed)';
        signedBtn.style.borderColor = 'rgba(120,180,130,0.28)';
        signedBtn.disabled          = true;
        ag.appendChild(signedBtn);
      } else {
        addEmailBtn(ag, id, email, 'Send Contract Email', CFG.TEMPLATE.Contract, {
          ...baseParams,
          CONTRACT_LINK: buildContractLink(name, email, role, (f2['Film'] || 'The Final Hand').trim()),
        });
      }
    }

    // ── Template 22 — Not This Project ───────────────────────
    if (group === 'not_project') {
      addEmailBtn(ag, id, email, 'Send Not This Project', CFG.TEMPLATE.NotProject, baseParams);
    }

    // ── Template 23 — Support ─────────────────────────────────
    if (group === 'support') {
      addEmailBtn(ag, id, email, 'Send Support Email', CFG.TEMPLATE.Support, baseParams);
    }

    // ── Template 25 — Core ───────────────────────────────────
    if (group === 'core') {
      addEmailBtn(ag, id, email, 'Send Core Email', CFG.TEMPLATE.Core, baseParams);
    }

    // ── View Signature — only when signed ─────────────────────
    if (sigUrl) {
      const viewBtn       = document.createElement('button');
      viewBtn.className   = 'action-btn';
      viewBtn.textContent = 'View Sig';
      viewBtn.addEventListener('click', e => { e.stopPropagation(); window.open(sigUrl, '_blank'); });
      ag.appendChild(viewBtn);
    }
  }

  tdAction.appendChild(ag);
  summaryRow.appendChild(tdAction);

  summaryRow.addEventListener('click', e => {
    if (e.target.closest('button, a')) return;
    toggleExpand(id, detailRow);
    const expanded = expandedIds.has(id);
    summaryRow.classList.toggle('expanded', expanded);
    const arrow = summaryRow.querySelector('.expand-arrow');
    if (arrow) arrow.style.transform = expanded ? 'rotate(90deg)' : '';
  });

  el.tbody.appendChild(summaryRow);

  // Detail row
  const detailRow = document.createElement('tr');
  detailRow.className = `detail-row${isExpanded ? ' open' : ''}`;
  const detailTd = document.createElement('td');
  detailTd.colSpan = 7;
  const panel = document.createElement('div');
  panel.className = 'detail-panel';

  panel.appendChild(detailField('EMAIL', `<a href="mailto:${esc(email)}">${esc(email) || '—'}</a>`));
  panel.appendChild(detailField('PHONE', esc(phone) || '—'));
  panel.appendChild(detailField('STATUS', esc(status) || '—'));
  if (fh) panel.appendChild(detailField('FINAL HAND', 'Confirmed'));
  if (ltRoles) panel.appendChild(detailField('EXPERIENCE', esc(ltRoles)));
  if (prefRole) panel.appendChild(detailField('REDIRECT ROLE', esc(prefRole)));
  if (dateSigned) panel.appendChild(detailField('DATE SIGNED', esc(dateSigned)));
  if (alreadySent) {
    const tnames = {
      [CFG.TEMPLATE.RoleRedirect]: 'Role Redirect',
      [CFG.TEMPLATE.Contract]:     'Contract',
      [CFG.TEMPLATE.NotProject]:   'Not This Project',
      [CFG.TEMPLATE.Support]:      'Support',
      [CFG.TEMPLATE.Core]:         'Core',
    };
    panel.appendChild(detailField('EMAIL SENT', esc(tnames[sessionSent[id]] || 'Yes')));
  }
  if (sigUrl) {
    const sigDf = document.createElement('div');
    sigDf.className = 'detail-field';
    sigDf.innerHTML = `<span class="detail-label">SIGNATURE</span>`;
    const img = document.createElement('img');
    img.src = sigUrl; img.className = 'sig-preview'; img.alt = 'Signature';
    sigDf.appendChild(img);
    panel.appendChild(sigDf);
  }

  // Notes
  const notes   = (f['Notes'] || '').trim();
  const notesDf = document.createElement('div');
  notesDf.className = 'detail-field'; notesDf.style.gridColumn = 'span 2';
  const notesLbl = document.createElement('span'); notesLbl.className = 'detail-label'; notesLbl.textContent = 'NOTES';
  const notesDiv = document.createElement('div');
  notesDiv.className = 'editable detail-value'; notesDiv.contentEditable = 'true';
  notesDiv.textContent = notes; notesDiv.setAttribute('data-original', notes);
  notesDiv.addEventListener('blur', async () => {
    const newVal = notesDiv.textContent.trim(), origVal = notesDiv.getAttribute('data-original');
    if (newVal === origVal) return;
    try {
      await patchCrew(id, { Notes: newVal });
      notesDiv.setAttribute('data-original', newVal);
      const rec = crewRecords.find(r => r.id === id); if (rec) rec.fields['Notes'] = newVal;
      notesDiv.classList.add('saved'); setTimeout(() => notesDiv.classList.remove('saved'), 1400);
    } catch (err) {
      notesDiv.textContent = origVal;
      notesDiv.classList.add('saveerr'); setTimeout(() => notesDiv.classList.remove('saveerr'), 1400);
      toast(`Save failed: ${err.message}`, 'error');
    }
  });
  notesDiv.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); notesDiv.blur(); } });
  notesDf.appendChild(notesLbl); notesDf.appendChild(notesDiv);
  panel.appendChild(notesDf);

  detailTd.appendChild(panel); detailRow.appendChild(detailTd);
  el.tbody.appendChild(detailRow);
}

/* ── addEmailBtn helper ─────────────────────────────────────── */
function addEmailBtn(ag, id, email, label, tid, params) {
  const btn       = document.createElement('button');
  btn.className   = 'action-btn';
  if (sessionSent[id] === tid) {
    btn.textContent       = 'Sent ✓';
    btn.style.color       = 'var(--signed)';
    btn.style.borderColor = 'rgba(120,180,130,0.28)';
    btn.disabled          = true;
  } else {
    btn.textContent = label;
  }
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '...';
    try {
      await sendEmail(email, tid, params);
      sessionSent[id]         = tid;
      btn.textContent         = 'Sent ✓';
      btn.style.color         = 'var(--signed)';
      btn.style.borderColor   = 'rgba(120,180,130,0.28)';
      toast(`Email sent to ${email}`, 'success');
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = orig;
      toast(`Failed: ${err.message}`, 'error');
    }
  });
  ag.appendChild(btn);
}

/* ── Airtable PATCH ─────────────────────────────────────────── */
async function patchCrew(id, fields) {
  const res = await fetch(CFG.AIRTABLE, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CFG.CREW_TABLE, id, fields }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || 'Patch failed'); }
  return res.json();
}

/* ── Helpers ────────────────────────────────────────────────── */
function toggleExpand(id, detailRow) {
  if (expandedIds.has(id)) { expandedIds.delete(id); detailRow.classList.remove('open'); }
  else { expandedIds.add(id); detailRow.classList.add('open'); }
}
function detailField(label, valueHtml) {
  const df = document.createElement('div'); df.className = 'detail-field';
  df.innerHTML = `<span class="detail-label">${label}</span><span class="detail-value">${valueHtml}</span>`;
  return df;
}
function makeTd(html) { const td = document.createElement('td'); td.innerHTML = html; return td; }
function showState(state) {
  [el.loading, el.error, el.empty, el.tableWrap].forEach(e => e.classList.add('hidden'));
  if      (state === 'loading') el.loading.classList.remove('hidden');
  else if (state === 'error')   el.error.classList.remove('hidden');
  else if (state === 'empty')   el.empty.classList.remove('hidden');
  else if (state === 'table')   el.tableWrap.classList.remove('hidden');
}
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function toast(msg, type = 'success') {
  const d = document.createElement('div'); d.className = `toast t${type}`; d.textContent = msg;
  el.toastStack.appendChild(d);
  setTimeout(() => { d.classList.add('tout'); d.addEventListener('animationend', () => d.remove(), { once: true }); }, 4200);
}
