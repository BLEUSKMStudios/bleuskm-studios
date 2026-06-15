/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Casting Portal v7
   castingdash.js
═══════════════════════════════════════════════════════════════ */

/* ── Auth guard ─────────────────────────────────────────────── */
(function () {
  if (sessionStorage.getItem('bleuskm_auth') !== 'true') {
    window.location.replace('./login.html');
  }
})();

const ADMIN_USER = 'zaria';

/* ── Config ─────────────────────────────────────────────────── */
const CFG = {
  TABLE:         'Casting Submissions',
  CREW_TABLE:    'Crew applications',
  TL_TABLE:      'Production Timeline',
  CONTRACT_TABLE:'Contracts',
  AIRTABLE:      '/.netlify/functions/airtable-proxy',
  BREVO:         '/.netlify/functions/brevo-proxy',
  BREVO_EMAIL:   'https://api.brevo.com/v3/smtp/email',
  CALENDLY:      'https://calendly.com/studio-bleuskm/30min',
  FILM_LINK:     'https://bleuskm.com/casting/',
  RESPONSE_BASE: 'https://bleuskm.com/redirect-response',
  SELFTAPE_BASE: 'https://bleuskm.com/selftape',
  CREW_DASH:     '/crew/',
  TEMPLATE: {
    Callback:     15,
    Pass:         16,
    Redirect:     17,
    RedirectRole: 18,
    Availability: 19,
  },
};

const FILM_OPTIONS = [
  'Liminal County','Love me like this','Book of Beginnings',
  'Of blood and dominion','As Is','Overstood','The 15th Hour',
];
const TO_ROLE_TRIGGER = 'To Role';

/* ── State ──────────────────────────────────────────────────── */
let allRecords      = [];
let crewRecords     = [];
let tlRecords       = [];
let activeFilter    = 'All';
let searchQuery     = '';
let selectedIds     = new Set();
let sentMap         = {};
let scheduledMap    = {};
let expandedIds     = new Set();
let pendingRedirect = null;
let calCurrentDate  = new Date();
let isAdmin         = false;

// Contracts stored in localStorage (keyed by id)
let contracts       = [];
let activeContractTab = 'cast';
let editingContractId = null;

// Locations stored in localStorage
let locations       = [];
let editingLocationId = null;

// Signature canvas state
let sigDrawing = false;
let sigCtx     = null;

// Pending email modal
let pendingEmailRecord = null;

// Email archive (sent emails log)
let emailArchive = [];

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
  searchInput:     document.getElementById('searchInput'),
  searchClear:     document.getElementById('searchClear'),
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
  crewDashBtn:     document.getElementById('crewDashBtn'),
  // redirect modal (legacy)
  // timeline modal
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
  // contacts (hub)
  contactsCounts:  document.getElementById('contactsCounts'),
  contactsGrid:    document.getElementById('contactsGrid'),
  contactsSearch:  document.getElementById('contactsSearch'),
  // contracts (hub)
  contractsList:   document.getElementById('contractsList'),
  newContractBtn:  document.getElementById('newContractBtn'),
  contractModal:   document.getElementById('contractModal'),
  contractModalTitle: document.getElementById('contractModalTitle'),
  contractModalClose: document.getElementById('contractModalClose'),
  contractModalCancel: document.getElementById('contractModalCancel'),
  contractType:    document.getElementById('contractType'),
  contractFilm:    document.getElementById('contractFilm'),
  contractName:    document.getElementById('contractName'),
  contractEmail:   document.getElementById('contractEmail'),
  contractRole:    document.getElementById('contractRole'),
  contractSaveBtn: document.getElementById('contractSaveBtn'),
  contractPrintBtn:document.getElementById('contractPrintBtn'),
  // location (hub)
  locationCounts:  document.getElementById('locationCounts'),
  locationGrid:    document.getElementById('locationGrid'),
  locationSearch:  document.getElementById('locationSearch'),
  addLocationBtn:  document.getElementById('addLocationBtn'),
  locationModal:   document.getElementById('locationModal'),
  locationModalTitle:  document.getElementById('locationModalTitle'),
  locationModalClose:  document.getElementById('locationModalClose'),
  locationModalCancel: document.getElementById('locationModalCancel'),
  locationModalSave:   document.getElementById('locationModalSave'),
  locName:    document.getElementById('locName'),
  locAddress: document.getElementById('locAddress'),
  locType:    document.getElementById('locType'),
  locFilm:    document.getElementById('locFilm'),
  locContact: document.getElementById('locContact'),
  locPhone:   document.getElementById('locPhone'),
  locStatus:  document.getElementById('locStatus'),
  locNotes:   document.getElementById('locNotes'),
  locSuggestions: document.getElementById('locSuggestions'),
  // batch bar
  batchBar:        document.getElementById('batchBar'),
  batchCount:      document.getElementById('batchCount'),
  batchTemplateSelect: document.getElementById('batchTemplateSelect'),
  batchSendBtn:    document.getElementById('batchSendBtn'),
  batchClearBtn:   document.getElementById('batchClearBtn'),
  // email modal (per-row)
  emailModal:      document.getElementById('emailModal'),
  emailModalClose: document.getElementById('emailModalClose'),
  emailModalCancel:document.getElementById('emailModalCancel'),
  emailModalSend:  document.getElementById('emailModalSend'),
  emailModalRecipient: document.getElementById('emailModalRecipient'),
  emailModalTemplate:  document.getElementById('emailModalTemplate'),
  emailFilmField:  document.getElementById('emailFilmField'),
  emailFilmInput:  document.getElementById('emailFilmInput'),
  emailRoleField:  document.getElementById('emailRoleField'),
  emailRoleInput:  document.getElementById('emailRoleInput'),
  // compose modal
  composeModal:    document.getElementById('composeModal'),
  composeModalClose:  document.getElementById('composeModalClose'),
  composeModalCancel: document.getElementById('composeModalCancel'),
  composeModalSend:   document.getElementById('composeModalSend'),
  composeFrom:     document.getElementById('composeFrom'),
  composeTo:       document.getElementById('composeTo'),
  composeSubject:  document.getElementById('composeSubject'),
  composeBody:     document.getElementById('composeBody'),
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const user = sessionStorage.getItem('bleuskm_user') || '';
  el.userChip.textContent = user.toUpperCase();
  isAdmin = user.toLowerCase() === ADMIN_USER;

  if (isAdmin && el.crewDashBtn) {
    el.crewDashBtn.classList.remove('hidden');
    el.crewDashBtn.addEventListener('click', () => { window.location.href = CFG.CREW_DASH; });
  }

  loadSubmissions();
  loadTimeline();
  loadCrewContacts();

  el.refreshBtn.addEventListener('click', () => { loadSubmissions(); loadCrewContacts(); });
  el.retryBtn.addEventListener('click', loadSubmissions);
  el.timelineRefresh.addEventListener('click', loadTimeline);
  el.logoutBtn.addEventListener('click', () => { sessionStorage.clear(); window.location.replace('./login.html'); });

  bindFilters();
  bindSearch();
  bindRedirectModal();
  bindTimelineModal();
  bindCalendar();
  bindContactsPanel();
  bindContractsPanel();
  bindLocationPanel();
  bindBatchBar();
  bindEmailModal();
  bindComposeModal();
  bindSignatureCanvas();

  loadLocalContracts();
  loadLocalLocations();

  // Re-wire contractType select to re-render clauses dynamically
  const typeSelect = document.getElementById('contractType');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      renderContractBody(typeSelect.value);
      const tmpl = CONTRACT_TEMPLATES[typeSelect.value] || CONTRACT_TEMPLATES.crew;
      const titleEl = document.getElementById('contractModalTitle');
      if (titleEl) titleEl.textContent = tmpl.title;
    });
  }
  initHubs();
});

/* ═══════════════════════════════════════════════════════════════
   AIRTABLE
═══════════════════════════════════════════════════════════════ */
function addEmailArchive(from, to, subject, type) {
  emailArchive.unshift({ from, to, subject, type, time: new Date().toLocaleString() });
  if (emailArchive.length > 100) emailArchive.pop();
  // Re-render archive if email hub is visible
  const hub = document.getElementById('hub-email');
  if (hub && hub.classList.contains('active')) renderEmailArchive();
}

function renderEmailArchive() {
  const container = document.getElementById('emailArchiveList');
  if (!container) return;
  if (!emailArchive.length) {
    container.innerHTML = '<p style="font-size:10px;color:var(--muted);">No emails sent this session.</p>';
    return;
  }
  container.innerHTML = '';
  emailArchive.forEach(e => {
    const item = document.createElement('div');
    item.className = 'email-archive-item';
    item.innerHTML = `
      <div class="ea-meta">
        <span class="ea-type">${esc(e.type)}</span>
        <span class="ea-time">${esc(e.time)}</span>
      </div>
      <div class="ea-row"><span class="ea-label">FROM</span><span class="ea-val">${esc(e.from)}</span></div>
      <div class="ea-row"><span class="ea-label">TO</span><span class="ea-val">${esc(e.to)}</span></div>
      ${e.subject ? `<div class="ea-row"><span class="ea-label">SUBJECT</span><span class="ea-val">${esc(e.subject)}</span></div>` : ''}`;
    container.appendChild(item);
  });
}

async function loadSubmissions() {
  showState('loading');
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
    renderContacts();
  } catch (err) {
    el.errorMsg.textContent = err.message || 'Could not load submissions.';
    showState('error');
  }
}

async function loadCrewContacts() {
  try {
    const res  = await fetch(CFG.AIRTABLE + `?table=${encodeURIComponent(CFG.CREW_TABLE)}`);
    const data = res.ok ? await res.json() : { records: [] };
    // Only Core crew — Status field must equal "Core"
    crewRecords = (data.records || []).filter(r =>
      (r.fields['Status'] || '').trim() === 'Core'
    );
    renderContacts();
  } catch { crewRecords = []; renderContacts(); }
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
   CONTACTS PANEL
═══════════════════════════════════════════════════════════════ */
function bindContactsPanel() {
  // Contacts now live in hub panel — just bind search
  if (el.contactsSearch) {
    el.contactsSearch.addEventListener('input', () =>
      renderContacts(el.contactsSearch.value.trim().toLowerCase())
    );
  }
}

function renderContacts(query = '') {
  // crewRecords already filtered to Core-only by loadCrewContacts
  const castContacts = allRecords.filter(r => (r.fields['Email'] || '').trim());
  el.contactsCounts.textContent = `${crewRecords.length} crew · ${castContacts.length} cast`;

  function filtered(arr, keys) {
    if (!query) return arr;
    return arr.filter(r => keys.some(k => (r.fields[k] || '').toLowerCase().includes(query)));
  }

  const filteredCrew = filtered(crewRecords, ['Name','Email','Phone','Role']);
  const filteredCast = filtered(castContacts, ['Name','Email','Location','Role','Casting Status']);

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
      // Role: use Preferred_role_by_Director if set, else Role field
      const displayRole = (f['Preferred_role_by_Director'] || '').trim() || (f['Role'] || '').trim();
      el.contactsGrid.appendChild(makeContactCard(f['Name']||'—', f['Email']||'', f['Phone']||'', displayRole, 'crew'));
    });
  }

  if (filteredCast.length) {
    const hdr = document.createElement('div');
    hdr.className = 'contacts-section-label'; hdr.textContent = 'CASTING SUBMISSIONS';
    el.contactsGrid.appendChild(hdr);
    filteredCast.forEach(r => {
      const f = r.fields;
      const statusLabel = f['Casting Status'] ? ` · ${f['Casting Status']}` : '';
      // Role for cast: use original Role field (casting role they applied for)
      el.contactsGrid.appendChild(makeContactCard(f['Name']||'—', f['Email']||'', (f['Location']||'') + statusLabel, f['Role']||'', 'cast'));
    });
  }
}

