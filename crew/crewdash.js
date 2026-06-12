/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Crew Portal
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
  CONTRACT_BASE:  'https://bleuskm.com/crew/contract',
};

/* ── State ──────────────────────────────────────────────────── */
let crewRecords     = [];
let contractRecords = [];
let activeFilter    = 'All';
let searchQuery     = '';
let expandedIds     = new Set();

/* ── DOM ────────────────────────────────────────────────────── */
const el = {
  loading:      document.getElementById('stateLoading'),
  error:        document.getElementById('stateError'),
  errorMsg:     document.getElementById('stateErrorMsg'),
  empty:        document.getElementById('stateEmpty'),
  tableWrap:    document.getElementById('tableWrap'),
  tbody:        document.getElementById('crewTableBody'),
  recordCount:  document.getElementById('recordCount'),
  refreshBtn:   document.getElementById('refreshBtn'),
  logoutBtn:    document.getElementById('logoutBtn'),
  userChip:     document.getElementById('userChip'),
  searchInput:  document.getElementById('searchInput'),
  searchClear:  document.getElementById('searchClear'),
  retryBtn:     document.getElementById('retryBtn'),
  toastStack:   document.getElementById('toastStack'),
  statTotal:    document.getElementById('statTotal'),
  statSigned:   document.getElementById('statSigned'),
  statPending:  document.getElementById('statPending'),
  statConfirmed:document.getElementById('statConfirmed'),
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
});

/* ═══════════════════════════════════════════════════════════════
   DATA LOAD
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
  } catch (err) {
    el.errorMsg.textContent = err.message;
    showState('error');
  }
}

/* ── Find contract for crew member by email ─────────────────── */
function findContract(email) {
  return contractRecords.find(r => (r.fields['Email'] || '').trim().toLowerCase() === email.toLowerCase());
}

/* ── Stats ──────────────────────────────────────────────────── */
function updateStats() {
  const total     = crewRecords.length;
  const signed    = crewRecords.filter(r => findContract((r.fields['Email'] || '').trim())).length;
  const pending   = total - signed;
  const confirmed = crewRecords.filter(r => (r.fields['Status'] || '') === 'Confirmed').length;

  el.statTotal.textContent     = total;
  el.statSigned.textContent    = signed;
  el.statPending.textContent   = pending;
  el.statConfirmed.textContent = confirmed;
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
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    toast(`Link copied for ${name}`, 'success');
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast(`Link copied for ${name}`, 'success');
  }
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
    const f        = r.fields;
    const email    = (f['Email'] || '').trim();
    const contract = findContract(email);
    const status   = contract ? 'Signed' : (f['Contract Status'] || 'Pending');

    if (activeFilter !== 'All' && status !== activeFilter) return false;
    if (searchQuery) {
      const hay = [f['Name']||'', f['Email']||'', f['Role']||f['Department']||''].join(' ').toLowerCase();
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
  const f        = record.fields;
  const id       = record.id;
  const name     = (f['Name']       || '').trim();
  const email    = (f['Email']      || '').trim();
  const role     = (f['Role']       || f['Department'] || '').trim();
  const phone    = (f['Phone']      || '').trim();
  const contract = findContract(email);
  const isExpanded = expandedIds.has(id);

  const contractStatus = contract ? 'Signed' : (f['Contract Status'] || 'Pending');
  const dateSigned     = contract ? (contract.fields['Date Signed'] || '') : '';
  const sigUrl         = contract ? (
    Array.isArray(contract.fields['Signature'])
      ? (contract.fields['Signature'][0]?.url || '')
      : (contract.fields['Signature'] || '')
  ) : '';

  // Summary row
  const summaryRow = document.createElement('tr');
  summaryRow.className = `summary-row`;
  summaryRow.dataset.id = id;

  // Arrow
  const tdArrow = document.createElement('td');
  tdArrow.className = 'col-arrow';
  tdArrow.innerHTML = '<span class="expand-arrow">&#9654;</span>';
  summaryRow.appendChild(tdArrow);

  // Name
  summaryRow.appendChild(makeTd(`<span class="cell-name">${esc(name) || '—'}</span>`));

  // Role
  summaryRow.appendChild(makeTd(`<span class="cell-role">${esc(role) || '—'}</span>`));

  // Contract status badge
  const badgeCls = contractStatus === 'Signed' ? 'signed' : contractStatus === 'Sent' ? 'sent' : 'pending';
  summaryRow.appendChild(makeTd(`<span class="contract-badge ${badgeCls}">${esc(contractStatus)}</span>`));

  // Date signed
  summaryRow.appendChild(makeTd(dateSigned ? `<span style="font-size:11px;color:var(--muted);">${esc(dateSigned)}</span>` : '<span style="color:var(--dim);font-size:11px;">—</span>'));

  // Actions
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';
  const actionGroup = document.createElement('div');
  actionGroup.className = 'action-group';

  if (name && email) {
    const copyBtn = document.createElement('button');
    copyBtn.className   = 'action-btn';
    copyBtn.textContent = 'Copy Contract Link';
    copyBtn.addEventListener('click', e => { e.stopPropagation(); copyLink(name, email, role, copyBtn); });
    actionGroup.appendChild(copyBtn);
  }

  if (sigUrl) {
    const viewBtn = document.createElement('button');
    viewBtn.className   = 'action-btn';
    viewBtn.textContent = 'View Signature';
    viewBtn.addEventListener('click', e => { e.stopPropagation(); window.open(sigUrl, '_blank'); });
    actionGroup.appendChild(viewBtn);
  }

  tdAction.appendChild(actionGroup);
  summaryRow.appendChild(tdAction);

  summaryRow.addEventListener('click', e => {
    if (e.target.closest('button, a')) return;
    toggleExpand(id, detailRow);
    summaryRow.classList.toggle('expanded', expandedIds.has(id));
    const arrow = summaryRow.querySelector('.expand-arrow');
    if (arrow) arrow.style.transform = expandedIds.has(id) ? 'rotate(90deg)' : '';
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
  panel.appendChild(detailField('CONTRACT LINK',
    `<a href="${esc(buildContractLink(name, email, role))}" target="_blank" rel="noopener">Open Link &#8599;</a>`
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

  // Notes editable
  const notes  = (f['Notes'] || '').trim();
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
  notesDf.appendChild(notesLbl); notesDf.appendChild(notesDiv); panel.appendChild(notesDf);

  detailTd.appendChild(panel); detailRow.appendChild(detailTd);
  el.tbody.appendChild(detailRow);
}

/* ─── Airtable PATCH crew ───────────────────────────────────── */
async function patchCrew(id, fields) {
  const res = await fetch(CFG.AIRTABLE, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CFG.CREW_TABLE, id, fields }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || 'Patch failed'); }
  return res.json();
}

/* ─── Helpers ───────────────────────────────────────────────── */
function toggleExpand(id, detailRow) {
  if (expandedIds.has(id)) { expandedIds.delete(id); detailRow.classList.remove('open'); }
  else                      { expandedIds.add(id);    detailRow.classList.add('open'); }
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

function toast(msg, type = 'success') {
  const d = document.createElement('div'); d.className = `toast t${type}`; d.textContent = msg;
  el.toastStack.appendChild(d);
  setTimeout(() => { d.classList.add('tout'); d.addEventListener('animationend', () => d.remove(), { once: true }); }, 4200);
}
