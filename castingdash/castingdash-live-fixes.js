(function () {
  const AIRTABLE = '/.netlify/functions/airtable-proxy';
  const BREVO = '/.netlify/functions/brevo-proxy';
  const PROJECT = 'The Final Hand';
  const DEADLINE = 'June 20th, 2026';
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => [...document.querySelectorAll(sel)];
  const txt = (value) => {
    if (Array.isArray(value)) return value.map(txt).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
    return String(value ?? '').trim();
  };
  const esc = (value) => txt(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  const AGREEMENTS = {
    cast: [
      ['cast', 'Cast Agreement', 'Speaking roles, leads, and supporting cast.', 'cast', ''],
      ['talent_release', 'Talent Release', 'Background actors, extras, and anyone on camera without a full contract.', 'talent_release', ''],
      ['actor_deal_memo', 'Actor Deal Memo', 'Quick booking confirmation before a full contract.', 'custom', 'Actor Deal Memo: This short-form memo confirms booking basics for the performer, including production, role, expected schedule, communication duties, and that a full agreement may follow.'],
      ['self_tape', 'Self-Tape Agreement', 'Audition footage permission for callbacks and self tapes.', 'custom', 'Self-Tape Agreement: Performer grants BLEUSKM Studios permission to receive, review, store, and internally share audition or self-tape footage for casting decisions related to this production.']
    ],
    crew: [
      ['crew', 'Crew Agreement', 'Confirmed on-set crew.', 'crew', ''],
      ['contractor', 'Contractor Agreement', 'Remote roles, freelancers, and non-set collaborators.', 'custom', 'Independent Contractor Agreement: Contractor provides agreed services as an independent contractor and grants BLEUSKM Studios rights to use delivered work for the project.']
    ],
    production: [
      ['location', 'Location Release', 'Any filming location.', 'location', ''],
      ['media', 'Media Release (BTS)', 'Behind-the-scenes photography, video, and promo capture.', 'custom', 'Media Release: Contributor grants BLEUSKM Studios permission to use behind-the-scenes photography, video, audio, and related media for promotion, press, social media, festival materials, archival use, and distribution connected to the project.']
    ],
    post: [
      ['editor', 'Editor Agreement', 'Picture editor or post-production editor.', 'custom', 'Editor Agreement: Editor agrees to provide editing services and grants BLEUSKM Studios rights to use edited work, project files, exports, and deliverables.'],
      ['composer', 'Composer Agreement', 'Original music and music-rights clearance.', 'composer', '']
    ]
  };

  async function records(table) {
    try {
      const res = await fetch(`${AIRTABLE}?table=${encodeURIComponent(table)}`);
      return res.ok ? ((await res.json()).records || []) : [];
    } catch {
      return [];
    }
  }

  async function saveRecord(table, fields, id = '') {
    const res = await fetch(AIRTABLE, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { table, id, fields } : { table, fields })
    });
    if (!res.ok) throw new Error('Save failed');
    return res.json();
  }

  async function deleteRecord(table, id) {
    const res = await fetch(AIRTABLE, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id })
    });
    if (!res.ok) throw new Error('Delete failed');
  }

  function installStyles() {
    if ($('castingLiveRepairStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="castingLiveRepairStyles">
      #tableWrap,#contractsList,.old-contract-tabs,#agreementGrid,.agreement-tabs,#hub-email .hub-sub,#hub-email .compose-quickform,.hub-btn[data-hub="admin"],#hub-admin{display:none!important}
      #castingCardsGrid,.contact-section-grid,.repair-contract-grid,.repair-signed-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:10px!important}
      .repair-card,.contact-card,.repair-contract-card,.portal-note{position:relative!important;min-height:122px!important;background:var(--surface2,#111)!important;border:1px solid var(--borderdim,rgba(255,255,255,.08))!important;border-radius:6px!important;padding:14px!important;color:var(--text)!important}
      .repair-card:hover,.contact-card:hover,.repair-contract-card:hover{border-color:rgba(218,175,55,.45)!important}
      .repair-card-main,.repair-contract-card{display:block!important;width:100%!important;background:transparent!important;border:0!important;color:inherit!important;padding:0!important;text-align:left!important;cursor:pointer!important;text-transform:none!important;letter-spacing:0!important}
      .repair-card strong,.contact-card-name,.repair-contract-card strong,.portal-note strong{display:block!important;color:var(--text)!important;font-size:13px!important;line-height:1.25!important;letter-spacing:0!important;text-transform:none!important}
      .repair-card span,.contact-card-detail,.repair-contract-card span,.portal-note p{display:block!important;color:var(--muted)!important;font-size:11px!important;line-height:1.38!important;margin-top:6px!important;letter-spacing:0!important;text-transform:none!important}
      .repair-status{display:inline-block!important;width:max-content!important;max-width:100%!important;color:var(--gold)!important;border:1px solid rgba(218,175,55,.28)!important;padding:4px 6px!important;margin-top:8px!important;font-size:8px!important;line-height:1!important;letter-spacing:.12em!important;text-transform:uppercase!important}
      .repair-actions,.contact-card-actions,.portal-row-actions{display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important;margin-top:10px!important}
      .repair-actions button,.repair-actions select,.contact-card-actions button,.portal-row-actions button,.tc-send-btn,.repair-tab,.tiny-text-btn{appearance:none!important;min-height:0!important;background:transparent!important;border:0!important;border-bottom:1px solid rgba(218,175,55,.45)!important;border-radius:0!important;color:var(--gold)!important;font-family:var(--font,inherit)!important;font-size:9px!important;font-weight:700!important;line-height:1.1!important;letter-spacing:.12em!important;text-transform:uppercase!important;padding:3px 1px!important;cursor:pointer!important}
      .repair-actions select,.repair-batch select{border:1px solid rgba(218,175,55,.35)!important;background:#0b0b0b!important;color:var(--text)!important;padding:6px 8px!important}
      .danger{color:#ff8b8b!important;border-color:rgba(255,139,139,.45)!important}
      .app-check{position:absolute!important;top:9px!important;right:9px!important;width:13px!important;height:13px!important;accent-color:#d9ad31!important}
      .repair-batch{display:flex!important;gap:10px!important;align-items:center!important;flex-wrap:wrap!important;margin:10px 28px 18px!important}
      .repair-batch span,.contacts-section-label{font-size:10px!important;color:var(--muted)!important;text-transform:uppercase!important;letter-spacing:.14em!important}
      .contacts-section-label{grid-column:1/-1!important;margin:10px 0 0!important;color:var(--gold)!important}
      #hub-email .hub-section-label:first-of-type{font-size:0!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important}
      .repair-contract-tabs{display:flex!important;gap:14px!important;flex-wrap:wrap!important;margin:20px 0!important}
      .repair-tab.active{color:var(--gold)!important;border-color:var(--gold)!important}
      .casting-modal{position:fixed!important;inset:0!important;z-index:9999!important;background:rgba(0,0,0,.86)!important;display:flex!important;align-items:flex-start!important;justify-content:center!important;padding:34px 14px!important;overflow:auto!important}
      .casting-modal-card{position:relative!important;width:min(760px,96vw)!important;background:#0d0d0d!important;border:1px solid rgba(218,175,55,.28)!important;padding:22px!important;color:var(--text)!important}
      .casting-modal-close{position:absolute!important;top:8px!important;right:12px!important;background:transparent!important;border:0!important;color:var(--muted)!important;font-size:22px!important;cursor:pointer!important}
      .detail-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))!important;gap:8px!important;margin:14px 0!important}.detail-grid div{border:1px solid var(--borderdim)!important;padding:9px!important;color:var(--muted)!important;font-size:11px!important}.detail-grid small{display:block!important;color:var(--gold)!important;font-size:8px!important;letter-spacing:.12em!important;text-transform:uppercase!important;margin-bottom:4px!important}
      .calendar-day{position:relative!important;min-height:110px!important}.calendar-add{position:absolute!important;right:6px!important;top:6px!important;opacity:0!important}.calendar-day:hover .calendar-add{opacity:1!important}.calendar-pill span{display:block!important;color:var(--muted)!important;font-size:8px!important;margin-top:3px!important}
      .portal-notes-panel{margin-top:28px!important;border-top:1px solid var(--borderdim)!important;padding-top:18px!important}.portal-notes-list{display:grid!important;gap:8px!important;margin-bottom:12px!important}.portal-note-head{display:flex!important;justify-content:space-between!important;gap:12px!important}.portal-note-compose{display:grid!important;gap:8px!important}
    </style>`);
  }

  function castRole(fields) {
    return txt(fields['To Role']) || txt(fields.Role) || txt(fields['Role Interested In']);
  }

  function crewRole(fields) {
    return txt(fields['Preferred role by Director'] || fields['Preferred Role by Director'] || fields.Preferred_role_by_Director) || txt(fields.Role);
  }

  function castStatus(fields) {
    return txt(fields['Casting Status']) || 'Pending';
  }

  function templateFor(fields) {
    const status = castStatus(fields).toLowerCase();
    const selfTape = txt(fields['Self Tape Status']).toLowerCase();
    if (selfTape.includes('selected for final')) return '19';
    if (status === 'callback') return '15';
    if (status === 'pass') return '16';
    if (status === 'redirect') return txt(fields['To Role']) ? '18' : '17';
    return '';
  }

  function contractLink(name, email, role) {
    return `https://bleuskm.com/crew/contract?${new URLSearchParams({
      name: name || '',
      email: email || '',
      role: role || '',
      film: PROJECT
    })}`;
  }

  function installBatchBar() {
    if ($('repairBatchBar')) return;
    const controls = qs('#hub-applications .controls-bar');
    if (!controls) return;
    controls.insertAdjacentHTML('afterend', `<div class="repair-batch" id="repairBatchBar">
      <span id="repairSelectedCount">0 selected</span>
      <select id="repairBatchTemplate">
        <option value="">Choose template</option>
        <option value="15">T15 - Self Tape Invitation</option>
        <option value="16">T16 - Casting Rejection</option>
        <option value="17">T17 - Direct Offer / Redirect</option>
        <option value="18">T18 - Cross Casting / Role</option>
        <option value="19">T19 - Callback + Calendly</option>
      </select>
      <button class="tiny-text-btn" id="repairBatchSend">Send Template</button>
      <button class="tiny-text-btn danger" id="repairBatchClear">Clear</button>
    </div>`);
    $('repairBatchSend').onclick = sendBatch;
    $('repairBatchClear').onclick = () => {
      qsa('.app-check:checked').forEach((box) => { box.checked = false; });
      updateSelectedCount();
    };
  }

  function updateSelectedCount() {
    const count = qsa('.app-check:checked').length;
    if ($('repairSelectedCount')) $('repairSelectedCount').textContent = `${count} selected`;
  }

  async function renderApplications() {
    const wrap = $('tableWrap');
    const main = qs('#hub-applications .dash-main');
    if (!wrap || !main) return;
    wrap.classList.add('hidden');
    installBatchBar();
    let grid = $('castingCardsGrid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'castingCardsGrid';
      main.appendChild(grid);
    }
    const query = txt($('searchInput')?.value).toLowerCase();
    const filter = qs('.filter-btn.active')?.dataset.filter || 'All';
    let rows = await records('Casting Submissions');
    rows = rows.filter((record) => {
      const fields = record.fields || {};
      const status = castStatus(fields);
      const haystack = [fields.Name, fields.Email, castRole(fields), fields.Location, status].map(txt).join(' ').toLowerCase();
      return (filter === 'All' || status === filter) && (!query || haystack.includes(query));
    });
    window.__castRows = rows;
    sendFinalRoundCallbacks(rows);
    grid.innerHTML = rows.map((record) => {
      const fields = record.fields || {};
      const name = txt(fields.Name) || 'Applicant';
      const email = txt(fields.Email);
      const templateId = templateFor(fields);
      return `<article class="repair-card">
        <input class="app-check" type="checkbox" data-id="${esc(record.id)}" aria-label="Select ${esc(name)}">
        <button class="repair-card-main" type="button" data-open-app="${esc(record.id)}">
          <strong>${esc(name)}</strong>
          <span>${esc(castRole(fields) || 'Role not set')}</span>
          <span>${esc(email)}</span>
          <span class="repair-status">${esc(castStatus(fields))}</span>
        </button>
        <div class="repair-actions">
          ${email ? `<button type="button" data-direct-email="${esc(email)}" data-direct-name="${esc(name)}">Email</button>` : ''}
          ${email && templateId ? `<button type="button" data-template-person="${esc(email)}" data-template-id="${esc(templateId)}">Send Email</button>` : ''}
        </div>
      </article>`;
    }).join('') || '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No submissions match.</p>';
    updateSelectedCount();
  }

  function showModal(html) {
    qsa('.casting-modal').forEach((modal) => modal.remove());
    document.body.insertAdjacentHTML('beforeend', `<div class="casting-modal"><div class="casting-modal-card"><button class="casting-modal-close" data-close-repair>&times;</button>${html}</div></div>`);
  }

  function openApplication(id) {
    const record = (window.__castRows || []).find((row) => row.id === id);
    if (!record) return;
    const fields = record.fields || {};
    const keys = ['Name', 'Email', 'Location', 'Role', 'To Role', 'Casting Status', 'Cast Status', 'Self Tape Status', 'Self Tape URL', 'Callback/Redirect', 'Email Sent', 'Notes'];
    const details = keys.map((key) => txt(fields[key]) ? `<div><small>${esc(key)}</small>${key.includes('URL') ? `<a href="${esc(txt(fields[key]))}" target="_blank" rel="noopener">${esc(txt(fields[key]))}</a>` : esc(txt(fields[key]))}</div>` : '').join('');
    const email = txt(fields.Email);
    const name = txt(fields.Name) || 'Applicant';
    const buttons = [['15', 'Self Tape'], ['16', 'Rejection'], ['17', 'Redirect'], ['18', 'Role Offer'], ['19', 'Callback']]
      .map(([id, label]) => `<button type="button" data-template-person="${esc(email)}" data-template-id="${id}">Send ${label}</button>`).join('');
    showModal(`<h2>${esc(name)}</h2><div class="detail-grid">${details}</div><div class="repair-actions">${email ? `<button type="button" data-direct-email="${esc(email)}" data-direct-name="${esc(name)}">Email</button>${buttons}` : ''}</div>`);
  }

  async function sendBrevo(email, templateId, silent = false) {
    if (!email || !templateId) return alert('Choose a recipient and template first.');
    const payload = {
      sender: { email: 'casting@bleuskm.com', name: 'BLEUSKM Studios' },
      to: [{ email }],
      templateId: Number(templateId),
      params: { FILM: PROJECT, FILM_NAME: PROJECT, DEADLINE }
    };
    const res = await fetch(BREVO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://api.brevo.com/v3/smtp/email', payload })
    });
    if (!silent) alert(res.ok ? 'Template sent.' : 'Template send failed.');
    return res.ok;
  }

  async function sendFinalRoundCallbacks(rows) {
    for (const record of rows) {
      const fields = record.fields || {};
      const selected = txt(fields['Self Tape Status']).toLowerCase() === 'selected for final round';
      const scheduled = fields['Callback Scheduled'] === true || txt(fields['Callback Scheduled']).toLowerCase() === 'true';
      const already = txt(fields['Email Sent']).toLowerCase().includes('t19') || txt(fields['Email Sent']).toLowerCase().includes('callback');
      const email = txt(fields.Email);
      if (!selected || scheduled || already || !email) continue;
      if (await sendBrevo(email, '19', true)) {
        await saveRecord('Casting Submissions', { 'Email Sent': 'T19 Final Callback Sent' }, record.id).catch(() => {});
        fields['Email Sent'] = 'T19 Final Callback Sent';
      }
    }
  }

  async function sendBatch() {
    const templateId = $('repairBatchTemplate')?.value;
    const ids = qsa('.app-check:checked').map((box) => box.dataset.id);
    if (!templateId) return alert('Choose a template first.');
    if (!ids.length) return alert('Select at least one application.');
    let sent = 0;
    for (const id of ids) {
      const record = (window.__castRows || []).find((row) => row.id === id);
      const email = txt(record?.fields?.Email);
      if (email && await sendBrevo(email, templateId, true)) sent += 1;
    }
    alert(`${sent} template email${sent === 1 ? '' : 's'} processed.`);
  }

  function openEmail(email = '', name = '') {
    if (typeof window.openComposeModal === 'function') {
      window.openComposeModal(email, name, 'casting@bleuskm.com');
    }
  }

  function cleanEmailHub() {
    const hub = $('hub-email');
    if (!hub) return;
    const label = qsa('#hub-email .hub-section-label').find((node) => node.textContent.toLowerCase().includes('brevo'));
    if (label) label.textContent = '';
    const grid = hub.querySelector('.template-grid');
    if (grid && !grid.querySelector('[data-template-card="15"]')) {
      grid.insertAdjacentHTML('afterbegin', `<div class="template-card" data-template-card="15">
        <div class="tc-num">T15</div>
        <div class="tc-name">Self Tape Invitation</div>
        <div class="tc-desc">Sent to callback applicants selected for self tape.</div>
        <button class="tc-send-btn" data-email-template="15">Compose Direct Email</button>
      </div>`);
    }
    qsa('#hub-email .tc-send-btn').forEach((button) => {
      const templateId = (button.getAttribute('onclick') || '').match(/(\d+)/)?.[1] || button.closest('.template-card')?.querySelector('.tc-num')?.textContent.replace(/\D/g, '') || button.dataset.emailTemplate;
      button.removeAttribute('onclick');
      button.textContent = 'Compose Direct Email';
      button.dataset.emailTemplate = templateId || '';
    });
  }

  async function openTemplateComposer(templateId) {
    const options = (await records('Casting Submissions'))
      .filter((record) => txt(record.fields?.Email))
      .map((record) => `<option value="${esc(txt(record.fields.Email))}">${esc(txt(record.fields.Name) || txt(record.fields.Email))} - ${esc(txt(record.fields.Email))}</option>`)
      .join('');
    showModal(`<h2>Compose Direct Email</h2>
      <p style="font-size:11px;color:var(--muted)">From casting@bleuskm.com using Brevo template T${esc(templateId)}.</p>
      <div class="modal-field"><label class="modal-label">Recipient</label><select class="modal-input" id="templateRecipient"><option value="">Choose one person</option>${options}</select></div>
      <div class="repair-actions"><button type="button" data-send-template-compose="${esc(templateId)}">Send Template</button></div>`);
  }

  function activeContractGroup() {
    return qs('[data-contract-group].active')?.dataset.contractGroup || 'cast';
  }

  function findAgreement(key) {
    return Object.values(AGREEMENTS).flat().find((item) => item[0] === key) || AGREEMENTS.cast[0];
  }

  function installContracts() {
    const panel = $('hub-contracts');
    const oldTabs = panel?.querySelector('.contracts-tabs');
    if (!panel || !oldTabs) return;
    oldTabs.classList.add('old-contract-tabs');
    if (!$('repairContractTabs')) {
      oldTabs.insertAdjacentHTML('afterend', `<div class="repair-contract-tabs" id="repairContractTabs">
        <button class="repair-tab active" type="button" data-contract-group="cast">Cast</button>
        <button class="repair-tab" type="button" data-contract-group="crew">Crew</button>
        <button class="repair-tab" type="button" data-contract-group="production">Production</button>
        <button class="repair-tab" type="button" data-contract-group="post">Post</button>
        <button class="repair-tab" type="button" data-contract-group="signed">Signed</button>
      </div>
      <div class="repair-contract-grid" id="repairContractGrid"></div>
      <div class="repair-signed-grid" id="repairSignedGrid" style="display:none"></div>`);
    }
    qsa('[data-contract-group]').forEach((button) => {
      button.onclick = () => {
        qsa('[data-contract-group]').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        renderContractGroup(button.dataset.contractGroup);
      };
    });
    const newButton = $('newContractBtn');
    if (newButton && !newButton.dataset.repairBound) {
      const clone = newButton.cloneNode(true);
      clone.dataset.repairBound = '1';
      clone.onclick = (event) => {
        event.preventDefault();
        openAgreement((AGREEMENTS[activeContractGroup()] || AGREEMENTS.cast)[0][0]);
      };
      newButton.replaceWith(clone);
    }
    renderContractGroup(activeContractGroup());
    patchContractModal();
  }

  function renderContractGroup(group) {
    const grid = $('repairContractGrid');
    const signed = $('repairSignedGrid');
    if (!grid || !signed) return;
    if (group === 'signed') {
      grid.style.display = 'none';
      signed.style.display = 'grid';
      renderSignedContracts();
      return;
    }
    signed.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = (AGREEMENTS[group] || AGREEMENTS.cast).map((item) => `<button type="button" class="repair-contract-card" data-open-agreement="${esc(item[0])}">
      <strong>${esc(item[1])}</strong>
      <span>${esc(item[2])}</span>
    </button>`).join('');
  }

  function openAgreement(key) {
    const agreement = findAgreement(key);
    if (typeof window.openContractModal === 'function') window.openContractModal();
    else $('contractModal')?.classList.remove('hidden');
    setTimeout(() => {
      const typeSelect = $('contractType');
      if (typeSelect) {
        typeSelect.value = [...typeSelect.options].some((option) => option.value === agreement[3]) ? agreement[3] : 'custom';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setTimeout(() => {
        if ($('contractModalTitle')) $('contractModalTitle').textContent = agreement[1].toUpperCase();
        if ($('contractTerms') && agreement[4]) $('contractTerms').value = agreement[4];
      }, 80);
    }, 80);
  }

  function patchContractModal() {
    const save = $('contractSaveBtn');
    if (!save || save.dataset.repairBound) return;
    save.dataset.repairBound = '1';
    save.insertAdjacentHTML('beforebegin', '<button class="modal-cancel" id="copyDirectContract" type="button">Copy Link</button><button class="modal-cancel" id="sendDirectContract" type="button">Send Link</button>');
    $('copyDirectContract').onclick = async () => {
      const name = txt($('contractName')?.value);
      const email = txt($('contractEmail')?.value);
      const role = txt($('contractRole')?.value);
      if (!name || !email) return alert('Enter a name and email first.');
      await navigator.clipboard?.writeText(contractLink(name, email, role));
      alert('Contract link copied.');
    };
    $('sendDirectContract').onclick = sendContractLink;
  }

  async function sendContractLink() {
    const name = txt($('contractName')?.value);
    const email = txt($('contractEmail')?.value);
    const role = txt($('contractRole')?.value);
    if (!name || !email) return alert('Enter a name and email first.');
    const link = contractLink(name, email, role);
    const payload = {
      sender: { email: 'casting@bleuskm.com', name: 'BLEUSKM Studios' },
      to: [{ email }],
      subject: 'The Final Hand | Agreement Link',
      textContent: `Hi ${name},\n\nYour agreement link is ready:\n${link}\n\nBLEUSKM Studios`,
      htmlContent: `<p>Hi ${esc(name)},</p><p>Your agreement link is ready:</p><p><a href="${esc(link)}">${esc(link)}</a></p><p>BLEUSKM Studios</p>`
    };
    const res = await fetch(BREVO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://api.brevo.com/v3/smtp/email', payload })
    });
    alert(res.ok ? 'Contract link sent.' : 'Could not send contract link.');
  }

  async function renderSignedContracts() {
    const list = $('repairSignedGrid');
    if (!list) return;
    const local = JSON.parse(localStorage.getItem('bleuskm_contracts') || '[]').filter((item) => txt(item.status).toLowerCase() === 'signed' || txt(item.signature));
    const airtable = (await records('Contracts')).map((record) => {
      const fields = record.fields || {};
      return {
        name: txt(fields.Name || fields['Full Name'] || fields.Signer),
        email: txt(fields.Email),
        role: txt(fields.Role || fields.Position),
        type: txt(fields.Type || fields['Agreement Type'] || fields.Contract),
        date: txt(fields['Signed Date'] || fields.Date || fields.Created),
        source: 'Managed by Director'
      };
    });
    const rows = [
      ...local.map((item) => ({ name: item.name, email: item.email, role: item.role, type: item.type, date: item.signedAt || item.created, source: 'Managed by Director' })),
      ...airtable
    ].filter((item) => item.name || item.email || item.type);
    list.innerHTML = rows.length ? rows.map((item) => `<div class="repair-card">
      <strong>${esc(item.name || 'Signed Contract')}</strong>
      <span>${esc(item.type || 'Agreement')}</span>
      <span>${esc(item.role)}</span>
      <span>${esc(item.email)}</span>
      <span class="repair-status">${esc(item.source)}${item.date ? ' - ' + esc(item.date) : ''}</span>
    </div>`).join('') : '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No signed contracts found yet.</p>';
  }

  async function renderContacts() {
    const grid = $('contactsGrid');
    if (!grid) return;
    const title = qs('#hub-contacts .hub-title');
    if (title) title.textContent = 'Contact Directory';
    const query = txt($('contactsSearch')?.value).toLowerCase();
    const [crewRows, castRows] = await Promise.all([records('Crew applications'), records('Casting Submissions')]);
    const coreCrew = crewRows.filter((record) => txt(record.fields?.Status).toLowerCase() === 'core');
    const cast = castRows.filter((record) => {
      const fields = record.fields || {};
      return txt(fields['Cast Status'] || fields['Casting Status']).toLowerCase() === 'confirmed';
    });
    const matches = (record, type) => {
      const fields = record.fields || {};
      const role = type === 'cast' ? castRole(fields) : crewRole(fields);
      return !query || [fields.Name, fields.Email, role].map(txt).join(' ').toLowerCase().includes(query);
    };
    const card = (record, type) => {
      const fields = record.fields || {};
      const name = txt(fields.Name) || 'Contact';
      const email = txt(fields.Email);
      const role = type === 'cast' ? castRole(fields) : crewRole(fields);
      return `<div class="contact-card">
        <div class="contact-card-name">${esc(name)}</div>
        <div class="contact-card-detail">${esc(email)}${role ? `<br><span style="color:var(--golddim);font-size:9px">${esc(role)}</span>` : ''}</div>
        <div class="contact-card-actions">${email ? `<button type="button" data-direct-email="${esc(email)}" data-direct-name="${esc(name)}">Email</button>` : ''}</div>
      </div>`;
    };
    if ($('contactsCounts')) $('contactsCounts').textContent = `${coreCrew.length} crew · ${cast.length} cast`;
    grid.innerHTML = `<div class="contacts-section-label">Cast Members</div>
      <div class="contact-section-grid">${cast.filter((record) => matches(record, 'cast')).map((record) => card(record, 'cast')).join('') || '<p style="font-size:10px;color:var(--muted)">No confirmed cast contacts yet.</p>'}</div>
      <div class="contacts-section-label">Core Crew</div>
      <div class="contact-section-grid">${coreCrew.filter((record) => matches(record, 'crew')).map((record) => card(record, 'crew')).join('') || '<p style="font-size:10px;color:var(--muted)">No core crew contacts found.</p>'}</div>`;
  }

  async function renderNotes() {
    const list = $('portalNotesList');
    if (!list) return;
    const rows = (await records('Portal Notes')).filter((record) => txt(record.fields?.Status || 'Open').toLowerCase() !== 'archived');
    list.innerHTML = rows.map((record) => `<div class="portal-note">
      <div class="portal-note-head">
        <div><strong>${esc(txt(record.fields?.Title) || 'Note')}</strong><small style="font-size:8px;color:var(--gold)">${esc(txt(record.fields?.Author) || 'BLEUSKM')}</small></div>
        <div class="portal-row-actions"><button type="button" data-edit-note="${esc(record.id)}">Edit</button><button type="button" class="danger" data-delete-note="${esc(record.id)}">Delete</button></div>
      </div>
      <p>${esc(txt(record.fields?.Note))}</p>
    </div>`).join('') || '<p style="font-size:10px;color:var(--muted)">No notes yet.</p>';
  }

  function installNotes() {
    const hub = $('hub-timeline');
    if (!hub) return;
    if (!$('portalNotesList')) {
      hub.querySelector('.hub-inner')?.insertAdjacentHTML('beforeend', `<div class="portal-notes-panel">
        <div class="hub-section-label">Production Notes</div>
        <div id="portalNotesList" class="portal-notes-list"></div>
        <div class="portal-note-compose">
          <input class="modal-input" id="portalNoteTitle" placeholder="Note title">
          <textarea class="modal-input" id="portalNoteBody" rows="3" placeholder="Leave a note for the team..."></textarea>
          <button class="modal-save" id="portalNoteSave" type="button">Post Note</button>
        </div>
      </div>`);
    }
    if ($('portalNoteSave') && !$('portalNoteSave').dataset.bound) {
      $('portalNoteSave').dataset.bound = '1';
      $('portalNoteSave').onclick = saveNote;
    }
    renderNotes();
  }

  async function saveNote() {
    const button = $('portalNoteSave');
    const note = txt($('portalNoteBody')?.value);
    if (!note) return alert('Write a note first.');
    await saveRecord('Portal Notes', {
      Title: txt($('portalNoteTitle')?.value) || 'Production Note',
      Production: PROJECT,
      Author: sessionStorage.getItem('bleuskm_user') || localStorage.getItem('bleuskm_user') || 'Zaria',
      Audience: 'All',
      Note: note,
      Status: 'Open'
    }, button?.dataset.editing || '');
    $('portalNoteTitle').value = '';
    $('portalNoteBody').value = '';
    delete button.dataset.editing;
    button.textContent = 'Post Note';
    renderNotes();
  }

  async function editNote(id) {
    const record = (await records('Portal Notes')).find((row) => row.id === id);
    if (!record) return;
    $('portalNoteTitle').value = txt(record.fields?.Title);
    $('portalNoteBody').value = txt(record.fields?.Note);
    $('portalNoteSave').dataset.editing = id;
    $('portalNoteSave').textContent = 'Save Note';
  }

  async function deleteNote(id) {
    if (!confirm('Delete this note for everyone?')) return;
    await deleteRecord('Portal Notes', id);
    renderNotes();
  }

  function iso(date) {
    return date.toISOString().slice(0, 10);
  }

  async function renderCalendar() {
    const wrap = $('calendarWrap');
    const grid = $('calendarGrid');
    if (!wrap || !grid) return;
    wrap.classList.remove('hidden');
    const timelineRows = await records('Production Timeline');
    const callbackRows = (await records('Casting Submissions')).filter((record) => record.fields?.['Callback Scheduled'] === true || txt(record.fields?.['Callback Scheduled']).toLowerCase() === 'true');
    const callbackEvents = callbackRows.map((record) => {
      const fields = record.fields || {};
      const date = txt(fields['Callback Date'] || fields['Callback Meeting Date'] || fields['Meeting Date'] || fields['Meeting Date/Time']);
      return {
        id: record.id,
        callback: true,
        fields: {
          Phase: `Callback: ${txt(fields.Name)}`,
          'Start Date': date,
          Status: 'Callback',
          Description: txt(fields.Email),
          Role: castRole(fields),
          Email: txt(fields.Email),
          Link: txt(fields['Google Meet Link'] || fields['Meeting Link'] || fields['Callback Link'])
        }
      };
    }).filter((record) => txt(record.fields['Start Date']));
    const all = [...timelineRows, ...callbackEvents];
    const first = all.map((record) => txt(record.fields?.['Start Date'])).find(Boolean);
    const base = first ? new Date(`${first}T12:00:00`) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    if ($('calMonthLabel')) $('calMonthLabel').textContent = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<div class="calendar-head">${day}</div>`).join('');
    for (let i = 0; i < 42; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = iso(day);
      const events = all.filter((record) => txt(record.fields?.['Start Date']).slice(0, 10) === key);
      html += `<div class="calendar-day ${day.getMonth() === base.getMonth() ? '' : 'muted'}" data-cal-date="${key}">
        <button class="calendar-add tiny-text-btn" type="button" data-new-event="${key}">+</button>
        <div class="calendar-date">${day.getDate()}</div>
        ${events.map((record) => `<button class="calendar-pill" type="button" data-edit-event="${esc(record.id)}" data-callback="${record.callback ? '1' : ''}">${esc(txt(record.fields?.Phase) || 'Event')}<span>${esc(txt(record.fields?.Status) || 'Upcoming')}</span></button>`).join('')}
      </div>`;
    }
    grid.innerHTML = html;
    window.__timelineRows = timelineRows;
    window.__callbackRows = callbackEvents;
  }

  function openEventModal(record, date = '') {
    const fields = record?.fields || {};
    const isCallback = !!record?.callback;
    const id = isCallback ? '' : record?.id || '';
    showModal(`<h2>${record ? 'Event Details' : 'Add Event'}</h2>
      <div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="evTitle" value="${esc(txt(fields.Phase || fields.Title))}" ${isCallback ? 'readonly' : ''}></div>
      <div class="modal-row"><div class="modal-field"><label class="modal-label">Date</label><input type="date" class="modal-input" id="evStart" value="${esc(txt(fields['Start Date']).slice(0, 10) || date)}" ${isCallback ? 'readonly' : ''}></div><div class="modal-field"><label class="modal-label">Status</label><input class="modal-input" id="evStatus" value="${esc(txt(fields.Status) || 'Upcoming')}" ${isCallback ? 'readonly' : ''}></div></div>
      ${txt(fields.Email) ? `<p style="font-size:11px;color:var(--muted)">Email: ${esc(txt(fields.Email))}</p>` : ''}
      ${txt(fields.Role) ? `<p style="font-size:11px;color:var(--muted)">Role: ${esc(txt(fields.Role))}</p>` : ''}
      ${txt(fields.Link) ? `<p><a href="${esc(txt(fields.Link))}" target="_blank" rel="noopener">Open meeting link</a></p>` : ''}
      <div class="modal-field"><label class="modal-label">Description</label><textarea class="modal-input" id="evDesc" rows="3" ${isCallback ? 'readonly' : ''}>${esc(txt(fields.Description))}</textarea></div>
      <div class="repair-actions">${!isCallback && id ? `<button class="danger" type="button" data-delete-event="${esc(id)}">Delete</button>` : ''}${!isCallback ? `<button type="button" data-save-event="${esc(id)}">Save</button>` : ''}</div>`);
  }

  async function saveEvent(id) {
    await saveRecord('Production Timeline', {
      Phase: txt($('evTitle')?.value) || 'Untitled Event',
      'Start Date': $('evStart')?.value || null,
      Status: txt($('evStatus')?.value) || 'Upcoming',
      Description: txt($('evDesc')?.value)
    }, id);
    qsa('.casting-modal').forEach((modal) => modal.remove());
    renderCalendar();
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    await deleteRecord('Production Timeline', id);
    qsa('.casting-modal').forEach((modal) => modal.remove());
    renderCalendar();
  }

  function installTimeline() {
    installNotes();
    const button = $('calendarToggleBtn');
    if (button && !button.dataset.bound) {
      button.dataset.bound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        renderCalendar();
      }, true);
    }
  }

  function boot() {
    installStyles();
    qsa('.hub-btn[data-hub="admin"]').forEach((button) => button.remove());
    cleanEmailHub();
    installContracts();
    if (qs('#hub-applications.active')) renderApplications();
    if (qs('#hub-contacts.active')) renderContacts();
    if (qs('#hub-timeline.active')) installTimeline();
  }

  document.addEventListener('DOMContentLoaded', () => {
    qsa('.casting-modal').forEach((modal) => modal.remove());
    boot();
    setTimeout(boot, 300);
  });

  document.addEventListener('click', async (event) => {
    const hubButton = event.target.closest('.hub-btn[data-hub]');
    if (hubButton) setTimeout(boot, 120);

    const open = event.target.closest('[data-open-app]');
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      return openApplication(open.dataset.openApp);
    }

    const direct = event.target.closest('[data-direct-email]');
    if (direct) {
      event.preventDefault();
      event.stopPropagation();
      return openEmail(direct.dataset.directEmail, direct.dataset.directName);
    }

    const templatePerson = event.target.closest('[data-template-person]');
    if (templatePerson) {
      event.preventDefault();
      event.stopPropagation();
      return sendBrevo(templatePerson.dataset.templatePerson, templatePerson.dataset.templateId);
    }

    const templateCard = event.target.closest('[data-email-template]');
    if (templateCard) {
      event.preventDefault();
      event.stopPropagation();
      return openTemplateComposer(templateCard.dataset.emailTemplate);
    }

    const sendTemplate = event.target.closest('[data-send-template-compose]');
    if (sendTemplate) {
      event.preventDefault();
      event.stopPropagation();
      return sendBrevo($('templateRecipient')?.value, sendTemplate.dataset.sendTemplateCompose);
    }

    const agreement = event.target.closest('[data-open-agreement]');
    if (agreement) {
      event.preventDefault();
      event.stopPropagation();
      return openAgreement(agreement.dataset.openAgreement);
    }

    const editNoteButton = event.target.closest('[data-edit-note]');
    if (editNoteButton) {
      event.preventDefault();
      event.stopPropagation();
      return editNote(editNoteButton.dataset.editNote);
    }

    const deleteNoteButton = event.target.closest('[data-delete-note]');
    if (deleteNoteButton) {
      event.preventDefault();
      event.stopPropagation();
      return deleteNote(deleteNoteButton.dataset.deleteNote);
    }

    const addEvent = event.target.closest('[data-new-event]');
    if (addEvent) {
      event.preventDefault();
      event.stopPropagation();
      return openEventModal(null, addEvent.dataset.newEvent);
    }

    const editEventButton = event.target.closest('[data-edit-event]');
    if (editEventButton) {
      event.preventDefault();
      event.stopPropagation();
      const record = [...(window.__timelineRows || []), ...(window.__callbackRows || [])].find((row) => row.id === editEventButton.dataset.editEvent);
      return openEventModal(record);
    }

    const saveEventButton = event.target.closest('[data-save-event]');
    if (saveEventButton) {
      event.preventDefault();
      event.stopPropagation();
      return saveEvent(saveEventButton.dataset.saveEvent);
    }

    const deleteEventButton = event.target.closest('[data-delete-event]');
    if (deleteEventButton) {
      event.preventDefault();
      event.stopPropagation();
      return deleteEvent(deleteEventButton.dataset.deleteEvent);
    }

    if (event.target.closest('[data-close-repair]') || event.target.classList?.contains('casting-modal')) {
      event.preventDefault();
      qsa('.casting-modal').forEach((modal) => modal.remove());
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target.classList?.contains('app-check')) updateSelectedCount();
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'searchInput') setTimeout(renderApplications, 120);
    if (event.target?.id === 'contactsSearch') setTimeout(renderContacts, 120);
  }, true);

  setInterval(() => {
    installContracts();
    cleanEmailHub();
  }, 2500);
})();