function makeContactCard(name, email, detail, role, type) {
  const card = document.createElement('div');
  card.className = 'contact-card';
  const alias = type === 'crew' ? 'crew@bleuskm.com' : 'casting@bleuskm.com';
  card.innerHTML = `
    <div class="contact-card-name">${esc(name)}</div>
    <div class="contact-card-detail">${esc(email)}<br>${esc(detail)}${role ? `<br><span style="color:var(--golddim);font-size:9px;">${esc(role)}</span>` : ''}</div>
    <div class="contact-card-actions">
      ${email ? `<button class="contact-action-btn" data-email="${esc(email)}" data-name="${esc(name)}" data-alias="${alias}">&#9993; Email</button>` : ''}
      <button class="contact-action-btn" onclick="openContractForContact('${esc(name)}','${esc(email)}','${esc(role)}','${type}')">&#128466; Contract</button>
    </div>`;
  const emailBtn = card.querySelector('[data-email]');
  if (emailBtn) {
    emailBtn.addEventListener('click', () => {
      openComposeModal(emailBtn.dataset.email, emailBtn.dataset.name, emailBtn.dataset.alias);
    });
  }
  return card;
}

/* ═══════════════════════════════════════════════════════════════
   COMPOSE EMAIL MODAL (Zoho aliases)
═══════════════════════════════════════════════════════════════ */
function bindComposeModal() {
  el.composeModalClose.addEventListener('click', () => el.composeModal.classList.add('hidden'));
  el.composeModalCancel.addEventListener('click', () => el.composeModal.classList.add('hidden'));
  el.composeModal.addEventListener('click', e => { if (e.target === el.composeModal) el.composeModal.classList.add('hidden'); });
  el.composeModalSend.addEventListener('click', sendComposeEmail);
}

function openComposeModal(toEmail = '', toName = '', fromAlias = 'casting@bleuskm.com') {
  el.composeFrom.value   = fromAlias;
  el.composeTo.value     = toEmail;
  el.composeSubject.value= '';
  el.composeBody.value   = toName ? `Hi ${toName},\n\n` : '';
  el.composeModal.classList.remove('hidden');
}

async function sendComposeEmail() {
  const from    = el.composeFrom.value;
  const to      = el.composeTo.value.trim();
  const subject = el.composeSubject.value.trim();
  const body    = el.composeBody.value.trim();
  if (!to || !subject || !body) { toast('Please fill in all fields.', 'error'); return; }

  el.composeModalSend.disabled = true; el.composeModalSend.textContent = 'Sending...';
  try {
    const res = await fetch(CFG.BREVO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: CFG.BREVO_EMAIL,
        payload: {
          sender: { name: 'BLEUSKM Studios', email: from },
          to: [{ email: to }],
          subject,
          textContent: body,
        },
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}`);
    el.composeModal.classList.add('hidden');
    addEmailArchive(from, to, subject, 'Direct Email');
    toast(`Email sent from ${from} to ${to}`, 'success');
  } catch (err) {
    toast(`Failed: ${err.message}`, 'error');
  } finally {
    el.composeModalSend.disabled = false; el.composeModalSend.textContent = 'Send Email';
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACTS (localStorage)
═══════════════════════════════════════════════════════════════ */
function loadLocalContracts() {
  try { contracts = JSON.parse(localStorage.getItem('bleuskm_contracts') || '[]'); } catch { contracts = []; }
  renderContracts();
}

function saveLocalContracts() {
  localStorage.setItem('bleuskm_contracts', JSON.stringify(contracts));
}

function bindContractsPanel() {
  if (el.newContractBtn) {
    el.newContractBtn.addEventListener('click', e => { e.stopPropagation(); openContractModal(); });
  }
  // Tab switching in the contracts hub
  document.querySelectorAll('.contracts-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.contracts-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeContractTab = tab.dataset.tab;
      renderContracts();
    });
  });

  document.querySelectorAll('.contracts-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.contracts-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeContractTab = tab.dataset.tab;
      renderContracts();
    });
  });

  el.contractModalClose.addEventListener('click', () => el.contractModal.classList.add('hidden'));
  el.contractModalCancel.addEventListener('click', () => el.contractModal.classList.add('hidden'));
  el.contractModal.addEventListener('click', e => { if (e.target === el.contractModal) el.contractModal.classList.add('hidden'); });
  el.contractSaveBtn.addEventListener('click', saveContract);
  el.contractPrintBtn.addEventListener('click', printContract);
}

function openContractModal(existingId = null) {
  editingContractId = existingId;
  const typeVal = document.getElementById('contractType')?.value || 'crew';
  const tmpl = CONTRACT_TEMPLATES[typeVal] || CONTRACT_TEMPLATES.crew;
  if (el.contractModalTitle) el.contractModalTitle.textContent = existingId ? `EDIT — ${tmpl.title}` : tmpl.title;
  renderContractBody(typeVal);

  if (existingId) {
    const c = contracts.find(x => x.id === existingId);
    if (c) {
      el.contractType.value  = c.type;
      el.contractFilm.value  = c.film;
      el.contractName.value  = c.name;
      el.contractEmail.value = c.email;
      el.contractRole.value  = c.role;
      el.contractTerms.value = c.terms;
      const sigInput = document.getElementById('sigTypeInput'); if (sigInput) sigInput.value = c.signature || '';
    }
  } else {
    el.contractType.value = 'cast';
    el.contractFilm.value = 'The Final Hand';
    el.contractName.value = el.contractEmail.value = el.contractRole.value = el.contractTerms.value = '';
    const sigInputNew = document.getElementById('sigTypeInput'); if (sigInputNew) sigInputNew.value = '';
    if (sigCtx) sigCtx.clearRect(0, 0, document.getElementById('sigCanvas').width, document.getElementById('sigCanvas').height);
  }
  el.contractModal.classList.remove('hidden');
}

function openContractForContact(name, email, role, type) {
  editingContractId = null;
  el.contractModalTitle.textContent = 'New Contract';
  el.contractType.value  = type === 'cast' ? 'cast' : 'crew';
  el.contractFilm.value  = 'The Final Hand';
  el.contractName.value  = name;
  el.contractEmail.value = email;
  el.contractRole.value  = role;
  el.contractTerms.value = '';
  (function(){var _el_sigTypeInput=document.getElementById('sigTypeInput');if(_el_sigTypeInput)_el_sigTypeInput.value='';})()
  if (sigCtx) sigCtx.clearRect(0, 0, document.getElementById('sigCanvas').width, document.getElementById('sigCanvas').height);
  el.contractModal.classList.remove('hidden');
}

async function saveContract() {
  const name  = el.contractName.value.trim();
  const email = el.contractEmail.value.trim();
  const terms = el.contractTerms.value.trim();
  if (!name || !terms) { toast('Name and terms are required.', 'error'); return; }

  const sig = getSigValue();
  const id  = editingContractId || Date.now().toString();

  const contract = {
    id,
    type:      el.contractType.value,
    film:      el.contractFilm.value,
    name,
    email,
    role:      el.contractRole.value.trim(),
    terms,
    signature: sig,
    status:    sig ? 'signed' : 'draft',
    created:   editingContractId ? (contracts.find(c => c.id === id)?.created || new Date().toISOString()) : new Date().toISOString(),
  };

  if (editingContractId) {
    const idx = contracts.findIndex(c => c.id === editingContractId);
    if (idx > -1) contracts[idx] = contract;
  } else {
    contracts.push(contract);
  }
  saveLocalContracts();
  renderContracts();
  el.contractModal.classList.add('hidden');
  toast('Contract saved', 'success');

  // Send via email if email present
  if (email && sig) {
    try {
      await fetch(CFG.BREVO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: CFG.BREVO_EMAIL,
          payload: {
            sender: { name: 'BLEUSKM Studios', email: 'casting@bleuskm.com' },
            to: [{ email }],
            subject: `Your Contract — ${contract.film} | BLEUSKM Studios`,
            htmlContent: buildContractHtml(contract),
          },
        }),
      });
      toast(`Contract emailed to ${email}`, 'success');
    } catch { toast('Contract saved but email failed.', 'error'); }
  }
}

function getSigValue() {
  if (!document.getElementById('sigTypeTab')?.classList.contains('active')) {
    // Draw mode — get canvas data
    if (!sigCtx) return '';
    const blank = document.createElement('canvas');
    blank.width = document.getElementById('sigCanvas').width; blank.height = document.getElementById('sigCanvas').height;
    return document.getElementById('sigCanvas').toDataURL() === blank.toDataURL() ? '' : document.getElementById('sigCanvas').toDataURL();
  }
  return document.getElementById('sigTypeInput')?.value.trim();
}

