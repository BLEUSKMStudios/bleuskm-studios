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
  // contacts
  contactsPanelToggle: document.getElementById('contactsPanelToggle'),
  contactsBody:    document.getElementById('contactsBody'),
  contactsArrow:   document.getElementById('contactsArrow'),
  contactsCounts:  document.getElementById('contactsCounts'),
  contactsGrid:    document.getElementById('contactsGrid'),
  contactsSearch:  document.getElementById('contactsSearch'),
  // contracts
  contractsPanelToggle: document.getElementById('contractsPanelToggle'),
  contractsBody:   document.getElementById('contractsBody'),
  contractsArrow:  document.getElementById('contractsArrow'),
  contractCounts:  document.getElementById('contractCounts'),
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
  contractTerms:   document.getElementById('contractTerms'),
  contractSaveBtn: document.getElementById('contractSaveBtn'),
  contractPrintBtn:document.getElementById('contractPrintBtn'),
  sigTypeTab:      document.getElementById('sigTypeTab'),
  sigDrawTab:      document.getElementById('sigDrawTab'),
  sigTypeArea:     document.getElementById('sigTypeArea'),
  sigDrawArea:     document.getElementById('sigDrawArea'),
  sigTypeInput:    document.getElementById('sigTypeInput'),
  sigCanvas:       document.getElementById('sigCanvas'),
  sigClearBtn:     document.getElementById('sigClearBtn'),
  // location
  locationPanelToggle: document.getElementById('locationPanelToggle'),
  locationBody:    document.getElementById('locationBody'),
  locationArrow:   document.getElementById('locationArrow'),
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
});

/* ═══════════════════════════════════════════════════════════════
   AIRTABLE
═══════════════════════════════════════════════════════════════ */
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
    crewRecords = (data.records || []).filter(r =>
      (r.fields['Name'] || '').trim() && (r.fields['Email'] || '').trim()
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
  // Open by default
  el.contactsBody.classList.remove('hidden');
  el.contactsArrow.style.transform = 'rotate(90deg)';

  el.contactsPanelToggle.addEventListener('click', () => {
    const hidden = el.contactsBody.classList.toggle('hidden');
    el.contactsArrow.style.transform = hidden ? '' : 'rotate(90deg)';
  });
  el.contactsSearch.addEventListener('input', () =>
    renderContacts(el.contactsSearch.value.trim().toLowerCase())
  );
}

