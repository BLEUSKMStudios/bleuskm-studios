/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Crew Portal v2
   crewdash.js
═══════════════════════════════════════════════════════════════ */

/* ── Auth guard ─────────────────────────────────────────────── */
(function () {
  if (sessionStorage.getItem('bleuskm_crew_auth') !== 'true') {
    window.location.replace('./login.html');
  }
})();

/* ── Config ─────────────────────────────────────────────────── */
const CFG = {
  CREW_TABLE:     'Crew applications',
  CONTRACT_TABLE: 'Contracts',
  AIRTABLE:       '/.netlify/functions/airtable-proxy',
  BREVO:          '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:    'https://api.brevo.com/v3/smtp/email',
  CONTRACT_BASE:  'https://bleuskm.com/crew/contract',
  TEMPLATE: {
    Contract:   21,
    NotProject: 22,
    Support:    23,
    Core:       24,
    Team:       25,
  },
};

/* ── State ──────────────────────────────────────────────────── */
let crewRecords     = [];
let contractRecords = [];
let activeFilter    = 'All';
let searchQuery     = '';
let expandedIds     = new Set();
// Session-only sent tracking — keyed by recordId
let sessionSent     = {};

/* ── DOM ────────────────────────────────────────────────────── */
const el = {
  loading:       document.getElementById('stateLoading'),
  error:         document.getElementById('stateError'),
  errorMsg:      document.getElementById('stateErrorMsg'),
  empty:         document.getElementById('stateEmpty'),
  tableWrap:     document.getElementById('tableWrap'),
  tbody:         document.getElementById('crewTableBody'),
  recordCount:   document.getElementById('recordCount'),
  refreshBtn:    document.getElementById('refreshBtn'),
  logoutBtn:     document.getElementById('logoutBtn'),
  userChip:      document.getElementById('userChip'),
  searchInput:   document.getElementById('searchInput'),
  searchClear:   document.getElementById('searchClear'),
  retryBtn:      document.getElementById('retryBtn'),
  toastStack:    document.getElementById('toastStack'),
  statTotal:     document.getElementById('statTotal'),
  statSigned:    document.getElementById('statSigned'),
  statPending:   document.getElementById('statPending'),
  statConfirmed: document.getElementById('statConfirmed'),
  // Status send buttons
  btnNotProject: document.getElementById('btnNotProject'),
  btnSupport:    document.getElementById('btnSupport'),
  btnCore:       document.getElementById('btnCore'),
  btnTeam:       document.getElementById('btnTeam'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  el.userChip.textContent = (sessionStorage.getItem('bleuskm_crew_user') || '').toUpperCase();
  loadData();
  el.refreshBtn.addEventListener('click', loadData);
  el.retryBtn.addEventListener('click', loadData);
  el.logoutBtn.addEventListener('click', () => { sessionStorage.clear(); window.location.replace('./login.html'); });
  bindFilters();
  bindSearch();
  bindStatusButtons();
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
    crewRecords        = crewData.records     || [];
    contractRecords    = contractData.records || [];
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
  const confirmed = crewRecords.filter(r =>
    ['core','support'].includes((r.fields['Status'] || '').toLowerCase().trim())
  ).length;
  el.statTotal.textContent     = total;
  el.statSigned.textContent    = signed;
  el.statPending.textContent   = pending;
  el.statConfirmed.textContent = confirmed;
}

/* ═══════════════════════════════════════════════════════════════
   GROUP LOGIC
═══════════════════════════════════════════════════════════════ */
function getGroup(record) {
  const status      = (record.fields['Status']        || '').toLowerCase().trim();
  const collective  = record.fields['Join Collective'];
  const joinCol     = collective === true || collective === 1 || collective === 'true';

  if (status === 'not this project') return 'not_project';
  if (status === 'support')          return 'support';
  if (status === 'core' && joinCol)  return 'team';
  if (status === 'core')             return 'core';
  return 'unassigned';
}

function getGroupMembers(group) {
  return crewRecords.filter(r => getGroup(r) === group);
}

function updateGroupCounts() {
  const counts = {
    not_project: getGroupMembers('not_project').length,
    support:     getGroupMembers('support').length,
    core:        getGroupMembers('core').length,
    team:        getGroupMembers('team').length,
  };

  if (el.btnNotProject) {
    el.btnNotProject.textContent = `Send to Not This Project${counts.not_project ? ` (${counts.not_project})` : ''}`;
  }
  if (el.btnSupport) {
    el.btnSupport.textContent = `Send to Support${counts.support ? ` (${counts.support})` : ''}`;
  }
  if (el.btnCore) {
    el.btnCore.textContent = `Send to Core${counts.core ? ` (${counts.core})` : ''}`;
  }
  if (el.btnTeam) {
    el.btnTeam.textContent = `Send to Team${counts.team ? ` (${counts.team})` : ''}`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   STATUS EMAIL BUTTONS
═══════════════════════════════════════════════════════════════ */
function bindStatusButtons() {
  if (el.btnNotProject) el.btnNotProject.addEventListener('click', () => sendGroupEmails('not_project', CFG.TEMPLATE.NotProject, el.btnNotProject));
  if (el.btnSupport)    el.btnSupport.addEventListener('click',    () => sendGroupEmails('support',     CFG.TEMPLATE.Support,    el.btnSupport));
  if (el.btnCore)       el.btnCore.addEventListener('click',       () => sendGroupEmails('core',        CFG.TEMPLATE.Core,       el.btnCore));
  if (el.btnTeam)       el.btnTeam.addEventListener('click',       () => sendGroupEmails('team',        CFG.TEMPLATE.Team,       el.btnTeam));
}

async function sendGroupEmails(group, templateId, btn) {
  const members = getGroupMembers(group);
  if (!members.length) { toast(`No crew in this group.`, 'error'); return; }

  // Filter out already sent in this session
  const unsent = members.filter(r => !sessionSent[r.id]);
  if (!unsent.length) {
    toast(`Already sent to all ${group.replace('_', ' ')} members this session.`, 'error');
    return;
  }

  const confirmed = window.confirm(
    `Send emails to ${unsent.length} crew member${unsent.length !== 1 ? 's' : ''} in this group?`
  );
  if (!confirmed) return;

  const origText   = btn.textContent;
  btn.disabled     = true;
  btn.textContent  = `Sending...`;

  let ok = 0, fail = 0;

  for (const record of unsent) {
    const f      = record.fields;
    const email  = (f['Email']    || '').trim();
    const name   = (f['Name']     || '').trim();
    const role   = (f['Role']     || '').trim();
    const ltRoles= (f['LT_Roles'] || '').trim();

    if (!email) { fail++; continue; }

    const params = { NAME: name, ROLE: role, LT_ROLES: ltRoles };

    // Template 21 also needs contract link
    if (templateId === CFG.TEMPLATE.Contract) {
      params.CONTRACT_LINK = buildContractLink(name, email, role);
    }

    try {
      await sendEmail(email, templateId, params);
      sessionSent[record.id] = templateId;
      ok++;
    } catch {
      fail++;
    }

    await sleep(280);
  }

  btn.disabled    = false;
  btn.textContent = origText;
  toast(
    `${ok} sent${fail ? `, ${fail} failed` : ''}`,
    fail && !ok ? 'error' : 'success'
  );
  renderTable(); // refresh to show session-sent state on rows
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
  const role  = (f['Role']  || f['Department'] || '').trim();

  if (!email) { toast('No email address for this crew member.', 'error'); return; }

  const orig      = btn.textContent;
  btn.disabled    = true;
  btn.textContent = '...';

  try {
    await sendEmail(email, CFG.TEMPLATE.Contract, {
      NAME:          name,
      ROLE:          role,
      CONTRACT_LINK: buildContractLink(name, email, role),
    });
    sessionSent[record.id] = CFG.TEMPLATE.Contract;
    btn.textContent   = 'Sent';
    btn.style.color         = 'var(--signed)';
    btn.style.borderColor   = 'rgba(120,180,130,0.28)';
    toast(`Contract email sent to ${email}`, 'success');
  } catch (err) {
    btn.textContent = orig;
    btn.disabled    = false;
    toast(`Failed: ${err.message}`, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACT LINK
═══════════════════════════════════════════════════════════════ */
function buildContractLink(name, email, role) {
  return CFG.CONTRACT_BASE
    + '?name='  + encodeURIComponent(name)
    + '&email=' + encodeURIComponent(email)
    + '&role='  + encodeURIComponent(role);
}

async function copyLink(name, email, role, btn) {
  const link = buildContractLink(name, email, role);
  try {
    await navigator.clipboard.writeText(link);
  } catch {
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
    const status   = contract ? 'Signed' : (f['Contract Status'] || 'Pending');

    if (activeFilter === 'Signed'  && status !== 'Signed')  return false;
    if (activeFilter === 'Sent'    && status !== 'Sent')    return false;
    if (activeFilter === 'Pending' && status === 'Signed')  return false;

    if (searchQuery) {
      const hay = [f['Name']||'', f['Email']||'', f['Role']||'', f['Department']||''].join(' ').toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
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
}

function buildRow(record) {
  const f          = record.fields;
  const id         = record.id;
  const name       = (f['Name']       || '').trim();
  const email      = (f['Email']      || '').trim();
  const role       = (f['Role']       || f['Department'] || '').trim();
  const phone      = (f['Phone']      || '').trim();
  const ltRoles    = (f['LT_Roles']   || '').trim();
  const prefRole   = (f['Preferred_role_by_Director'] || '').trim();
  const status     = (f['Status']     || '').trim();
  const collective = f['Join Collective'];
  const joinCol    = collective === true || collective === 1 || collective === 'true';
  const contract   = findContract(email);
  const isExpanded = expandedIds.has(id);
  const group      = getGroup(record);
  const alreadySent = !!sessionSent[id];

  const contractStatus = contract ? 'Signed' : (f['Contract Status'] || 'Pending');
  const dateSigned     = contract ? (contract.fields['Date Signed'] || '') : '';
  const sigUrl         = contract
    ? (Array.isArray(contract.fields['Signature'])
        ? (contract.fields['Signature'][0]?.url || '')
        : (contract.fields['Signature'] || ''))
    : '';

  // Summary row
  const summaryRow = document.createElement('tr');
  summaryRow.className = `summary-row`;
  summaryRow.dataset.id = id;

  // Arrow
  const tdArrow = document.createElement('td');
  tdArrow.className = 'col-arrow';
  tdArrow.innerHTML = '<span class="expand-arrow">&#9654;</span>';
  summaryRow.appendChild(tdArrow);

  // Name + group pill
  const groupLabels = { not_project: 'Not This Project', support: 'Support', core: 'Core', team: 'Team', unassigned: '' };
  const groupColors = { not_project: 'rgba(200,80,80,0.7)', support: 'rgba(130,170,220,0.7)', core: 'rgba(218,175,55,0.7)', team: 'rgba(120,180,130,0.7)', unassigned: 'var(--dim)' };
  const groupPill   = groupLabels[group] ? `<span style="margin-left:8px;font-size:7px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${groupColors[group]};border:1px solid ${groupColors[group]};padding:2px 6px;border-radius:2px;vertical-align:middle;">${groupLabels[group]}</span>` : '';
  summaryRow.appendChild(makeTd(`<span class="cell-name">${esc(name) || '—'}</span>${groupPill}`));

  // Role
  const roleDisplay = prefRole && prefRole !== role
    ? `${esc(role)} <span style="font-size:9px;color:var(--golddim);">&#8594; ${esc(prefRole)}</span>`
    : esc(role) || '—';
  summaryRow.appendChild(makeTd(`<span class="cell-role">${roleDisplay}</span>`));

  // Contract badge
  const badgeCls = contractStatus === 'Signed' ? 'signed' : contractStatus === 'Sent' ? 'sent' : 'pending';
  summaryRow.appendChild(makeTd(`<span class="contract-badge ${badgeCls}">${esc(contractStatus)}</span>`));

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
    // Send contract button
    const sendBtn       = document.createElement('button');
    sendBtn.className   = 'action-btn';
    if (contractStatus === 'Signed') {
      sendBtn.textContent       = 'Contract Signed';
      sendBtn.style.color       = 'var(--signed)';
      sendBtn.style.borderColor = 'rgba(120,180,130,0.28)';
      sendBtn.disabled          = true;
    } else if (alreadySent && sessionSent[id] === CFG.TEMPLATE.Contract) {
      sendBtn.textContent       = 'Sent';
      sendBtn.style.color       = 'var(--signed)';
      sendBtn.style.borderColor = 'rgba(120,180,130,0.28)';
      sendBtn.disabled          = true;
    } else {
      sendBtn.textContent = 'Send Contract';
    }
    sendBtn.addEventListener('click', e => { e.stopPropagation(); sendContractEmail(record, sendBtn); });
    ag.appendChild(sendBtn);

    // Copy link
    const copyBtn       = document.createElement('button');
    copyBtn.className   = 'action-btn';
    copyBtn.textContent = 'Copy Link';
    copyBtn.addEventListener('click', e => { e.stopPropagation(); copyLink(name, email, role, copyBtn); });
    ag.appendChild(copyBtn);
  }

  if (sigUrl) {
    const viewBtn       = document.createElement('button');
    viewBtn.className   = 'action-btn';
    viewBtn.textContent = 'View Signature';
    viewBtn.addEventListener('click', e => { e.stopPropagation(); window.open(sigUrl, '_blank'); });
    ag.appendChild(viewBtn);
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
  detailTd.colSpan = 6;
  const panel = document.createElement('div');
  panel.className = 'detail-panel';

  panel.appendChild(detailField('EMAIL', `<a href="mailto:${esc(email)}">${esc(email) || '—'}</a>`));
  panel.appendChild(detailField('PHONE', esc(phone) || '—'));
  panel.appendChild(detailField('STATUS', esc(status) || '—'));
  if (joinCol) panel.appendChild(detailField('COLLECTIVE', 'Member'));
  if (ltRoles) panel.appendChild(detailField('EXPERIENCE', esc(ltRoles)));
  panel.appendChild(detailField('CONTRACT LINK',
    `<a href="${esc(buildContractLink(name, email, role))}" target="_blank" rel="noopener">Open &#8599;</a>`
  ));

  if (sigUrl) {
    const sigDf = document.createElement('div');
    sigDf.className = 'detail-field';
    sigDf.innerHTML = `<span class="detail-label">SIGNATURE</span>`;
    const img = document.createElement('img');
    img.src = sigUrl; img.className = 'sig-preview'; img.alt = 'Signature';
    sigDf.appendChild(img);
    panel.appendChild(sigDf);
  }

  if (dateSigned) panel.appendChild(detailField('DATE SIGNED', esc(dateSigned)));

  // Status group sent indicator
  if (alreadySent) {
    const templateNames = { [CFG.TEMPLATE.NotProject]: 'Not This Project', [CFG.TEMPLATE.Support]: 'Support', [CFG.TEMPLATE.Core]: 'Core', [CFG.TEMPLATE.Team]: 'Team', [CFG.TEMPLATE.Contract]: 'Contract' };
    panel.appendChild(detailField('EMAIL SENT THIS SESSION', esc(templateNames[sessionSent[id]] || 'Yes')));
  }

  // Notes
  const notes    = (f['Notes'] || '').trim();
  const notesDf  = document.createElement('div');
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
  else                      { expandedIds.add(id);   detailRow.classList.add('open'); }
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