function buildContractHtml(c) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
    <h2 style="font-size:18px;margin-bottom:4px;">BLEUSKM Studios — ${esc(c.film)}</h2>
    <p style="font-size:12px;color:#888;margin-bottom:24px;">${esc(c.type.toUpperCase())} AGREEMENT</p>
    <p><strong>Name:</strong> ${esc(c.name)}</p>
    <p><strong>Role / Position:</strong> ${esc(c.role)}</p>
    <hr style="margin:20px 0;border-color:#eee;">
    <pre style="font-size:13px;white-space:pre-wrap;font-family:inherit;">${esc(c.terms)}</pre>
    <hr style="margin:20px 0;border-color:#eee;">
    <p><strong>Signature:</strong> ${c.signature && c.signature.startsWith('data:') ? `<img src="${c.signature}" style="max-width:200px;display:block;margin-top:8px;">` : `<em>${esc(c.signature || 'Unsigned')}</em>`}</p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">Date: ${new Date(c.created).toLocaleDateString()}</p>
  </div>`;
}

function printContract() {
  window.print();
}

function setContractDate() {
  const el2 = document.getElementById('contractDateSigned');
  if (el2) el2.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderContracts() {
  const filtered = contracts.filter(c => c.type === activeContractTab);
  const ccEl = document.getElementById('contractCounts'); if (ccEl) ccEl.textContent = `${contracts.length} total · ${filtered.length} shown`;

  if (!filtered.length) {
    el.contractsList.innerHTML = `<p style="font-size:10px;color:var(--muted);padding:16px 0;">No ${activeContractTab} contracts yet.</p>`;
    return;
  }

  el.contractsList.innerHTML = '';
  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'contract-card';
    card.innerHTML = `
      <div class="contract-card-header">
        <div>
          <div class="contract-card-name">${esc(c.name)}</div>
          <div class="contract-card-film">${esc(c.film)}</div>
          <div class="contract-card-role">${esc(c.role)}</div>
        </div>
        <span class="contract-status-badge ${c.status}">${c.status.toUpperCase()}</span>
      </div>
      <div style="font-size:9px;color:var(--dim);">${new Date(c.created).toLocaleDateString()}</div>
      <div class="contract-card-actions">
        <button class="contact-action-btn" onclick="openContractModal('${c.id}')">Edit</button>
        ${c.email ? `<button class="contact-action-btn" onclick="resendContract('${c.id}')">&#9993; Resend</button>` : ''}
        <button class="contact-action-btn" onclick="printContractById('${c.id}')">&#128438; Print</button>
        <button class="contact-action-btn" style="color:var(--err);" onclick="deleteContract('${c.id}')">Delete</button>
      </div>`;
    el.contractsList.appendChild(card);
  });
}

async function resendContract(id) {
  const c = contracts.find(x => x.id === id);
  if (!c || !c.email) return;
  try {
    await fetch(CFG.BREVO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: CFG.BREVO_EMAIL,
        payload: {
          sender: { name: 'BLEUSKM Studios', email: 'casting@bleuskm.com' },
          to: [{ email: c.email }],
          subject: `Your Contract — ${c.film} | BLEUSKM Studios`,
          htmlContent: buildContractHtml(c),
        },
      }),
    });
    toast(`Resent to ${c.email}`, 'success');
  } catch { toast('Resend failed.', 'error'); }
}

function printContractById(id) {
  const c = contracts.find(x => x.id === id);
  if (!c) return;
  const html = buildContractHtml(c);
  const win  = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Contract — ${c.name}</title></head><body>${html}</body></html>`);
  win.document.close(); win.print();
}

function deleteContract(id) {
  if (!confirm('Delete this contract? This cannot be undone.')) return;
  contracts = contracts.filter(c => c.id !== id);
  saveLocalContracts();
  renderContracts();
  toast('Contract deleted', 'success');
}

/* ═══════════════════════════════════════════════════════════════
   SIGNATURE CANVAS
═══════════════════════════════════════════════════════════════ */
function bindSignatureCanvas() {
  // Sig canvas is rendered dynamically by renderContractBody() and re-bound there
  // No static binding needed here
}

function initSigCanvas() {
  if (sigCtx) return;
  sigCtx = document.getElementById('sigCanvas').getContext('2d');
  sigCtx.strokeStyle = '#DAAF37';
  sigCtx.lineWidth   = 2;
  sigCtx.lineCap     = 'round';
  sigCtx.lineJoin    = 'round';

  function getPos(e) {
    const rect = document.getElementById('sigCanvas').getBoundingClientRect();
    const scaleX = document.getElementById('sigCanvas').width / rect.width;
    const scaleY = document.getElementById('sigCanvas').height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }
  document.getElementById('sigCanvas').addEventListener('mousedown', e => { sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
  document.getElementById('sigCanvas').addEventListener('mousemove', e => { if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
  document.getElementById('sigCanvas').addEventListener('mouseup',   () => sigDrawing = false);
  document.getElementById('sigCanvas').addEventListener('mouseleave',() => sigDrawing = false);
  document.getElementById('sigCanvas').addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }, { passive: false });
  document.getElementById('sigCanvas').addEventListener('touchmove',  e => { e.preventDefault(); if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }, { passive: false });
  document.getElementById('sigCanvas').addEventListener('touchend',   () => sigDrawing = false);
}

/* ═══════════════════════════════════════════════════════════════
   LOCATION TRACKER (localStorage)
═══════════════════════════════════════════════════════════════ */
function loadLocalLocations() {
  try { locations = JSON.parse(localStorage.getItem('bleuskm_locations') || '[]'); } catch { locations = []; }
  renderLocations();
}

function saveLocalLocations() {
  localStorage.setItem('bleuskm_locations', JSON.stringify(locations));
}

function bindLocationPanel() {
  if (el.addLocationBtn) {
    el.addLocationBtn.addEventListener('click', e => { e.stopPropagation(); openLocationModal(); });
  }
  if (el.locationSearch) {
    el.locationSearch.addEventListener('input', () => renderLocations(el.locationSearch.value.trim().toLowerCase()));
  }
  el.locationModalClose.addEventListener('click', () => el.locationModal.classList.add('hidden'));
  el.locationModalCancel.addEventListener('click', () => el.locationModal.classList.add('hidden'));
  el.locationModal.addEventListener('click', e => { if (e.target === el.locationModal) el.locationModal.classList.add('hidden'); });
  el.locationModalSave.addEventListener('click', saveLocation);

  // Address search using Nominatim (OpenStreetMap, no key needed)
  let locSearchTimer;
  el.locAddress.addEventListener('input', () => {
    clearTimeout(locSearchTimer);
    const q = el.locAddress.value.trim();
    if (q.length < 3) { el.locSuggestions.classList.add('hidden'); return; }
    locSearchTimer = setTimeout(() => searchAddress(q), 500);
  });
  el.locAddress.addEventListener('blur', () => setTimeout(() => el.locSuggestions.classList.add('hidden'), 200));
}

async function searchAddress(q) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const results = await res.json();
    el.locSuggestions.innerHTML = '';
    if (!results.length) { el.locSuggestions.classList.add('hidden'); return; }
    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'loc-suggestion-item';
      item.textContent = r.display_name;
      item.addEventListener('mousedown', () => {
        el.locAddress.value = r.display_name;
        el.locSuggestions.classList.add('hidden');
      });
      el.locSuggestions.appendChild(item);
    });
    el.locSuggestions.classList.remove('hidden');
  } catch { el.locSuggestions.classList.add('hidden'); }
}

function openLocationModal(existingId = null) {
  editingLocationId = existingId;
  el.locationModalTitle.textContent = existingId ? 'Edit Location' : 'Add Location';

  if (existingId) {
    const loc = locations.find(l => l.id === existingId);
    if (loc) {
      el.locName.value    = loc.name;
      el.locAddress.value = loc.address;
      el.locType.value    = loc.type;
      el.locFilm.value    = loc.film;
      el.locContact.value = loc.contact;
      el.locPhone.value   = loc.phone;
      el.locStatus.value  = loc.status;
      el.locNotes.value   = loc.notes;
    }
  } else {
    el.locName.value = el.locAddress.value = el.locContact.value = el.locPhone.value = el.locNotes.value = '';
    el.locType.value = 'Primary'; el.locFilm.value = 'The Final Hand'; el.locStatus.value = 'Not Contacted';
  }
  el.locSuggestions.classList.add('hidden');
  el.locationModal.classList.remove('hidden');
}

function saveLocation() {
  const name = el.locName.value.trim();
  if (!name) { toast('Location name required.', 'error'); return; }
  const id = editingLocationId || Date.now().toString();
  const loc = {
    id, name,
    address: el.locAddress.value.trim(),
    type:    el.locType.value,
    film:    el.locFilm.value,
    contact: el.locContact.value.trim(),
    phone:   el.locPhone.value.trim(),
    status:  el.locStatus.value,
    notes:   el.locNotes.value.trim(),
    created: editingLocationId ? (locations.find(l => l.id === id)?.created || new Date().toISOString()) : new Date().toISOString(),
  };
  if (editingLocationId) {
    const idx = locations.findIndex(l => l.id === editingLocationId);
    if (idx > -1) locations[idx] = loc;
  } else { locations.push(loc); }
  saveLocalLocations();
  renderLocations();
  el.locationModal.classList.add('hidden');
  toast('Location saved', 'success');
}

function updateLocationStatus(id, newStatus) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;
  loc.status = newStatus;
  saveLocalLocations();
  renderLocations();
  // If accepted, offer to create location contract
  if (newStatus === 'Accepted') {
    if (confirm(`${loc.name} accepted! Create a location agreement contract?`)) {
      switchHub('contracts');
      openContractForContact(loc.contact || loc.name, '', loc.name, 'location');
      if (el.contractType) el.contractType.value = 'location';
    }
  }
}

function deleteLocation(id) {
  if (!confirm('Remove this location?')) return;
  locations = locations.filter(l => l.id !== id);
  saveLocalLocations();
  renderLocations();
  toast('Location removed', 'success');
}