function renderContacts(query = '') {
  const coreCrewContacts  = crewRecords.filter(r => (r.fields['Status'] || '').trim() === 'Core');
  const otherCrewContacts = crewRecords.filter(r => (r.fields['Status'] || '').trim() !== 'Core');
  const castContacts      = allRecords.filter(r => (r.fields['Email'] || '').trim());

  el.contactsCounts.textContent = `${crewRecords.length} crew · ${castContacts.length} cast`;

  function filtered(arr, keys) {
    if (!query) return arr;
    return arr.filter(r => keys.some(k => (r.fields[k] || '').toLowerCase().includes(query)));
  }

  const filteredCore  = filtered(coreCrewContacts,  ['Name','Email','Phone','Role']);
  const filteredOther = filtered(otherCrewContacts, ['Name','Email','Phone','Role']);
  const filteredCast  = filtered(castContacts, ['Name','Email','Location','Role']);

  if (!filteredCore.length && !filteredOther.length && !filteredCast.length) {
    el.contactsGrid.innerHTML = `<p style="font-size:10px;color:var(--muted);padding:16px 0;">No contacts match.</p>`;
    return;
  }

  el.contactsGrid.innerHTML = '';

  if (filteredCore.length) {
    const hdr = document.createElement('div');
    hdr.className = 'contacts-section-label'; hdr.textContent = 'CORE CREW';
    el.contactsGrid.appendChild(hdr);
    filteredCore.forEach(r => {
      const f = r.fields;
      el.contactsGrid.appendChild(makeContactCard(f['Name']||'—', f['Email']||'', f['Phone']||f['Location']||'', f['Role']||'', 'crew'));
    });
  }

  if (filteredOther.length) {
    const hdr = document.createElement('div');
    hdr.className = 'contacts-section-label'; hdr.textContent = 'ALL CREW';
    el.contactsGrid.appendChild(hdr);
    filteredOther.forEach(r => {
      const f = r.fields;
      el.contactsGrid.appendChild(makeContactCard(f['Name']||'—', f['Email']||'', f['Phone']||f['Location']||'', f['Role']||'', 'crew'));
    });
  }

  if (filteredCast.length) {
    const hdr = document.createElement('div');
    hdr.className = 'contacts-section-label'; hdr.textContent = 'CASTING SUBMISSIONS';
    el.contactsGrid.appendChild(hdr);
    filteredCast.forEach(r => {
      const f = r.fields;
      const statusLabel = f['Casting Status'] ? ` · ${f['Casting Status']}` : '';
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
  el.contractsPanelToggle.addEventListener('click', e => {
    if (e.target.closest('button') && e.target.closest('button').id === 'newContractBtn') return;
    const hidden = el.contractsBody.classList.toggle('hidden');
    el.contractsArrow.style.transform = hidden ? '' : 'rotate(90deg)';
  });
  el.newContractBtn.addEventListener('click', e => { e.stopPropagation(); openContractModal(); });

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
  el.contractModalTitle.textContent = existingId ? 'EDIT CONTRACT' : 'PRODUCTION AGREEMENT';
  setContractDate();

  if (existingId) {
    const c = contracts.find(x => x.id === existingId);
    if (c) {
      el.contractType.value  = c.type;
      el.contractFilm.value  = c.film;
      el.contractName.value  = c.name;
      el.contractEmail.value = c.email;
      el.contractRole.value  = c.role;
      el.contractTerms.value = c.terms;
      el.sigTypeInput.value  = c.signature || '';
    }
  } else {
    el.contractType.value = 'cast';
    el.contractFilm.value = 'The Final Hand';
    el.contractName.value = el.contractEmail.value = el.contractRole.value = el.contractTerms.value = '';
    el.sigTypeInput.value = '';
    if (sigCtx) sigCtx.clearRect(0, 0, el.sigCanvas.width, el.sigCanvas.height);
  }
  el.contractModal.classList.remove('hidden');
}

function openContractForContact(name, email, role, type) {
  el.contractsBody.classList.remove('hidden');
  el.contractsArrow.style.transform = 'rotate(90deg)';
  editingContractId = null;
  el.contractModalTitle.textContent = 'New Contract';
  el.contractType.value  = type === 'cast' ? 'cast' : 'crew';
  el.contractFilm.value  = 'The Final Hand';
  el.contractName.value  = name;
  el.contractEmail.value = email;
  el.contractRole.value  = role;
  el.contractTerms.value = '';
  el.sigTypeInput.value  = '';
  if (sigCtx) sigCtx.clearRect(0, 0, el.sigCanvas.width, el.sigCanvas.height);
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
  if (!el.sigTypeTab.classList.contains('active')) {
    // Draw mode — get canvas data
    if (!sigCtx) return '';
    const blank = document.createElement('canvas');
    blank.width = el.sigCanvas.width; blank.height = el.sigCanvas.height;
    return el.sigCanvas.toDataURL() === blank.toDataURL() ? '' : el.sigCanvas.toDataURL();
  }
  return el.sigTypeInput.value.trim();
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
  el.contractCounts.textContent = `${contracts.length} total · ${filtered.length} shown`;

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
  el.sigTypeTab.addEventListener('click', () => {
    el.sigTypeTab.classList.add('active'); el.sigDrawTab.classList.remove('active');
    el.sigTypeArea.classList.remove('hidden'); el.sigDrawArea.classList.add('hidden');
  });
  el.sigDrawTab.addEventListener('click', () => {
    el.sigDrawTab.classList.add('active'); el.sigTypeTab.classList.remove('active');
    el.sigDrawArea.classList.remove('hidden'); el.sigTypeArea.classList.add('hidden');
    initSigCanvas();
  });
  el.sigClearBtn.addEventListener('click', () => {
    if (sigCtx) sigCtx.clearRect(0, 0, el.sigCanvas.width, el.sigCanvas.height);
  });
}

function initSigCanvas() {
  if (sigCtx) return;
  sigCtx = el.sigCanvas.getContext('2d');
  sigCtx.strokeStyle = '#DAAF37';
  sigCtx.lineWidth   = 2;
  sigCtx.lineCap     = 'round';
  sigCtx.lineJoin    = 'round';

  function getPos(e) {
    const rect = el.sigCanvas.getBoundingClientRect();
    const scaleX = el.sigCanvas.width / rect.width;
    const scaleY = el.sigCanvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }
  el.sigCanvas.addEventListener('mousedown', e => { sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
  el.sigCanvas.addEventListener('mousemove', e => { if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
  el.sigCanvas.addEventListener('mouseup',   () => sigDrawing = false);
  el.sigCanvas.addEventListener('mouseleave',() => sigDrawing = false);
  el.sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }, { passive: false });
  el.sigCanvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }, { passive: false });
  el.sigCanvas.addEventListener('touchend',   () => sigDrawing = false);
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
  el.locationPanelToggle.addEventListener('click', e => {
    if (e.target.closest('button') && e.target.closest('button').id === 'addLocationBtn') return;
    const hidden = el.locationBody.classList.toggle('hidden');
    el.locationArrow.style.transform = hidden ? '' : 'rotate(90deg)';
  });
  el.addLocationBtn.addEventListener('click', e => { e.stopPropagation(); openLocationModal(); });
  el.locationSearch.addEventListener('input', () => renderLocations(el.locationSearch.value.trim().toLowerCase()));
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
      el.contractsBody.classList.remove('hidden');
      el.contractsArrow.style.transform = 'rotate(90deg)';
      document.querySelectorAll('.contracts-tab').forEach(t => { t.classList.toggle('active', t.dataset.tab === 'location'); });
      activeContractTab = 'location';
      openContractForContact(loc.contact || loc.name, '', loc.name, 'location');
      el.contractType.value = 'location';
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
  el.tlModalPhase.textContent = f['Phase'] || 'Phase';
  el.tlModalId.value    = record.id;
  el.tlPhaseInput.value = f['Phase']       || '';
  el.tlStartInput.value = f['Start Date']  || '';
  el.tlEndInput.value   = f['End Date']    || '';
  el.tlStatusInput.value= f['Status']      || 'Upcoming';
  el.tlDescInput.value  = f['Description'] || '';
  el.tlModal.classList.remove('hidden');
}

function bindTimelineModal() {
  el.tlModalCancel.addEventListener('click', () => el.tlModal.classList.add('hidden'));
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
  el.modalSend.addEventListener('click', () => el.redirectModal.classList.add('hidden'));
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
