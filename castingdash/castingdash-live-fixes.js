(function () {
  const AIRTABLE = '/.netlify/functions/airtable-proxy';
  const BREVO = '/.netlify/functions/brevo-proxy';
  const ZOHO = '/.netlify/functions/zoho-mail';
  const PROJECT = 'The Final Hand';
  const DEADLINE = 'June 20th, 2026';
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (value) => {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
    return String(value || '').trim();
  };
  const esc = (value) => text(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const cache = new Map();
  const pending = new Map();

  const agreements = {
    cast: [
      ['cast', 'Cast Agreement', 'Speaking roles, leads, and supporting cast.', 'cast'],
      ['talent_release', 'Talent Release', 'Background actors, extras, and anyone on camera.', 'talent_release'],
      ['actor_deal_memo', 'Actor Deal Memo', 'Quick booking confirmation before a full contract.', 'custom'],
      ['self_tape', 'Self-Tape Agreement', 'Callbacks and audition footage permission.', 'custom']
    ],
    crew: [
      ['crew', 'Crew Agreement', 'Confirmed on-set crew.', 'crew'],
      ['contractor', 'Contractor Agreement', 'Remote roles, freelancers, and non-set collaborators.', 'custom']
    ],
    production: [
      ['location', 'Location Release', 'Any filming location.', 'location'],
      ['media', 'Media Release (BTS)', 'Behind-the-scenes photography, video, and promo capture.', 'custom']
    ],
    post: [
      ['editor', 'Editor Agreement', 'Picture editor or post-production editor.', 'custom'],
      ['composer', 'Composer Agreement', 'Original music and music-rights clearance.', 'composer']
    ]
  };

  const customTerms = {
    actor_deal_memo: 'Actor Deal Memo: This short-form memo confirms booking basics for the performer, including production, role, expected schedule, communication duties, and that a full agreement may follow.',
    self_tape: 'Self-Tape Agreement: Performer grants BLEUSKM Studios permission to receive, review, store, and internally share audition or self-tape footage for casting decisions related to this production.',
    contractor: 'Independent Contractor Agreement: Contractor provides agreed services as an independent contractor and grants BLEUSKM Studios rights to use delivered work for the project.',
    media: 'Media Release: Contributor grants BLEUSKM Studios permission to use behind-the-scenes photography, video, audio, and related media for promotion, press, social media, festival materials, archival use, and distribution connected to the project.',
    editor: 'Editor Agreement: Editor agrees to provide editing services and grants BLEUSKM Studios rights to use edited work, project files, exports, and deliverables.'
  };

  async function records(table) {
    const old = cache.get(table);
    if (old && Date.now() - old.time < 60000) return old.rows;
    if (pending.has(table)) return pending.get(table);
    const key = `bleuskm_cache_${table}`;
    const saved = (() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } })();
    const job = fetch(`${AIRTABLE}?table=${encodeURIComponent(table)}`)
      .then((res) => res.ok ? res.json() : { records: old?.rows || saved })
      .then((data) => {
        const rows = data.records || [];
        if (rows.length) {
          cache.set(table, { time: Date.now(), rows });
          try { localStorage.setItem(key, JSON.stringify(rows)); } catch {}
        }
        return rows;
      })
      .catch(() => old?.rows || saved)
      .finally(() => pending.delete(table));
    pending.set(table, job);
    return job;
  }

  async function saveRecord(table, fields, id = '') {
    const res = await fetch(AIRTABLE, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { table, id, fields } : { table, fields })
    });
    if (!res.ok) throw new Error('Airtable save failed');
    cache.delete(table);
    return res.json();
  }

  async function deleteRecord(table, id) {
    const res = await fetch(AIRTABLE, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id })
    });
    if (!res.ok) throw new Error('Airtable delete failed');
    cache.delete(table);
  }

  function installStyles() {
    if ($('castingRescueStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="castingRescueStyles">
      #tableWrap,#contractsList,.contracts-tabs,#hub-email .hub-sub,#hub-email .compose-quickform,.hub-btn[data-hub="admin"],#hub-admin{display:none!important}
      #castingCardsGrid,.repair-contract-grid,.repair-signed-grid,.contact-section-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:10px!important}
      .repair-card,.repair-contract-card,.contact-card,.portal-note{position:relative!important;background:var(--surface2,#111)!important;border:1px solid var(--borderdim,rgba(255,255,255,.08))!important;border-radius:6px!important;padding:14px!important;color:var(--text)!important;min-height:112px!important}
      .repair-card:hover,.repair-contract-card:hover,.contact-card:hover{border-color:rgba(218,175,55,.45)!important}
      .repair-card-main,.repair-contract-card{display:block!important;width:100%!important;background:transparent!important;border:0!important;padding:0!important;text-align:left!important;color:inherit!important;cursor:pointer!important;letter-spacing:0!important;text-transform:none!important}
      .repair-card strong,.repair-contract-card strong,.contact-card-name,.portal-note strong{display:block!important;color:var(--text)!important;font-size:13px!important;line-height:1.25!important;letter-spacing:0!important;text-transform:none!important}
      .repair-card span,.repair-contract-card span,.contact-card-detail,.portal-note p{display:block!important;color:var(--muted)!important;font-size:11px!important;line-height:1.35!important;margin-top:6px!important;letter-spacing:0!important;text-transform:none!important}
      .repair-status{display:inline-block!important;width:max-content!important;color:var(--gold)!important;border:1px solid rgba(218,175,55,.28)!important;padding:4px 6px!important;margin-top:8px!important;font-size:8px!important;line-height:1!important;letter-spacing:.12em!important;text-transform:uppercase!important}
      .repair-actions,.contact-card-actions,.portal-row-actions,.repair-batch{display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important;margin-top:10px!important}
      .repair-actions button,.contact-card-actions button,.portal-row-actions button,.tc-send-btn,.tiny-text-btn,.repair-tab{appearance:none!important;min-height:0!important;background:transparent!important;border:0!important;border-bottom:1px solid rgba(218,175,55,.45)!important;border-radius:0!important;color:var(--gold)!important;font-family:var(--font,inherit)!important;font-size:9px!important;font-weight:700!important;line-height:1.1!important;letter-spacing:.12em!important;text-transform:uppercase!important;padding:3px 1px!important;cursor:pointer!important}
      .repair-batch{margin:10px 28px 18px!important}.repair-batch select{background:#0b0b0b!important;color:var(--text)!important;border:1px solid rgba(218,175,55,.35)!important;padding:6px 8px!important}
      .app-check{position:absolute!important;top:9px!important;right:9px!important;width:13px!important;height:13px!important;accent-color:#d9ad31!important}
      .danger{color:#ff8b8b!important;border-color:rgba(255,139,139,.45)!important}.contacts-section-label{grid-column:1/-1!important;margin:12px 0 0!important;color:var(--gold)!important;font-size:10px!important;text-transform:uppercase!important;letter-spacing:.14em!important}
      .repair-contract-tabs{display:flex!important;gap:14px!important;flex-wrap:wrap!important;margin:20px 0!important}.repair-tab.active{color:var(--gold)!important;border-color:var(--gold)!important}
      .casting-modal{position:fixed!important;inset:0!important;z-index:99999!important;background:rgba(0,0,0,.86)!important;display:flex!important;align-items:flex-start!important;justify-content:center!important;padding:34px 14px!important;overflow:auto!important}
      .casting-modal-card{position:relative!important;width:min(760px,96vw)!important;background:#0d0d0d!important;border:1px solid rgba(218,175,55,.28)!important;padding:22px!important;color:var(--text)!important}.casting-modal-close{position:absolute!important;top:8px!important;right:12px!important;background:transparent!important;border:0!important;color:var(--muted)!important;font-size:22px!important;cursor:pointer!important}
      .detail-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))!important;gap:8px!important;margin:14px 0!important}.detail-grid div{border:1px solid var(--borderdim)!important;padding:9px!important;color:var(--muted)!important;font-size:11px!important}.detail-grid small{display:block!important;color:var(--gold)!important;font-size:8px!important;letter-spacing:.12em!important;text-transform:uppercase!important;margin-bottom:4px!important}
      .calendar-day{position:relative!important;min-height:110px!important}.calendar-add{position:absolute!important;right:6px!important;top:6px!important;opacity:0!important}.calendar-day:hover .calendar-add{opacity:1!important}.calendar-pill span{display:block!important;color:var(--muted)!important;font-size:8px!important;margin-top:3px!important}
    </style>`);
  }

  function castRole(f) { return text(f['To Role']) || text(f.Role) || text(f['Role Interested In']); }
  function crewRole(f) { return text(f['Preferred role by Director'] || f['Preferred Role by Director'] || f.Preferred_role_by_Director) || text(f.Role); }
  function castStatus(f) { return text(f['Casting Status']) || 'Pending'; }
  function templateFor(f) {
    const status = castStatus(f).toLowerCase();
    const selfTape = text(f['Self Tape Status']).toLowerCase();
    if (selfTape.includes('selected for final')) return '19';
    if (status === 'callback') return '15';
    if (status === 'pass') return '16';
    if (status === 'redirect') return text(f['To Role']) ? '18' : '17';
    return '';
  }
  function templateLabel(id) {
    return ({ 15: 'Send Self Tape Invite', 16: 'Send Rejection', 17: 'Send Direct Offer', 18: 'Send Cross Casting', 19: 'Send Callback' })[String(id)] || 'Send Email';
  }

  function showModal(html) {
    qsa('.casting-modal').forEach((m) => m.remove());
    document.body.insertAdjacentHTML('beforeend', `<div class="casting-modal"><div class="casting-modal-card"><button class="casting-modal-close" data-close-repair>&times;</button>${html}</div></div>`);
  }

  function installBatchBar() {
    if ($('repairBatchBar')) return;
    qs('#hub-applications .controls-bar')?.insertAdjacentHTML('afterend', `<div class="repair-batch" id="repairBatchBar">
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
    $('repairBatchSend')?.addEventListener('click', sendBatch);
    $('repairBatchClear')?.addEventListener('click', () => {
      qsa('.app-check:checked').forEach((box) => { box.checked = false; });
      updateSelectedCount();
    });
  }

  function updateSelectedCount() {
    const count = qsa('.app-check:checked').length;
    if ($('repairSelectedCount')) $('repairSelectedCount').textContent = `${count} selected`;
  }

  async function renderApplications() {
    const main = qs('#hub-applications .dash-main');
    if (!main) return;
    $('tableWrap')?.classList.add('hidden');
    $('stateLoading')?.classList.add('hidden');
    $('stateError')?.classList.add('hidden');
    $('stateEmpty')?.classList.add('hidden');
    installBatchBar();
    let grid = $('castingCardsGrid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'castingCardsGrid';
      main.appendChild(grid);
    }
    const filter = text(qs('.filter-btn.active')?.dataset.filter || 'All').toLowerCase();
    const query = text($('searchInput')?.value).toLowerCase();
    let rows = await records('Casting Submissions');
    rows = rows.filter((r) => {
      const f = r.fields || {};
      const status = castStatus(f);
      const hay = [f.Name, f.Email, castRole(f), f.Location, status].map(text).join(' ').toLowerCase();
      return (filter === 'all' || status.toLowerCase() === filter) && (!query || hay.includes(query));
    });
    window.__castRows = rows;
    grid.innerHTML = rows.map((r) => {
      const f = r.fields || {};
      const name = text(f.Name) || 'Applicant';
      const email = text(f.Email);
      const tid = templateFor(f);
      return `<article class="repair-card">
        <input class="app-check" type="checkbox" data-id="${esc(r.id)}" aria-label="Select ${esc(name)}">
        <button class="repair-card-main" type="button" data-open-app="${esc(r.id)}">
          <strong>${esc(name)}</strong>
          <span>${esc(castRole(f) || 'Role not set')}</span>
          <span>${esc(email)}</span>
          <span class="repair-status">${esc(castStatus(f))}</span>
        </button>
        <div class="repair-actions">${email && tid ? `<button type="button" data-template-person="${esc(email)}" data-template-id="${esc(tid)}">${esc(templateLabel(tid))}</button>` : ''}</div>
      </article>`;
    }).join('') || '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No submissions match.</p>';
    updateSelectedCount();
  }

  function openApplication(id) {
    const r = (window.__castRows || []).find((row) => row.id === id);
    if (!r) return;
    const f = r.fields || {};
    const keys = ['Name', 'Email', 'Location', 'Role', 'To Role', 'Casting Status', 'Cast Status', 'Self Tape Status', 'Self Tape URL', 'Callback/Redirect', 'Email Sent', 'Notes'];
    const details = keys.map((k) => text(f[k]) ? `<div><small>${esc(k)}</small>${k.includes('URL') ? `<a href="${esc(text(f[k]))}" target="_blank" rel="noopener">${esc(text(f[k]))}</a>` : esc(text(f[k]))}</div>` : '').join('');
    const email = text(f.Email);
    const buttons = [['15', 'Self Tape Invite'], ['16', 'Rejection'], ['17', 'Direct Offer'], ['18', 'Cross Casting'], ['19', 'Callback']]
      .map(([tid, label]) => `<button type="button" data-template-person="${esc(email)}" data-template-id="${tid}">Send ${label}</button>`).join('');
    showModal(`<h2>${esc(text(f.Name) || 'Applicant')}</h2><div class="detail-grid">${details}</div><div class="repair-actions">${email ? `<button type="button" data-direct-email="${esc(email)}" data-direct-name="${esc(text(f.Name))}">Email</button>${buttons}` : ''}</div>`);
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

  async function sendBatch() {
    const templateId = $('repairBatchTemplate')?.value;
    const ids = qsa('.app-check:checked').map((box) => box.dataset.id);
    if (!templateId) return alert('Choose a template first.');
    if (!ids.length) return alert('Select at least one application.');
    let sent = 0;
    for (const id of ids) {
      const rec = (window.__castRows || []).find((row) => row.id === id);
      const email = text(rec?.fields?.Email);
      if (email && await sendBrevo(email, templateId, true)) sent += 1;
    }
    alert(`${sent} template email${sent === 1 ? '' : 's'} processed.`);
  }

  function openEmail(email = '', name = '') {
    if (typeof window.openComposeModal === 'function') window.openComposeModal(email, name, 'casting@bleuskm.com');
  }

  async function sendZohoCompose() {
    const from = text($('composeFrom')?.value) || 'casting@bleuskm.com';
    const to = text($('composeTo')?.value);
    const subject = text($('composeSubject')?.value);
    const body = text($('composeBody')?.value);
    if (!to || !subject || !body) return alert('Please fill in all fields.');
    const btn = $('composeModalSend');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      const res = await fetch(ZOHO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', from, fromName: 'BLEUSKM Studios', to, subject, textContent: body, htmlContent: `<p>${esc(body).replace(/\n/g, '<br>')}</p>` })
      });
      if (!res.ok) return alert((await res.json().catch(() => ({}))).error || 'Email failed.');
      $('composeModal')?.classList.add('hidden');
      alert('Email sent.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Email'; }
    }
  }

  function cleanEmailHub() {
    const grid = qs('#hub-email .template-grid');
    if (!grid) return;
    const has15 = qsa('#hub-email .tc-num').some((n) => text(n.textContent).replace(/\D/g, '') === '15');
    if (!has15) {
      grid.insertAdjacentHTML('afterbegin', `<div class="template-card"><div class="tc-num">T15</div><div class="tc-name">Self Tape Invitation</div><div class="tc-desc">Sent to callback applicants selected for self tape.</div><button class="tc-send-btn" data-email-template="15">Compose Direct Email</button></div>`);
    }
    qsa('#hub-email .tc-send-btn').forEach((button) => {
      const id = (button.getAttribute('onclick') || '').match(/(\d+)/)?.[1] || button.closest('.template-card')?.querySelector('.tc-num')?.textContent.replace(/\D/g, '') || button.dataset.emailTemplate;
      button.removeAttribute('onclick');
      button.dataset.emailTemplate = id || '';
      button.textContent = 'Compose Direct Email';
    });
  }

  function openTemplateComposer(templateId) {
    openEmail('', '');
    const subject = $('composeSubject');
    if (subject && !subject.value) subject.value = templateLabel(templateId).replace(/^Send\s+/i, '');
  }

  function activeContractGroup() { return qs('[data-contract-group].active')?.dataset.contractGroup || 'cast'; }
  function findAgreement(key) { return Object.values(agreements).flat().find((a) => a[0] === key) || agreements.cast[0]; }

  function installContracts() {
    const panel = $('hub-contracts');
    if (!panel) return;
    if (!$('repairContractTabs')) {
      panel.querySelector('.hub-header-row')?.insertAdjacentHTML('afterend', `<div class="repair-contract-tabs" id="repairContractTabs">
        <button class="repair-tab active" type="button" data-contract-group="cast">Cast</button>
        <button class="repair-tab" type="button" data-contract-group="crew">Crew</button>
        <button class="repair-tab" type="button" data-contract-group="production">Production</button>
        <button class="repair-tab" type="button" data-contract-group="post">Post</button>
        <button class="repair-tab" type="button" data-contract-group="signed">Signed</button>
      </div><div class="repair-contract-grid" id="repairContractGrid"></div><div class="repair-signed-grid" id="repairSignedGrid" style="display:none"></div>`);
    }
    renderContractGroup(activeContractGroup());
  }

  function renderContractGroup(group) {
    const grid = $('repairContractGrid');
    const signed = $('repairSignedGrid');
    if (!grid || !signed) return;
    qsa('[data-contract-group]').forEach((b) => b.classList.toggle('active', b.dataset.contractGroup === group));
    if (group === 'signed') {
      grid.style.display = 'none';
      signed.style.display = 'grid';
      renderSignedContracts();
      return;
    }
    signed.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = (agreements[group] || agreements.cast).map((a) => `<button type="button" class="repair-contract-card" data-open-agreement="${esc(a[0])}"><strong>${esc(a[1])}</strong><span>${esc(a[2])}</span></button>`).join('');
  }

  function openAgreement(key) {
    const a = findAgreement(key);
    if (typeof window.openContractModal === 'function') window.openContractModal();
    else $('contractModal')?.classList.remove('hidden');
    setTimeout(() => {
      const type = $('contractType');
      if (type) {
        type.value = Array.from(type.options).some((o) => o.value === a[3]) ? a[3] : 'custom';
        type.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setTimeout(() => {
        if ($('contractModalTitle')) $('contractModalTitle').textContent = a[1].toUpperCase();
        if ($('contractTerms') && customTerms[a[0]]) $('contractTerms').value = customTerms[a[0]];
      }, 60);
    }, 60);
  }

  async function renderSignedContracts() {
    const list = $('repairSignedGrid');
    if (!list) return;
    const local = (() => { try { return JSON.parse(localStorage.getItem('bleuskm_contracts') || '[]'); } catch { return []; } })()
      .filter((c) => text(c.status).toLowerCase() === 'signed' || text(c.signature));
    const air = (await records('Contracts')).map((r) => {
      const f = r.fields || {};
      return { name: text(f.Name || f['Full Name'] || f.Signer), email: text(f.Email), role: text(f.Role || f.Position), type: text(f.Type || f['Agreement Type'] || f.Contract), date: text(f['Signed Date'] || f.Date || f.Created) };
    });
    const rows = [...local, ...air].filter((r) => r.name || r.email || r.type);
    list.innerHTML = rows.map((r) => `<div class="repair-card"><strong>${esc(r.name || 'Signed Contract')}</strong><span>${esc(r.type || 'Agreement')}</span><span>${esc(r.role)}</span><span>${esc(r.email)}</span><span class="repair-status">Managed by Director${r.date ? ' - ' + esc(r.date) : ''}</span></div>`).join('') || '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No signed contracts found yet.</p>';
  }

  function contractLink(name, email, role) {
    return `https://bleuskm.com/crew/contract?${new URLSearchParams({ name: name || '', email: email || '', role: role || '', film: PROJECT })}`;
  }

  function patchContractModal() {
    const save = $('contractSaveBtn');
    if (!save || $('copyDirectContract')) return;
    save.insertAdjacentHTML('beforebegin', '<button class="modal-cancel" id="copyDirectContract" type="button">Copy Link</button><button class="modal-cancel" id="sendDirectContract" type="button">Send Link</button>');
    $('copyDirectContract').onclick = async () => {
      const name = text($('contractName')?.value);
      const email = text($('contractEmail')?.value);
      const role = text($('contractRole')?.value);
      if (!name || !email) return alert('Enter a name and email first.');
      await navigator.clipboard?.writeText(contractLink(name, email, role));
      alert('Contract link copied.');
    };
  }

  async function renderContacts() {
    const grid = $('contactsGrid');
    if (!grid) return;
    const [crewRows, castRows] = await Promise.all([records('Crew applications'), records('Casting Submissions')]);
    const query = text($('contactsSearch')?.value).toLowerCase();
    const crew = crewRows.filter((r) => text(r.fields?.Status).toLowerCase() === 'core');
    const cast = castRows.filter((r) => text(r.fields?.['Cast Status'] || r.fields?.['Casting Status']).toLowerCase() === 'confirmed');
    const card = (r, type) => {
      const f = r.fields || {};
      const name = text(f.Name) || 'Contact';
      const email = text(f.Email);
      const role = type === 'cast' ? castRole(f) : crewRole(f);
      return `<div class="contact-card"><div class="contact-card-name">${esc(name)}</div><div class="contact-card-detail">${esc(email)}${role ? `<br><span style="color:var(--golddim);font-size:9px">${esc(role)}</span>` : ''}</div><div class="contact-card-actions">${email ? `<button type="button" data-direct-email="${esc(email)}" data-direct-name="${esc(name)}">Email</button>` : ''}</div></div>`;
    };
    const keep = (r, type) => !query || [r.fields?.Name, r.fields?.Email, type === 'cast' ? castRole(r.fields || {}) : crewRole(r.fields || {})].map(text).join(' ').toLowerCase().includes(query);
    if ($('contactsCounts')) $('contactsCounts').textContent = `${crew.length} crew · ${cast.length} cast`;
    grid.innerHTML = `<div class="contacts-section-label">Cast Members</div><div class="contact-section-grid">${cast.filter((r) => keep(r, 'cast')).map((r) => card(r, 'cast')).join('') || '<p style="font-size:10px;color:var(--muted)">No confirmed cast contacts yet.</p>'}</div><div class="contacts-section-label">Core Crew</div><div class="contact-section-grid">${crew.filter((r) => keep(r, 'crew')).map((r) => card(r, 'crew')).join('') || '<p style="font-size:10px;color:var(--muted)">No core crew contacts found.</p>'}</div>`;
  }

  async function repairTimeline() {
    const track = $('timelineTrack');
    if (!track) return;
    const bad = text(track.textContent).toLowerCase().includes('could not load') || track.querySelector('.timeline-loading');
    if (!bad && text(track.textContent)) return;
    const rows = (await records('Production Timeline')).sort((a, b) => text(a.fields?.['Start Date']).localeCompare(text(b.fields?.['Start Date'])));
    if (!rows.length) return;
    track.innerHTML = rows.map((r) => {
      const f = r.fields || {};
      return `<div class="timeline-phase ${text(f.Status).toLowerCase() === 'active' ? 'active' : ''}"><div class="phase-dot"></div><div class="phase-title">${esc(text(f.Phase || f.Title) || 'Event')}</div><div class="phase-dates">${esc(text(f['Start Date']))}${text(f['End Date']) ? ' - ' + esc(text(f['End Date'])) : ''}</div><div class="phase-status">${esc(text(f.Status) || 'Upcoming')}</div></div>`;
    }).join('');
  }

  function iso(d) { return d.toISOString().slice(0, 10); }

  async function renderCalendar() {
    const wrap = $('calendarWrap');
    const grid = $('calendarGrid');
    if (!wrap || !grid) return;
    wrap.classList.remove('hidden');
    const rows = await records('Production Timeline');
    const callbacks = (await records('Casting Submissions')).filter((r) => r.fields?.['Callback Scheduled'] === true || text(r.fields?.['Callback Scheduled']).toLowerCase() === 'true').map((r) => {
      const f = r.fields || {};
      return { id: r.id, callback: true, fields: { Phase: `Callback: ${text(f.Name)}`, 'Start Date': text(f['Callback Date'] || f['Callback Meeting Date'] || f['Meeting Date'] || f['Meeting Date/Time']), Status: 'Callback', Description: text(f.Email), Role: castRole(f), Email: text(f.Email), Link: text(f['Google Meet Link'] || f['Meeting Link'] || f['Callback Link']) } };
    }).filter((r) => text(r.fields['Start Date']));
    const all = [...rows, ...callbacks];
    const first = all.map((r) => text(r.fields?.['Start Date'])).find(Boolean);
    const base = first ? new Date(`${first}T12:00:00`) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    if ($('calMonthLabel')) $('calMonthLabel').textContent = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="calendar-head">${d}</div>`).join('');
    for (let i = 0; i < 42; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = iso(day);
      const events = all.filter((r) => text(r.fields?.['Start Date']).slice(0, 10) === key);
      html += `<div class="calendar-day ${day.getMonth() === base.getMonth() ? '' : 'muted'}"><button class="calendar-add tiny-text-btn" type="button" data-new-event="${key}">+</button><div class="calendar-date">${day.getDate()}</div>${events.map((r) => `<button class="calendar-pill" type="button" data-edit-event="${esc(r.id)}">${esc(text(r.fields?.Phase) || 'Event')}<span>${esc(text(r.fields?.Status) || 'Upcoming')}</span></button>`).join('')}</div>`;
    }
    grid.innerHTML = html;
    window.__timelineRows = rows;
    window.__callbackRows = callbacks;
  }

  function openEventModal(record, date = '') {
    const f = record?.fields || {};
    const callback = !!record?.callback;
    const id = callback ? '' : record?.id || '';
    showModal(`<h2>${record ? 'Event Details' : 'Add Event'}</h2><div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="evTitle" value="${esc(text(f.Phase || f.Title))}" ${callback ? 'readonly' : ''}></div><div class="modal-row"><div class="modal-field"><label class="modal-label">Date</label><input type="date" class="modal-input" id="evStart" value="${esc(text(f['Start Date']).slice(0, 10) || date)}" ${callback ? 'readonly' : ''}></div><div class="modal-field"><label class="modal-label">Status</label><input class="modal-input" id="evStatus" value="${esc(text(f.Status) || 'Upcoming')}" ${callback ? 'readonly' : ''}></div></div>${text(f.Email) ? `<p style="font-size:11px;color:var(--muted)">Email: ${esc(text(f.Email))}</p>` : ''}${text(f.Role) ? `<p style="font-size:11px;color:var(--muted)">Role: ${esc(text(f.Role))}</p>` : ''}${text(f.Link) ? `<p><a href="${esc(text(f.Link))}" target="_blank" rel="noopener">Open meeting link</a></p>` : ''}<div class="modal-field"><label class="modal-label">Description</label><textarea class="modal-input" id="evDesc" rows="3" ${callback ? 'readonly' : ''}>${esc(text(f.Description))}</textarea></div><div class="repair-actions">${!callback && id ? `<button class="danger" type="button" data-delete-event="${esc(id)}">Delete</button>` : ''}${!callback ? `<button type="button" data-save-event="${esc(id)}">Save</button>` : ''}</div>`);
  }

  async function saveEvent(id) {
    await saveRecord('Production Timeline', { Phase: text($('evTitle')?.value) || 'Untitled Event', 'Start Date': $('evStart')?.value || null, Status: text($('evStatus')?.value) || 'Upcoming', Description: text($('evDesc')?.value) }, id);
    qsa('.casting-modal').forEach((m) => m.remove());
    renderCalendar();
    repairTimeline();
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    await deleteRecord('Production Timeline', id);
    qsa('.casting-modal').forEach((m) => m.remove());
    renderCalendar();
    repairTimeline();
  }

  function boot() {
    installStyles();
    qsa('.hub-btn[data-hub="admin"]').forEach((b) => b.remove());
    cleanEmailHub();
    installContracts();
    patchContractModal();
    if (qs('#hub-applications.active')) renderApplications();
    if (qs('#hub-contacts.active')) renderContacts();
    if (qs('#hub-timeline.active')) repairTimeline();
  }

  document.addEventListener('DOMContentLoaded', () => { boot(); setTimeout(boot, 300); });
  document.addEventListener('click', (event) => {
    const hub = event.target.closest('.hub-btn[data-hub]');
    if (hub) setTimeout(boot, 120);
    const filter = event.target.closest('.filter-btn');
    if (filter) setTimeout(renderApplications, 80);
    const nc = event.target.closest('#newContractBtn');
    if (nc) { event.preventDefault(); event.stopPropagation(); return openAgreement((agreements[activeContractGroup()] || agreements.cast)[0][0]); }
    const group = event.target.closest('[data-contract-group]');
    if (group) { event.preventDefault(); return renderContractGroup(group.dataset.contractGroup); }
    const app = event.target.closest('[data-open-app]');
    if (app) { event.preventDefault(); return openApplication(app.dataset.openApp); }
    const direct = event.target.closest('[data-direct-email]');
    if (direct) { event.preventDefault(); event.stopPropagation(); return openEmail(direct.dataset.directEmail, direct.dataset.directName); }
    const person = event.target.closest('[data-template-person]');
    if (person) { event.preventDefault(); event.stopPropagation(); return sendBrevo(person.dataset.templatePerson, person.dataset.templateId); }
    const template = event.target.closest('[data-email-template]');
    if (template) { event.preventDefault(); event.stopPropagation(); return openTemplateComposer(template.dataset.emailTemplate); }
    const agreement = event.target.closest('[data-open-agreement]');
    if (agreement) { event.preventDefault(); event.stopPropagation(); return openAgreement(agreement.dataset.openAgreement); }
    const calendar = event.target.closest('#calendarToggleBtn');
    if (calendar) { event.preventDefault(); event.stopPropagation(); return renderCalendar(); }
    const addEvent = event.target.closest('[data-new-event]');
    if (addEvent) { event.preventDefault(); return openEventModal(null, addEvent.dataset.newEvent); }
    const editEvent = event.target.closest('[data-edit-event]');
    if (editEvent) {
      event.preventDefault();
      const rec = [...(window.__timelineRows || []), ...(window.__callbackRows || [])].find((r) => r.id === editEvent.dataset.editEvent);
      return openEventModal(rec);
    }
    const save = event.target.closest('[data-save-event]');
    if (save) { event.preventDefault(); return saveEvent(save.dataset.saveEvent); }
    const del = event.target.closest('[data-delete-event]');
    if (del) { event.preventDefault(); return deleteEvent(del.dataset.deleteEvent); }
    if (event.target.closest('#composeModalSend')) { event.preventDefault(); event.stopImmediatePropagation(); return sendZohoCompose(); }
    if (event.target.closest('[data-close-repair]') || event.target.classList?.contains('casting-modal')) qsa('.casting-modal').forEach((m) => m.remove());
  }, true);
  document.addEventListener('change', (event) => { if (event.target.classList?.contains('app-check')) updateSelectedCount(); }, true);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'searchInput') setTimeout(renderApplications, 120);
    if (event.target?.id === 'contactsSearch') setTimeout(renderContacts, 120);
  }, true);
  setInterval(() => { cleanEmailHub(); installContracts(); }, 3000);
})();