function renderLocations(query = '') {
  const filtered = query
    ? locations.filter(l => [l.name, l.address, l.film, l.contact, l.status].join(' ').toLowerCase().includes(query))
    : locations;

  el.locationCounts.textContent = `${locations.length} saved`;

  if (!filtered.length) {
    el.locationGrid.innerHTML = `<p style="font-size:10px;color:var(--muted);padding:16px 0;">${query ? 'No locations match.' : 'No locations saved yet.'}</p>`;
    return;
  }

  const STATUS_CLASSES = {
    'Not Contacted': 'loc-status-not-contacted',
    'Called':        'loc-status-called',
    'Maybe':         'loc-status-maybe',
    'Accepted':      'loc-status-accepted',
    'Declined':      'loc-status-declined',
  };

  el.locationGrid.innerHTML = '';
  filtered.forEach(loc => {
    const card = document.createElement('div');
    card.className = 'location-card';
    const statusCls = STATUS_CLASSES[loc.status] || 'loc-status-not-contacted';
    card.innerHTML = `
      <div class="location-card-header">
        <div>
          <div class="location-card-name">${esc(loc.name)}</div>
          <div style="font-size:9px;color:var(--golddim);font-weight:600;margin-top:2px;">${esc(loc.film)}</div>
        </div>
        <span class="location-type-badge ${loc.type === 'Primary' ? 'primary' : ''}">${esc(loc.type)}</span>
      </div>
      ${loc.address ? `<div class="location-card-address">${esc(loc.address)}</div>` : ''}
      <div class="location-card-meta">
        <select class="location-status-badge ${statusCls}" data-loc-id="${loc.id}">
          <option value="Not Contacted" ${loc.status === 'Not Contacted' ? 'selected' : ''}>Not Contacted</option>
          <option value="Called"        ${loc.status === 'Called'        ? 'selected' : ''}>Called (No Answer)</option>
          <option value="Maybe"         ${loc.status === 'Maybe'         ? 'selected' : ''}>Maybe</option>
          <option value="Accepted"      ${loc.status === 'Accepted'      ? 'selected' : ''}>Accepted</option>
          <option value="Declined"      ${loc.status === 'Declined'      ? 'selected' : ''}>Declined</option>
        </select>
      </div>
      ${loc.contact ? `<div style="font-size:10px;color:var(--muted);">Contact: ${esc(loc.contact)}${loc.phone ? ` · ${esc(loc.phone)}` : ''}</div>` : ''}
      ${loc.notes ? `<div style="font-size:10px;color:var(--dim);margin-top:6px;line-height:1.5;">${esc(loc.notes)}</div>` : ''}
      <div class="location-card-actions">
        <button class="contact-action-btn" onclick="openLocationModal('${loc.id}')">Edit</button>
        ${loc.status === 'Accepted' ? `<button class="contact-action-btn" onclick="openContractForContact('${esc(loc.contact || loc.name)}','','${esc(loc.name)}','location');el.contractType&&(el.contractType.value='location');">&#128466; Contract</button>` : ''}
        <button class="contact-action-btn" style="color:var(--err);" onclick="deleteLocation('${loc.id}')">Remove</button>
      </div>`;
    const statusSelect = card.querySelector('select[data-loc-id]');
    statusSelect.addEventListener('change', () => updateLocationStatus(loc.id, statusSelect.value));
    el.locationGrid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL MODAL (per-row template picker, templates 16-19)
═══════════════════════════════════════════════════════════════ */
function bindEmailModal() {
  el.emailModalClose.addEventListener('click', () => el.emailModal.classList.add('hidden'));
  el.emailModalCancel.addEventListener('click', () => el.emailModal.classList.add('hidden'));
  el.emailModal.addEventListener('click', e => { if (e.target === el.emailModal) el.emailModal.classList.add('hidden'); });
  el.emailModalTemplate.addEventListener('change', () => {
    const tid = el.emailModalTemplate.value;
    el.emailFilmField.classList.toggle('hidden', tid !== '17' && tid !== '18');
    el.emailRoleField.classList.toggle('hidden', tid !== '18');
  });
  el.emailModalSend.addEventListener('click', sendFromEmailModal);
}

function openEmailModal(record) {
  pendingEmailRecord = record;
  const f = record.fields;
  const name = (f['Name'] || f['Email'] || '').trim();
  const status = (f['Casting Status'] || '').trim();
  el.emailModalRecipient.textContent = name;

  // Pre-select template based on status
  if (status === 'Pass')     el.emailModalTemplate.value = '16';
  else if (status === 'Redirect') {
    const { toRole } = getRedirectType(record);
    el.emailModalTemplate.value = toRole ? '18' : '17';
  } else el.emailModalTemplate.value = '19';

  // Pre-fill film/role
  const { toRole, filmName } = getRedirectType(record);
  el.emailFilmInput.value = filmName || (f['Film'] || 'The Final Hand').trim();
  el.emailRoleInput.value = toRole || '';

  // Show/hide conditional fields
  const tid = el.emailModalTemplate.value;
  el.emailFilmField.classList.toggle('hidden', tid !== '17' && tid !== '18');
  el.emailRoleField.classList.toggle('hidden', tid !== '18');

  el.emailModal.classList.remove('hidden');
}

async function sendFromEmailModal() {
  const record = pendingEmailRecord;
  if (!record) return;
  const tid  = parseInt(el.emailModalTemplate.value, 10);
  if (!tid)  { toast('Please choose a template.', 'error'); return; }

  const film = el.emailFilmInput.value.trim() || 'The Final Hand';
  const role = el.emailRoleInput.value.trim();

  el.emailModalSend.disabled = true; el.emailModalSend.textContent = 'Sending...';
  try {
    const f    = record.fields;
    const id   = record.id;
    const email= (f['Email'] || '').trim();
    const name = (f['Name']  || '').trim();
    const roleF= (f['Role']  || '').trim();
    if (!email) throw new Error('No email on this record.');

    let params = { NAME: name, ROLE: roleF };

    if (tid === 16) {
      // Pass — no extra params needed
    } else if (tid === 17) {
      params.FILM_NAME       = film;
      params.FILM_LINK       = CFG.FILM_LINK;
      params.CONSENT_YES_URL = buildConsentUrl(id, 'yes', film);
      params.CONSENT_NO_URL  = buildConsentUrl(id, 'no',  film);
    } else if (tid === 18) {
      params.TO_ROLE         = role;
      params.FILM_NAME       = film;
      params.CONSENT_YES_URL = buildConsentUrl(id, 'yes', film);
      params.CONSENT_NO_URL  = buildConsentUrl(id, 'no',  film);
    } else if (tid === 19) {
      params.CALENDLY_URL    = CFG.CALENDLY;
      params.FILM_NAME       = film;
      params.SELFTAPE_URL    = buildSelfTapeUrl(name, roleF, email, id);
    }

    await sendEmail(email, tid, params);

    const sentLabel = tid === 16 ? 'Rejection Sent' : tid === 17 ? 'Redirect Sent' : tid === 18 ? 'Redirect Sent' : 'Availability Sent';
    await patchRecord(id, { 'Email Sent': sentLabel }).catch(() => {});
    const rec = allRecords.find(r => r.id === id);
    if (rec) rec.fields['Email Sent'] = sentLabel;
    sentMap[id] = true;
    updateEmailBadge(id, tid === 19 ? 'scheduled' : 'sent');
    el.emailModal.classList.add('hidden');
    addEmailArchive('casting@bleuskm.com', email, `Template ${tid}`, `T${tid} — Template`);
    toast(`Template ${tid} sent to ${email}`, 'success');
    renderTable();
  } catch (err) {
    toast(`Failed: ${err.message}`, 'error');
  } finally {
    el.emailModalSend.disabled = false; el.emailModalSend.textContent = 'Send Email';
  }
}

/* ═══════════════════════════════════════════════════════════════
   BATCH BAR
═══════════════════════════════════════════════════════════════ */
function bindBatchBar() {
  el.batchClearBtn.addEventListener('click', () => {
    selectedIds.clear(); renderTable(); updateBatchBar();
  });
  el.batchSendBtn.addEventListener('click', async () => {
    const tid = parseInt(el.batchTemplateSelect.value, 10);
    if (!tid) { toast('Choose a template first.', 'error'); return; }

    const targets = allRecords.filter(r => selectedIds.has(r.id));
    if (!targets.length) return;
    el.batchSendBtn.disabled = true; el.batchSendBtn.textContent = 'Sending...';
    let ok = 0, skip = 0, fail = 0;

    for (const record of targets) {
      const f   = record.fields, id = record.id;
      const email = (f['Email'] || '').trim();
      const name  = (f['Name']  || '').trim();
      const role  = (f['Role']  || '').trim();
      const emailSent = (f['Email Sent'] || '').trim();

      if (!email) { skip++; continue; }
      if (emailSent && emailSent !== 'Availability Sent' && tid !== 19) { skip++; continue; }

      const film = (f['Film'] || 'The Final Hand').trim();
      const { toRole, filmName } = getRedirectType(record);
      let params = { NAME: name, ROLE: role };

      if (tid === 17) {
        params.FILM_NAME = filmName || film; params.FILM_LINK = CFG.FILM_LINK;
        params.CONSENT_YES_URL = buildConsentUrl(id, 'yes', params.FILM_NAME);
        params.CONSENT_NO_URL  = buildConsentUrl(id, 'no',  params.FILM_NAME);
      } else if (tid === 18) {
        params.TO_ROLE = toRole || role; params.FILM_NAME = film;
        params.CONSENT_YES_URL = buildConsentUrl(id, 'yes', film);
        params.CONSENT_NO_URL  = buildConsentUrl(id, 'no',  film);
      } else if (tid === 19) {
        params.CALENDLY_URL = CFG.CALENDLY; params.FILM_NAME = film;
        params.SELFTAPE_URL = buildSelfTapeUrl(name, role, email, id);
      }

      try {
        await sendEmail(email, tid, params);
        const sl = tid === 16 ? 'Rejection Sent' : tid === 19 ? 'Availability Sent' : 'Redirect Sent';
        await patchRecord(id, { 'Email Sent': sl }).catch(() => {});
        const rec = allRecords.find(r => r.id === id);
        if (rec) rec.fields['Email Sent'] = sl;
        sentMap[id] = true;
        addEmailArchive('casting@bleuskm.com', email, `T${tid} — ${sl}`, `T${tid} Batch`);
        ok++;
      } catch { fail++; }
      await sleep(280);
    }

    toast(`Batch: ${ok} sent${skip ? `, ${skip} skipped` : ''}${fail ? `, ${fail} failed` : ''}`, fail ? 'error' : 'success');
    selectedIds.clear(); renderTable(); updateBatchBar();
    el.batchSendBtn.disabled = false; el.batchSendBtn.textContent = 'Send to Selected';
  });
}

function updateBatchBar() {
  const count = selectedIds.size;
  if (count === 0) { el.batchBar.classList.add('hidden'); return; }
  el.batchBar.classList.remove('hidden');
  el.batchCount.textContent = `${count} selected`;
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
    tlRecords  = (data.records || []).sort((a, b) =>
      (a.fields['Start Date'] || '').localeCompare(b.fields['Start Date'] || ''));
    renderTimeline();
    renderCalendar();
  } catch {
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
  if (!tlRecords.length) { el.timelineTrack.innerHTML = `<span style="font-size:10px;color:var(--muted);">No phases found.</span>`; return; }
  el.timelineTrack.innerHTML = '';
  tlRecords.forEach(record => {
    const f      = record.fields;
    const status = (f['Status'] || 'Upcoming').toLowerCase();
    const dateStr = [formatDate(f['Start Date']), formatDate(f['End Date'])].filter(Boolean).join(' — ');
    const card   = document.createElement('div');
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
  el.calClose.addEventListener('click', () => { el.calendarWrap.classList.add('hidden'); el.calToggleBtn.style.color = ''; });
  el.calPrev.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() - 1); renderCalendar(); });
  el.calNext.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() + 1); renderCalendar(); });
}

function renderCalendar() {
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

/* ── Timeline Edit Modal ─────────────────────────────────────── */
function openTimelineModal(record) {
  const f = record.fields;
  if (el.tlModalPhase) el.tlModalPhase.textContent = f['Phase'] || 'Phase';
  el.tlModalId.value    = record.id;
  el.tlPhaseInput.value = f['Phase']       || '';
  el.tlStartInput.value = f['Start Date']  || '';
  el.tlEndInput.value   = f['End Date']    || '';
  el.tlStatusInput.value= f['Status']      || 'Upcoming';
  el.tlDescInput.value  = f['Description'] || '';
  el.tlModal.classList.remove('hidden');
}

function bindTimelineModal() {
  const closeTlModal = () => el.tlModal.classList.add('hidden');
  const tlClose = document.getElementById('tlModalClose');
  if (tlClose) tlClose.addEventListener('click', closeTlModal);
  el.tlModalCancel.addEventListener('click', closeTlModal);
  el.tlModal.addEventListener('click', e => { if (e.target === el.tlModal) el.tlModal.classList.add('hidden'); });
  el.tlModalSave.addEventListener('click', async () => {
    const id = el.tlModalId.value;
    el.tlModalSave.disabled = true; el.tlModalSave.textContent = 'Saving...';
    try {
      await patchTimeline(id, { 'Phase': el.tlPhaseInput.value.trim(), 'Start Date': el.tlStartInput.value || null, 'End Date': el.tlEndInput.value || null, 'Status': el.tlStatusInput.value, 'Description': el.tlDescInput.value.trim() });
      const rec = tlRecords.find(r => r.id === id);
      if (rec) { rec.fields['Phase'] = el.tlPhaseInput.value.trim(); rec.fields['Start Date'] = el.tlStartInput.value || null; rec.fields['End Date'] = el.tlEndInput.value || null; rec.fields['Status'] = el.tlStatusInput.value; rec.fields['Description'] = el.tlDescInput.value.trim(); }
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
   DISPATCH (row-level send btn — opens email modal)
═══════════════════════════════════════════════════════════════ */
function getRedirectType(record) {
  const crField = record.fields['Callback/Redirect'] || [];
  const crArr   = Array.isArray(crField) ? crField : (crField ? [crField] : []);
  const hasToRole = crArr.includes(TO_ROLE_TRIGGER);
  const filmName  = crArr.find(v => FILM_OPTIONS.includes(v)) || '';
  const toRole    = (record.fields['To Role'] || '').trim();
  return { hasToRole, filmName, toRole };
}

function buildConsentUrl(recordId, consent, film) {
  return CFG.RESPONSE_BASE + '?id=' + encodeURIComponent(recordId) + '&consent=' + encodeURIComponent(consent) + '&film=' + encodeURIComponent(film);
}

function buildSelfTapeUrl(name, role, email, id) {
  return CFG.SELFTAPE_BASE + '?name=' + encodeURIComponent(name) + '&role=' + encodeURIComponent(role) + '&email=' + encodeURIComponent(email) + '&id=' + encodeURIComponent(id);
}

function actionLabel(status, record) {
  if (status === 'Callback') return 'Send Callback';
  if (status === 'Pass')     return 'Send Rejection';
  if (status === 'Redirect') {
    const { hasToRole } = getRedirectType(record);
    return hasToRole ? 'Send Role Invite' : 'Send Redirect';
  }
  return 'Send Email';
}

function updateEmailBadge(id, type) {
  const b = document.querySelector(`[data-email-badge="${id}"]`);
  if (!b) return;
  if (type === 'sent')      { b.textContent = 'Sent';             b.className = 'email-badge sent'; }
  if (type === 'scheduled') { b.textContent = 'Availability Sent'; b.className = 'email-badge scheduled'; }
}

/* ═══════════════════════════════════════════════════════════════
   REDIRECT MODAL (legacy — kept for backward compat)
═══════════════════════════════════════════════════════════════ */
function openRedirectModal(record) {
  openEmailModal(record);
}

const FINAL_HAND_ROLES = ['High John','The Player','The Stranger','Bartender / Waitress','Table Patron','The Couple'];

function populateRoles(filmName) {
  el.roleSelect.innerHTML = '<option value="">— General redirect (no role) —</option>';
  const roles = filmName === 'The Final Hand' ? FINAL_HAND_ROLES : [];
  roles.forEach(r => {
    const opt = document.createElement('option'); opt.value = r; opt.textContent = r; el.roleSelect.appendChild(opt);
  });
  const custom = document.createElement('option'); custom.value = '__custom'; custom.textContent = 'Custom role...'; el.roleSelect.appendChild(custom);
}

function bindRedirectModal() {
  // Redirect modal removed - email modal handles all template sends now
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
      renderTable(); updateBatchBar();
    });
  });
}

function bindSearch() {
  el.searchInput.addEventListener('input', () => {
    searchQuery = el.searchInput.value.trim().toLowerCase();
    el.searchClear.classList.toggle('hidden', !searchQuery);
    selectedIds.clear(); renderTable(); updateBatchBar();
  });
  el.searchClear.addEventListener('click', () => {
    el.searchInput.value = ''; searchQuery = '';
    el.searchClear.classList.add('hidden');
    selectedIds.clear(); renderTable(); updateBatchBar(); el.searchInput.focus();
  });
}

function getVisible() {
  return allRecords.filter(r => {
    const f = r.fields, status = (f['Casting Status'] || '').trim();
    if (activeFilter !== 'All' && status !== activeFilter) return false;
    if (searchQuery) {
      const hay = [f['Name']||'', f['Email']||'', f['Role']||'', f['Location']||''].join(' ').toLowerCase();
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

  const thead = document.getElementById('castingTableHead');
  thead.innerHTML = `<tr>
    <th class="col-check" id="thCheck"></th>
    <th class="col-arrow"></th>
    <th>Name</th>
    <th>Role</th>
    <th>Status</th>
    <th>Self-Tape</th>
    <th>Email Status</th>
    <th class="col-action">Action</th>
  </tr>`;

  // Select all checkbox in header
  const thCheck = document.getElementById('thCheck');
  const selAllCb = document.createElement('input');
  selAllCb.type = 'checkbox'; selAllCb.title = 'Select all';
  selAllCb.checked = records.length > 0 && records.every(r => selectedIds.has(r.id));
  selAllCb.addEventListener('change', () => {
    if (selAllCb.checked) records.forEach(r => selectedIds.add(r.id));
    else records.forEach(r => selectedIds.delete(r.id));
    renderTable(); updateBatchBar();
  });
  thCheck.appendChild(selAllCb);

  el.tbody.innerHTML = '';
  records.forEach(r => buildRow(r));
  showState('table');
}

function buildRow(record) {
  const f  = record.fields, id = record.id;
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
  const emailSent  = (f['Email Sent']   || '').trim();
  const toRoleVal  = (f['To Role']      || '').trim();
  const redirectFilms = f['Callback/Redirect'] || [];
  const filmArr = Array.isArray(redirectFilms) ? redirectFilms : (redirectFilms ? [redirectFilms] : []);
  const { hasToRole, filmName } = getRedirectType(record);

  const isSelected  = selectedIds.has(id);
  const alreadySent = sentMap[id] || ['Callback Sent','Redirect Sent','Rejection Sent'].includes(emailSent);
  const isScheduled = scheduledMap[id] || emailSent === 'Availability Sent';
  const isExpanded  = expandedIds.has(id);

  const summaryRow = document.createElement('tr');
  summaryRow.className = `summary-row${isExpanded ? ' expanded' : ''}${isSelected ? ' row-sel' : ''}`;
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

  // Expand arrow
  const tdArrow = document.createElement('td'); tdArrow.className = 'col-arrow';
  tdArrow.innerHTML = '<span class="expand-arrow">&#9654;</span>';
  summaryRow.appendChild(tdArrow);

  // Name
  summaryRow.appendChild(makeTd(`<span class="cell-name">${esc(name) || '—'}</span>`));

  // Role
  const roleDisplay = (hasToRole && toRoleVal) ? `${esc(role)} <span style="font-size:9px;color:var(--golddim);">&#8594; ${esc(toRoleVal)}</span>` : esc(role) || '—';
  summaryRow.appendChild(makeTd(`<span class="cell-role">${roleDisplay}</span>`));

  // Status + consent
  const statusTd = document.createElement('td');
  let statusHtml = statusBadge(status);
  if (filmArr.length) {
    const displayFilms = filmArr.filter(v => v !== TO_ROLE_TRIGGER);
    if (displayFilms.length) statusHtml += `<span style="display:block;font-size:9px;color:var(--redirect);opacity:0.7;margin-top:4px;line-height:1.5;">${displayFilms.map(esc).join('<br>')}</span>`;
    if (hasToRole && toRoleVal) statusHtml += `<span style="display:block;font-size:9px;color:var(--gold);opacity:0.7;margin-top:2px;">${esc(toRoleVal)}</span>`;
  }
  if (consent) {
    const cc = consent === 'Accepted' ? 'var(--sent)' : 'var(--muted)';
    statusHtml += `<span style="display:block;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:${cc};margin-top:5px;">${esc(consent)}</span>`;
  }
  statusTd.innerHTML = statusHtml; summaryRow.appendChild(statusTd);

  // Self-tape
  const stTd = document.createElement('td');
  if (status === 'Pass') {
    stTd.innerHTML = `<span style="color:var(--dim);font-size:9px;">—</span>`;
  } else {
    const stCls = stStatus === 'Selected for Final Round' ? 'selected' : stStatus === 'Reviewed' ? 'reviewed' : stStatus === 'Submitted' ? 'submitted' : 'not-submitted';
    const stLabel = stStatus === 'Selected for Final Round' ? 'Selected' : stStatus;
    stTd.innerHTML = `<span class="st-badge ${stCls}" data-st-badge="${id}">${esc(stLabel)}</span>`;
  }
  summaryRow.appendChild(stTd);

  // Email badge
  const emailBadgeTd = document.createElement('td');
  let ebClass = 'not-sent', ebText = 'Not Sent';
  if (isScheduled)       { ebClass = 'scheduled'; ebText = 'Availability Sent'; }
  else if (alreadySent)  { ebClass = 'sent';       ebText = 'Sent'; }
  emailBadgeTd.innerHTML = `<span class="email-badge ${ebClass}" data-email-badge="${id}">${ebText}</span>`;
  summaryRow.appendChild(emailBadgeTd);

  // Action — single "Send Email" button opening modal
  const tdAction = document.createElement('td'); tdAction.className = 'col-action';
  const actionGroup = document.createElement('div'); actionGroup.className = 'action-group';

  if (['Callback','Redirect','Pass'].includes(status)) {
    const btn = document.createElement('button');
    btn.className = `action-btn btn-${status.toLowerCase()}`;
    btn.dataset.actionId = id;
    btn.textContent = alreadySent ? 'Sent' : actionLabel(status, record);
    if (alreadySent) { btn.classList.add('sent'); btn.disabled = true; }
    btn.addEventListener('click', e => { e.stopPropagation(); openEmailModal(record); });
    actionGroup.appendChild(btn);
  }

  if (stStatus === 'Selected for Final Round') {
    const availBtn = document.createElement('button');
    availBtn.className = 'action-btn btn-availability';
    availBtn.dataset.availId = id;
    availBtn.textContent = isScheduled ? 'Availability Sent' : 'Send Availability';
    if (isScheduled) { availBtn.classList.add('scheduled'); availBtn.disabled = true; }
    availBtn.addEventListener('click', e => { e.stopPropagation(); pendingEmailRecord = record; el.emailModalTemplate.value = '19'; el.emailFilmField.classList.add('hidden'); el.emailRoleField.classList.add('hidden'); el.emailModalRecipient.textContent = name; el.emailModal.classList.remove('hidden'); });
    actionGroup.appendChild(availBtn);
  }

  if (stStatus === 'Submitted') {
    const revBtn = document.createElement('button');
    revBtn.className = 'action-btn';
    revBtn.textContent = 'Mark Reviewed';
    revBtn.addEventListener('click', async e => {
      e.stopPropagation(); revBtn.textContent = '...'; revBtn.disabled = true;
      try {
        await patchRecord(id, { 'Self Tape Status': 'Reviewed' });
        const rec = allRecords.find(r => r.id === id);
        if (rec) rec.fields['Self Tape Status'] = 'Reviewed';
        const badge = document.querySelector(`[data-st-badge="${id}"]`);
        if (badge) { badge.textContent = 'Reviewed'; badge.className = 'st-badge reviewed'; }
        revBtn.remove(); toast('Marked as reviewed', 'success');
      } catch (err) { revBtn.textContent = 'Mark Reviewed'; revBtn.disabled = false; toast(`Failed: ${err.message}`, 'error'); }
    });
    actionGroup.appendChild(revBtn);
  }

  if (!actionGroup.children.length) tdAction.innerHTML = `<span style="font-size:9px;color:var(--dim)">—</span>`;
  else tdAction.appendChild(actionGroup);
  summaryRow.appendChild(tdAction);

  summaryRow.addEventListener('click', e => {
    if (e.target.closest('input, button, a')) return;
    toggleExpand(id, detailRow);
    const isNowExpanded = expandedIds.has(id);
    summaryRow.classList.toggle('expanded', isNowExpanded);
    const arrow = summaryRow.querySelector('.expand-arrow');
    if (arrow) arrow.style.transform = isNowExpanded ? 'rotate(90deg)' : '';
  });
  el.tbody.appendChild(summaryRow);

  // Detail row
  const detailRow = document.createElement('tr');
  detailRow.className = `detail-row${isExpanded ? ' open' : ''}`;
  const detailTd = document.createElement('td');
  detailTd.colSpan = 8;
  const panel = document.createElement('div'); panel.className = 'detail-panel';

  panel.appendChild(detailField('EMAIL', `<a href="mailto:${esc(email)}">${esc(email) || '—'}</a>`));
  panel.appendChild(detailEditField(id, phone, 'Phone', 'PHONE'));
  panel.appendChild(detailField('FILM', esc(film) || '—'));
  panel.appendChild(detailEditField(id, loc, 'Location', 'LOCATION'));

  let mediaHtml = '';
  if (reel) mediaHtml += `<a href="${esc(reel)}" target="_blank" rel="noopener">Reel &#8599;</a><br>`;
  if (head) mediaHtml += `<a href="${esc(head)}" target="_blank" rel="noopener">Headshot &#8599;</a>`;
  if (!reel && !head) mediaHtml = '<span style="color:var(--dim)">—</span>';
  panel.appendChild(detailField('MEDIA', mediaHtml));

  if (stUrl) panel.appendChild(detailField('SELF-TAPE', `<a href="${esc(stUrl)}" target="_blank" rel="noopener">View Tape &#8599;</a>`));
  if (toRoleVal) panel.appendChild(detailField('TO ROLE', esc(toRoleVal)));
  if (filmArr.filter(v => v !== TO_ROLE_TRIGGER).length) panel.appendChild(detailField('REDIRECT FILM', filmArr.filter(v => v !== TO_ROLE_TRIGGER).map(esc).join(', ')));
  if (castStatus) panel.appendChild(detailField('CAST STATUS', esc(castStatus)));
  if (emailSent) panel.appendChild(detailField('EMAIL SENT', esc(emailSent)));
  if (consent) panel.appendChild(detailField('REDIRECT CONSENT', `<span style="color:${consent === 'Accepted' ? 'var(--sent)' : 'var(--muted)'}">${esc(consent)}</span>`));

  // Compose email quick link in detail
  if (email) {
    const composeLink = document.createElement('div'); composeLink.className = 'detail-field';
    const lbl = document.createElement('span'); lbl.className = 'detail-label'; lbl.textContent = 'DIRECT EMAIL';
    const btn = document.createElement('button');
    btn.className = 'contact-action-btn';
    btn.textContent = '✉ Compose';
    btn.style.marginTop = '4px';
    btn.addEventListener('click', () => openComposeModal(email, name, 'casting@bleuskm.com'));
    composeLink.appendChild(lbl); composeLink.appendChild(btn);
    panel.appendChild(composeLink);
  }

  const notesDf = document.createElement('div');
  notesDf.className = 'detail-field'; notesDf.style.gridColumn = 'span 3';
  const notesLabel = document.createElement('span'); notesLabel.className = 'detail-label'; notesLabel.textContent = 'NOTES';
  const notesTA = document.createElement('textarea');
  notesTA.className = 'notes-edit'; notesTA.value = notes; notesTA.rows = 2; notesTA.placeholder = 'Add note...';
  notesTA.setAttribute('data-original', notes);
  notesTA.addEventListener('blur', async () => {
    const newVal = notesTA.value, origVal = notesTA.getAttribute('data-original');
    if (newVal === origVal) return;
    try {
      await patchRecord(id, { Notes: newVal }); notesTA.setAttribute('data-original', newVal);
      const rec = allRecords.find(r => r.id === id); if (rec) rec.fields['Notes'] = newVal;
      flashSaved(notesTA);
    } catch (err) { notesTA.value = origVal; flashError(notesTA); toast(`Note save failed: ${err.message}`, 'error'); }
  });
  notesDf.appendChild(notesLabel); notesDf.appendChild(notesTA); panel.appendChild(notesDf);

  detailTd.appendChild(panel); detailRow.appendChild(detailTd);
  el.tbody.appendChild(detailRow);
}

function toggleExpand(id, detailRow) {
  if (expandedIds.has(id)) { expandedIds.delete(id); detailRow.classList.remove('open'); }
  else { expandedIds.add(id); detailRow.classList.add('open'); }
}

function detailField(label, valueHtml) {
  const df = document.createElement('div'); df.className = 'detail-field';
  df.innerHTML = `<span class="detail-label">${label}</span><span class="detail-value">${valueHtml}</span>`;
  return df;
}

function detailEditField(recordId, value, fieldName, label) {
  const df = document.createElement('div'); df.className = 'detail-field';
  const lbl = document.createElement('span'); lbl.className = 'detail-label'; lbl.textContent = label;
  const div = document.createElement('div'); div.className = 'editable detail-value'; div.contentEditable = 'true';
  div.textContent = value; div.setAttribute('data-original', value);
  div.addEventListener('blur', async () => {
    const newVal = div.textContent.trim(), origVal = div.getAttribute('data-original');
    if (newVal === origVal) return;
    div.classList.add('saving');
    try {
      await patchRecord(recordId, { [fieldName]: newVal }); div.setAttribute('data-original', newVal); div.classList.remove('saving');
      const rec = allRecords.find(r => r.id === recordId); if (rec) rec.fields[fieldName] = newVal;
      flashSaved(div);
    } catch (err) { div.textContent = origVal; div.classList.remove('saving'); flashError(div); toast(`Save failed: ${err.message}`, 'error'); }
  });
  div.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); div.blur(); } });
  df.appendChild(lbl); df.appendChild(div); return df;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function flashSaved(el) { el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1400); }
function flashError(el) { el.classList.add('saveerr'); setTimeout(() => el.classList.remove('saveerr'), 1400); }
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
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function toast(msg, type = 'success') {
  const d = document.createElement('div'); d.className = `toast t${type}`; d.textContent = msg;
  el.toastStack.appendChild(d);
  setTimeout(() => { d.classList.add('tout'); d.addEventListener('animationend', () => d.remove(), { once: true }); }, 4200);
}

// Expose globals needed by inline onclick handlers
window.openContractModal = openContractModal;
window.openContractForContact = openContractForContact;
window.resendContract = resendContract;
window.printContractById = printContractById;
window.deleteContract = deleteContract;
window.openLocationModal = openLocationModal;
window.deleteLocation = deleteLocation;

/* ═══════════════════════════════════════════════════════════════
   HUB NAVIGATION
═══════════════════════════════════════════════════════════════ */
const HUB_LABELS = {
  applications: 'CASTING PORTAL',
  email:        'EMAIL HUB',
  contracts:    'CONTRACTS HUB',
  contacts:     'CONTACTS DATABASE',
  locations:    'LOCATION TRACKER',
  timeline:     'PRODUCTION TIMELINE',
  admin:        'ADMIN PANEL',
};

function initHubs() {
  document.querySelectorAll('.hub-btn').forEach(btn => {
    btn.addEventListener('click', () => switchHub(btn.dataset.hub));
  });

  // Show admin tab only for zaria
  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el2 => el2.classList.remove('hidden'));
    initAdminPanel();
  }
  initProductionLocks();

  // Email hub quick-send
  const qSend = document.getElementById('qSendBtn');
  if (qSend) qSend.addEventListener('click', sendQuickEmail);

  // Sync inline contacts search
  const cs = document.getElementById('contactsSearch');
  if (cs) cs.addEventListener('input', () => renderContacts(cs.value.trim().toLowerCase()));

  // Location search
  const ls = document.getElementById('locationSearch');
  if (ls) ls.addEventListener('input', () => renderLocations(ls.value.trim().toLowerCase()));
}

function switchHub(hub) {
  document.querySelectorAll('.hub-btn').forEach(b => b.classList.toggle('active', b.dataset.hub === hub));
  document.querySelectorAll('.hub-panel').forEach(p => p.classList.toggle('active', p.id === `hub-${hub}`));
  const lbl = document.getElementById('activeHubLabel');
  if (lbl) lbl.textContent = HUB_LABELS[hub] || 'CASTING PORTAL';
  // Load content on hub switch
  if (hub === 'email')     renderEmailArchive();
  if (hub === 'contacts')  renderContacts();
  if (hub === 'locations') renderLocations();
  if (hub === 'contracts') renderContracts();
  if (hub === 'timeline' && !tlRecords.length) loadTimeline();
  if (hub === 'timeline') {
    if (el.timelineRefresh) el.timelineRefresh.onclick = loadTimeline;
    if (el.calToggleBtn) el.calToggleBtn.onclick = () => {
      const hidden = el.calendarWrap.classList.toggle('hidden');
      el.calToggleBtn.style.color = hidden ? '' : 'var(--gold)';
      if (!hidden) renderCalendar();
    };
  }
  if (hub === 'admin' && isAdmin) { renderAdminUsers(); initProductionLocks(); }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN PANEL
═══════════════════════════════════════════════════════════════ */
const LOCKED_ADMIN = { zaria: { password: 'bleuskm2026', role: 'Admin' } };

function loadAdminUsers() {
  try {
    const s = JSON.parse(localStorage.getItem('bleuskm_crew') || '{}');
    if (!s.__seeded) {
      s.ceion  = s.ceion  || { password: 'bleuskmcrew', role: 'Producer' };
      s.carmen = s.carmen || { password: 'bleuskmcrew', role: 'Producer' };
      s.__seeded = true;
      localStorage.setItem('bleuskm_crew', JSON.stringify(s));
    }
    return s;
  } catch { return {}; }
}

function saveAdminUsers(users) { localStorage.setItem('bleuskm_crew', JSON.stringify(users)); }

function initAdminPanel() {
  renderAdminUsers();
  const addBtn = document.getElementById('adminAddUserBtn');
  if (addBtn) addBtn.addEventListener('click', addAdminUser);
}

function renderAdminUsers() {
  const list = document.getElementById('adminUserList');
  if (!list) return;
  list.innerHTML = '';
  const stored = loadAdminUsers();

  // Locked row
  const zariaRow = document.createElement('div');
  zariaRow.className = 'admin-user-row';
  zariaRow.innerHTML = `<div class="admin-user-info"><span class="admin-uname">zaria</span><span class="admin-urole">Admin</span></div><span class="admin-ulocked">locked</span>`;
  list.appendChild(zariaRow);

  // Editable rows
  Object.entries(stored).forEach(([username, data]) => {
    if (username === '__seeded') return;
    const wrapper = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'admin-user-row';
    row.innerHTML = `
      <div class="admin-user-info">
        <span class="admin-uname">${esc(username)}</span>
        <span class="admin-urole">${esc(data.role || 'Crew')}</span>
      </div>
      <div class="admin-user-actions">
        <button class="contact-action-btn edit-toggle">&#9998; Edit</button>
        <button class="contact-action-btn" style="color:var(--err);" data-del="${esc(username)}">&#10005; Remove</button>
      </div>`;

    const editRow = document.createElement('div');
    editRow.className = 'admin-edit-row';
    editRow.innerHTML = `
      <input type="text" class="modal-input er-uname" value="${esc(username)}" placeholder="Username" style="max-width:140px;" />
      <input type="password" class="modal-input er-pass" value="" placeholder="New password (blank = keep)" style="max-width:180px;" />
      <select class="modal-input er-role" style="max-width:130px;">
        ${['Producer','Director','Crew','PA'].map(r => `<option value="${r}" ${data.role===r?'selected':''}>${r}</option>`).join('')}
      </select>
      <button class="modal-save er-save" style="padding:7px 14px;">Save</button>`;

    row.querySelector('.edit-toggle').addEventListener('click', () => editRow.classList.toggle('open'));

    row.querySelector('[data-del]').addEventListener('click', () => {
      if (!confirm(`Remove ${username}?`)) return;
      const u = loadAdminUsers(); delete u[username]; saveAdminUsers(u);
      showAdminMsg(`${username} removed.`); renderAdminUsers();
    });

    editRow.querySelector('.er-save').addEventListener('click', () => {
      const newU = editRow.querySelector('.er-uname').value.trim().toLowerCase();
      const newP = editRow.querySelector('.er-pass').value.trim();
      const newR = editRow.querySelector('.er-role').value;
      if (!newU) { showAdminMsg('Username required.', true); return; }
      const u = loadAdminUsers();
      if (newU !== username) {
        if (u[newU] || LOCKED_ADMIN[newU]) { showAdminMsg('Username taken.', true); return; }
        delete u[username];
      }
      u[newU] = { password: newP || data.password, role: newR };
      saveAdminUsers(u); showAdminMsg(`${newU} updated.`); renderAdminUsers();
    });

    wrapper.appendChild(row); wrapper.appendChild(editRow); list.appendChild(wrapper);
  });
}

function addAdminUser() {
  const u = (document.getElementById('adminNewUser').value || '').trim().toLowerCase();
  const p = (document.getElementById('adminNewPass').value || '').trim();
  const r = document.getElementById('adminNewRole').value;
  if (!u || !p) { showAdminMsg('Fill in username and password.', true); return; }
  const users = loadAdminUsers();
  if (users[u] || LOCKED_ADMIN[u]) { showAdminMsg('Username already exists.', true); return; }
  users[u] = { password: p, role: r };
  saveAdminUsers(users);
  document.getElementById('adminNewUser').value = '';
  document.getElementById('adminNewPass').value = '';
  showAdminMsg(`${u} added as ${r}.`); renderAdminUsers();
}

function showAdminMsg(msg, isErr = false) {
  const el2 = document.getElementById('adminMsg');
  if (!el2) return;
  el2.textContent = msg;
  el2.className = `admin-msg ${isErr ? 'err' : 'ok'}`;
  setTimeout(() => { el2.textContent = ''; }, 3000);
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCTION LOCKS (Admin only)
═══════════════════════════════════════════════════════════════ */
const PRODUCTIONS = [
  'The Final Hand','Overstood','Love me like this','Liminal County',
  'Of blood and dominion','As Is','The 15th Hour','Book of Beginnings',
];

function loadLocks() {
  try { return JSON.parse(localStorage.getItem('bleuskm_prod_locks') || '{}'); } catch { return {}; }
}
function saveLocks(locks) { localStorage.setItem('bleuskm_prod_locks', JSON.stringify(locks)); }

function initProductionLocks() {
  const grid = document.getElementById('prodLocksGrid');
  if (!grid) return;
  const locks = loadLocks();
  grid.innerHTML = '';
  PRODUCTIONS.forEach(prod => {
    const locked = locks[prod] !== false; // default unlocked
    const card = document.createElement('div');
    card.className = 'prod-lock-card';
    const chkId = `lock_${prod.replace(/\s+/g,'_')}`;
    card.innerHTML = `
      <span class="prod-lock-name">${esc(prod)}</span>
      <label class="lock-toggle" title="${locked ? 'Locked' : 'Unlocked'}">
        <input type="checkbox" id="${chkId}" ${!locked ? 'checked' : ''} />
        <span class="lock-slider"></span>
      </label>`;
    const chk = card.querySelector('input');
    chk.addEventListener('change', () => {
      const l = loadLocks();
      l[prod] = !chk.checked; // checked = unlocked
      saveLocks(l);
      toast(`${prod} ${chk.checked ? 'unlocked' : 'locked'}`, 'success');
    });
    grid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL HUB — quick compose + batch from hub
═══════════════════════════════════════════════════════════════ */
async function sendQuickEmail() {
  const from    = (document.getElementById('qFrom')?.value || '').trim();
  const to      = (document.getElementById('qTo')?.value || '').trim();
  const subject = (document.getElementById('qSubject')?.value || '').trim();
  const body    = (document.getElementById('qBody')?.value || '').trim();
  const btn     = document.getElementById('qSendBtn');
  if (!to || !subject || !body) { toast('Fill in all fields.', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const res = await fetch(CFG.BREVO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: CFG.BREVO_EMAIL, payload: { sender: { name: 'BLEUSKM Studios', email: from }, to: [{ email: to }], subject, textContent: body } }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}`);
    toast(`Sent from ${from} to ${to}`, 'success');
    document.getElementById('qTo').value = '';
    document.getElementById('qSubject').value = '';
    document.getElementById('qBody').value = '';
  } catch (err) { toast(`Failed: ${err.message}`, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Send Email'; }
}

function openBatchFromEmailHub(tid) {
  // Switch to applications hub, pre-set template, show batch bar
  switchHub('applications');
  const sel = document.getElementById('batchTemplateSelect');
  if (sel) sel.value = String(tid);
  toast(`Switched to Applications. Check boxes then send.`, 'success');
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACT TYPES — dynamic clause rendering
═══════════════════════════════════════════════════════════════ */
const CONTRACT_TEMPLATES = {
  crew: {
    title: 'CREW PRODUCTION AGREEMENT',
    party: 'Crew Member',
    clauses: [
      ['PARTIES', 'This Agreement is entered into between <strong>BLEUSKM Studios</strong>, an independent film production company based in Denton, Texas ("Production"), and the individual identified above ("Crew Member"), in connection with the short film production identified as the project above.'],
      ['VOLUNTARY, NON-PAID PARTICIPATION', 'Crew Member acknowledges and agrees that participation in this production is entirely voluntary and unpaid. No compensation, monetary or otherwise, is promised, implied, or expected — now or in the future — in exchange for services rendered. Crew Member agrees to this arrangement knowingly and without coercion.'],
      ['IMDb CREDIT', 'In recognition of their contribution, Crew Member will receive an official IMDb credit for their designated role. Production will make reasonable efforts to submit accurate credits following post-production.'],
      ['MEDIA USAGE RIGHTS', 'Crew Member grants BLEUSKM Studios a perpetual, royalty-free, worldwide license to use footage and materials produced during this production for distribution, festivals, marketing, and archival use. Crew Member may use materials for personal portfolio and self-promotion with attribution to BLEUSKM Studios.'],
      ['LIABILITY WAIVER', 'Crew Member voluntarily assumes all risks associated with participation, including physical activity, travel, and equipment handling. Crew Member releases BLEUSKM Studios and its representatives from any claims, liabilities, or losses arising from participation, to the fullest extent permitted by law.'],
      ['COMMITMENT &amp; AVAILABILITY', 'Crew Member agrees to communicate availability promptly. If confirmed for a shoot day, Crew Member commits to attending unless an emergency arises, with advance notice provided as early as possible.'],
      ['CONFIDENTIALITY', 'Crew Member agrees to keep script details, production materials, and unreleased content confidential until an official BLEUSKM Studios public announcement or release.'],
      ['ELECTRONIC SIGNATURE', 'A typed or drawn electronic signature constitutes a legal and binding signature, equivalent to a handwritten signature under the E-SIGN Act and UETA. By signing, Crew Member confirms they have read, understood, and voluntarily agreed to all terms.'],
      ['GOVERNING LAW', 'This Agreement is governed by the laws of the State of Texas. Disputes shall be resolved in Denton County, Texas.'],
    ],
  },
  cast: {
    title: 'CAST / PERFORMER AGREEMENT',
    party: 'Performer',
    clauses: [
      ['PARTIES', 'This Agreement is entered into between <strong>BLEUSKM Studios</strong> ("Production") and the Performer identified above, in connection with the short film production identified as the project above.'],
      ['ROLE &amp; PERFORMANCE', 'Performer agrees to portray the role specified above in the production. Performer will be available for all scheduled rehearsals, shoot days, and reshoots as reasonably required by Production.'],
      ['VOLUNTARY, NON-PAID PARTICIPATION', 'Performer acknowledges participation is entirely voluntary and unpaid. No compensation is promised in exchange for services. Performer agrees to this arrangement knowingly and without coercion.'],
      ['IMDb CREDIT', 'Performer will receive an official IMDb acting credit for their role. Production will submit accurate credits following post-production completion.'],
      ['LIKENESS &amp; MEDIA RIGHTS', 'Performer grants BLEUSKM Studios a perpetual, royalty-free, worldwide license to use their performance, voice, likeness, and image captured during production for distribution, festival submissions, marketing, social media, and archival use in connection with this project.'],
      ['TALENT RELEASE', 'Performer hereby releases BLEUSKM Studios from any claims related to the use of their likeness, performance, or image as permitted under this Agreement.'],
      ['LIABILITY WAIVER', 'Performer voluntarily assumes all risks of participation including physical activity on set, and releases BLEUSKM Studios and its representatives from any claims or liabilities arising from participation.'],
      ['CONFIDENTIALITY', 'Performer agrees to keep script content, production materials, and unreleased footage confidential until official public release by BLEUSKM Studios.'],
      ['ELECTRONIC SIGNATURE', 'A typed or drawn electronic signature constitutes a legal and binding signature under the E-SIGN Act and UETA. By signing, Performer confirms they have read, understood, and agreed to all terms.'],
      ['GOVERNING LAW', 'This Agreement is governed by the laws of the State of Texas. Disputes shall be resolved in Denton County, Texas.'],
    ],
  },
  location: {
    title: 'LOCATION AGREEMENT',
    party: 'Location Owner',
    clauses: [
      ['PARTIES', 'This Location Agreement is entered into between <strong>BLEUSKM Studios</strong> ("Production") and the Location Owner/Manager identified above ("Owner"), for the use of the location specified above.'],
      ['GRANT OF LICENSE', 'Owner grants Production a non-exclusive license to use the location on the agreed shoot dates for the purposes of filming, photographing, and recording scenes for the above-named production.'],
      ['SHOOT DATES &amp; HOURS', 'Production agrees to occupy the location only during mutually agreed-upon dates and hours. Any extension must be approved by Owner in advance.'],
      ['COMPENSATION', 'The terms of any compensation, if applicable, are as agreed separately. If no compensation is specified, this license is granted on a voluntary basis.'],
      ['RESTORATION', 'Production agrees to leave the location in substantially the same condition as found. Production is responsible for any damages caused directly by crew or equipment during filming.'],
      ['MEDIA USAGE', 'Owner grants Production the right to use footage, photographs, and recordings of the location in the final film and all related promotional, festival, and distribution materials, in perpetuity worldwide.'],
      ['LIABILITY', 'Production agrees to carry appropriate liability coverage for the shoot period and to indemnify Owner against claims arising from Production\'s negligence on the property.'],
      ['CANCELLATION', 'Either party may cancel with reasonable advance notice. Production will make reasonable efforts to accommodate alternative arrangements.'],
      ['ELECTRONIC SIGNATURE', 'A typed or drawn electronic signature constitutes a legal and binding signature under the E-SIGN Act and UETA. By signing, Owner confirms they have read, understood, and agreed to all terms.'],
      ['GOVERNING LAW', 'This Agreement is governed by the laws of the State of Texas. Disputes shall be resolved in Denton County, Texas.'],
    ],
  },
  talent_release: {
    title: 'TALENT / ACTOR RELEASE FORM',
    party: 'Talent',
    clauses: [
      ['PARTIES', 'This Talent Release is entered into between <strong>BLEUSKM Studios</strong> ("Production") and the individual identified above ("Talent").'],
      ['GRANT OF RIGHTS', 'Talent hereby grants Production the irrevocable right to photograph, film, record, and otherwise capture their appearance, voice, likeness, and performance in connection with the above-named project.'],
      ['USAGE', 'Production may use, reproduce, distribute, exhibit, and create derivative works from any recordings of Talent in connection with the project, including for distribution, festival submissions, marketing, press, and social media, in perpetuity, worldwide, in all media now known or hereafter developed.'],
      ['COMPENSATION', 'Talent agrees that participation is voluntary and may be uncompensated except as separately agreed. Talent waives any right to additional compensation for uses permitted herein.'],
      ['WAIVER OF CLAIMS', 'Talent waives any right to review, approve, or object to how their likeness or performance is used in connection with this production, and releases Production from any and all claims arising from such use.'],
      ['MINOR CONSENT', 'If Talent is under 18 years of age, a parent or legal guardian must also sign this release on their behalf.'],
      ['ELECTRONIC SIGNATURE', 'A typed or drawn electronic signature constitutes a legal and binding signature under the E-SIGN Act and UETA. By signing, Talent confirms they have read, understood, and agreed to all terms.'],
      ['GOVERNING LAW', 'This Agreement is governed by the laws of the State of Texas.'],
    ],
  },
  background: {
    title: 'BACKGROUND ACTOR / EXTRA RELEASE',
    party: 'Background Actor',
    clauses: [
      ['PARTIES', 'This Background Actor Release is entered into between <strong>BLEUSKM Studios</strong> ("Production") and the individual identified above ("Background Actor").'],
      ['ROLE', 'Background Actor agrees to appear as a non-speaking background performer in the above-named production on the agreed shoot date(s).'],
      ['GRANT OF RIGHTS', 'Background Actor grants Production the irrevocable, perpetual, worldwide right to use their appearance and likeness captured during filming for any purpose related to this production, including distribution, marketing, and promotional materials.'],
      ['COMPENSATION', 'Background Actor acknowledges participation is voluntary. No compensation, monetary or otherwise, is promised unless separately agreed in writing.'],
      ['WAIVER', 'Background Actor waives any right to compensation, approval, or credit for their appearance in the production, and releases Production from any claims arising from such appearance.'],
      ['ELECTRONIC SIGNATURE', 'A typed or drawn electronic signature constitutes a legal and binding signature under the E-SIGN Act and UETA. By signing, Background Actor confirms they have read, understood, and agreed to all terms.'],
      ['GOVERNING LAW', 'This Agreement is governed by the laws of the State of Texas.'],
    ],
  },
  composer: {
    title: 'COMPOSER / MUSIC RELEASE',
    party: 'Composer',
    clauses: [
      ['PARTIES', 'This Composer Release is entered into between <strong>BLEUSKM Studios</strong> ("Production") and the Composer identified above.'],
      ['COMPOSITION &amp; DELIVERY', 'Composer agrees to create and deliver original musical compositions and/or recordings for use in the above-named production as mutually agreed.'],
      ['GRANT OF RIGHTS', 'Composer grants Production a perpetual, royalty-free, worldwide license to synchronize, reproduce, distribute, and publicly perform the compositions in connection with the production, including in the final film, trailers, promotional materials, streaming, broadcast, and distribution.'],
      ['OWNERSHIP &amp; CREDIT', 'Composer retains ownership of the underlying musical compositions. Production retains the synchronization license granted herein. Composer will receive appropriate music credit in the film.'],
      ['COMPENSATION', 'Compensation, if any, is as separately agreed. If no compensation is specified, this license is granted voluntarily.'],
      ['WARRANTIES', 'Composer warrants that the compositions are original works, do not infringe any third-party rights, and that Composer has the full right to grant the licenses herein.'],
      ['ELECTRONIC SIGNATURE', 'A typed or drawn electronic signature constitutes a legal and binding signature under the E-SIGN Act and UETA. By signing, Composer confirms they have read, understood, and agreed to all terms.'],
      ['GOVERNING LAW', 'This Agreement is governed by the laws of the State of Texas.'],
    ],
  },
  custom: {
    title: 'CUSTOM AGREEMENT',
    party: 'Party',
    clauses: [
      ['PARTIES', 'This Agreement is entered into between <strong>BLEUSKM Studios</strong> ("Production") and the individual identified above.'],
    ],
  },
};

function renderContractBody(type) {
  const body = document.getElementById('contractBody');
  if (!body) return;
  const tmpl = CONTRACT_TEMPLATES[type] || CONTRACT_TEMPLATES.crew;
  const isCustom = type === 'custom';

  let html = `
    <div class="cmodal-section-header">
      <span class="cmodal-section-eyebrow">SHORT FILM PRODUCTION AGREEMENT</span>
      <h2 class="cmodal-section-title">BLEUSKM Studios</h2>
      <p class="cmodal-section-sub">BLEUSKM Studios &nbsp;&middot;&nbsp; Denton, TX &nbsp;&middot;&nbsp; 2026</p>
    </div>`;

  tmpl.clauses.forEach((clause, i) => {
    const isLast = i === tmpl.clauses.length - 1 && !isCustom;
    html += `<div class="cmodal-clause" ${isLast?'style="border-bottom:none;margin-bottom:0;padding-bottom:0;"':''}>
      <span class="cmodal-clause-num">${i+1}</span>
      <div class="cmodal-clause-body">
        <p class="cmodal-clause-title">${clause[0]}</p>
        <p class="cmodal-clause-text">${clause[1]}</p>
      </div>
    </div>`;
  });

  html += `<div class="cmodal-addl-section">
    <p class="modal-label" style="margin-bottom:8px;">ADDITIONAL TERMS${isCustom?' / FULL AGREEMENT TEXT':' (optional)'}</p>
    <textarea class="modal-input" id="contractTerms" rows="${isCustom?14:4}" placeholder="${isCustom?'Write the full custom agreement here...':'Add shoot dates, specific obligations, compensation details, or any additional terms...'}"></textarea>
  </div>
  <div class="cmodal-sig-section">
    <p class="cmodal-clause-title" style="margin-bottom:14px;">SIGNATURE</p>
    <div class="sig-tabs" style="margin-bottom:14px;">
      <button class="sig-tab active" id="sigTypeTab">Type</button>
      <button class="sig-tab" id="sigDrawTab">Draw</button>
    </div>
    <div id="sigTypeArea">
      <input class="modal-input sig-type-input" id="sigTypeInput" type="text" placeholder="Type your full name to sign" autocomplete="off" />
    </div>
    <div class="hidden" id="sigDrawArea">
      <canvas id="sigCanvas" class="sig-canvas" width="560" height="120"></canvas>
      <button class="icon-btn" id="sigClearBtn" style="margin-top:6px;">Clear</button>
    </div>
    <div class="cmodal-date-row">
      <span class="modal-label">DATE</span>
      <span id="contractDateSigned" style="font-size:12px;color:var(--muted);"></span>
    </div>
  </div>`;

  body.innerHTML = html;
  setContractDate();
  // Re-bind sig canvas after re-render
  sigCtx = null;
  const newTypeTab = document.getElementById('sigTypeTab');
  const newDrawTab = document.getElementById('sigDrawTab');
  const newTypeArea = document.getElementById('sigTypeArea');
  const newDrawArea = document.getElementById('sigDrawArea');
  const newClearBtn = document.getElementById('sigClearBtn');
  if (newTypeTab) newTypeTab.addEventListener('click', () => { newTypeTab.classList.add('active'); newDrawTab.classList.remove('active'); newTypeArea.classList.remove('hidden'); newDrawArea.classList.add('hidden'); });
  if (newDrawTab) newDrawTab.addEventListener('click', () => { newDrawTab.classList.add('active'); newTypeTab.classList.remove('active'); newDrawArea.classList.remove('hidden'); newTypeArea.classList.add('hidden'); initSigCanvas(); });
  if (newClearBtn) newClearBtn.addEventListener('click', () => { if (sigCtx) sigCtx.clearRect(0, 0, document.getElementById('sigCanvas')?.width || 560, document.getElementById('sigCanvas')?.height || 120); });
}
