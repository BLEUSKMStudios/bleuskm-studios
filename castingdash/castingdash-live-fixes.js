(function () {
  const ARCHIVE_KEY = 'bleuskm_casting_email_archive';
  const rawFetch = window.fetch.bind(window);

  function text(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
    return String(value ?? '').trim();
  }

  function normalizeCrewRecord(record) {
    const f = record.fields || {};
    f.Status = normalizeStatus(f.Status);
    f.Preferred_role_by_Director = text(f['Preferred role by Director'] || f.Preferred_role_by_Director);
    f.LT_Roles = text(f['LT Roles'] || f.LT_Roles);
    if (f['For the final Hand'] !== undefined && f['For the Final Hand'] === undefined) {
      f['For the Final Hand'] = f['For the final Hand'];
    }
    return record;
  }

  function normalizeCastingRecord(record) {
    const f = record.fields || {};
    f['Cast Status'] = text(f['Cast Status']);
    f['Casting Status'] = text(f['Casting Status']);
    f['To Role'] = text(f['To Role']);
    return record;
  }

  function normalizeStatus(value) {
    const status = text(value);
    return status.toLowerCase() === 'core' ? 'Core' : status;
  }

  function endpointUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function isCoreCrew(record) {
    return normalizeStatus(record.fields?.Status).toLowerCase() === 'core';
  }

  function isConfirmedCast(record) {
    return text(record.fields?.['Cast Status']).toLowerCase() === 'confirmed';
  }

  function archive(entry) {
    let items = [];
    try { items = JSON.parse(sessionStorage.getItem(ARCHIVE_KEY) || '[]'); } catch {}
    items.unshift({
      at: new Date().toISOString(),
      from: entry.from || 'Brevo template',
      to: entry.to || '',
      subject: entry.subject || '',
      templateId: entry.templateId || '',
      name: entry.name || '',
    });
    sessionStorage.setItem(ARCHIVE_KEY, JSON.stringify(items.slice(0, 80)));
    renderArchive();
  }

  function ensureArchive() {
    if (!document.getElementById('emailArchiveList')) {
      const templateGrid = document.querySelector('#hub-email .template-grid');
      if (templateGrid) {
        templateGrid.insertAdjacentHTML('afterend', '<div class="hub-section-label" style="margin-top:32px;">SENT EMAIL ARCHIVE</div><div class="email-archive-list" id="emailArchiveList"></div>');
      }
    }
    if (!document.getElementById('liveFixArchiveStyle')) {
      document.head.insertAdjacentHTML('beforeend', '<style id="liveFixArchiveStyle">.email-archive-list{display:grid;gap:8px}.archive-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:10px 12px;background:var(--surface2);border:1px solid var(--borderdim);border-radius:var(--r)}.archive-row strong{display:block;color:var(--text);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.archive-row span,.archive-row>div:last-child{color:var(--muted);font-size:10px;line-height:1.45}.contact-picker{position:absolute;z-index:9000;width:min(420px,90vw);max-height:260px;overflow:auto;background:#111;border:1px solid var(--borderdim);box-shadow:0 18px 40px rgba(0,0,0,.45);margin-top:4px}.contact-picker-row{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--borderdim);color:var(--text);padding:10px 12px;cursor:pointer;font-family:inherit}.contact-picker-row:hover{background:var(--goldfaint)}.contact-picker-row strong{display:block;font-size:11px}.contact-picker-row span,.contact-picker-empty{display:block;font-size:10px;line-height:1.45;color:var(--muted);padding:10px 12px}</style>');
    }
    renderArchive();
  }

  function renderArchive() {
    const list = document.getElementById('emailArchiveList');
    if (!list) return;
    let items = [];
    try { items = JSON.parse(sessionStorage.getItem(ARCHIVE_KEY) || '[]'); } catch {}
    if (!items.length) {
      list.innerHTML = '<p style="font-size:10px;color:var(--muted);padding:12px 0;">No emails sent this session.</p>';
      return;
    }
    list.innerHTML = items.map(item => {
      const when = item.at ? new Date(item.at).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '';
      const label = item.templateId ? `T${item.templateId}` : escapeHtml(item.subject || 'Direct email');
      return `<div class="archive-row"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(item.name || item.to)}</span></div><div>${escapeHtml(item.from)} -> ${escapeHtml(item.to)}<br>${escapeHtml(when)}</div></div>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function findCastingByEmail(email) {
    if (!email) return null;
    const res = await rawFetch(`/.netlify/functions/airtable-proxy?table=${encodeURIComponent('Casting Submissions')}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.records || []).find(r => text(r.fields?.Email).toLowerCase() === email.toLowerCase()) || null;
  }

  function consentUrl(id, answer, film) {
    return `https://bleuskm.com/redirect-response?id=${encodeURIComponent(id)}&response=${answer}&film=${encodeURIComponent(film || 'The Final Hand')}`;
  }

  function selfTapeUrl(f, id) {
    const qs = new URLSearchParams({ name: text(f.Name), role: text(f.Role), email: text(f.Email), id });
    return `https://bleuskm.com/selftape?${qs.toString()}`;
  }

  async function loadProductionContacts() {
    const [crewRes, castRes] = await Promise.all([
      rawFetch(`/.netlify/functions/airtable-proxy?table=${encodeURIComponent('Crew applications')}`),
      rawFetch(`/.netlify/functions/airtable-proxy?table=${encodeURIComponent('Casting Submissions')}`),
    ]);
    const crewData = crewRes.ok ? await crewRes.json() : { records: [] };
    const castData = castRes.ok ? await castRes.json() : { records: [] };
    const crew = (crewData.records || []).map(normalizeCrewRecord).filter(isCoreCrew);
    const cast = (castData.records || []).map(normalizeCastingRecord).filter(isConfirmedCast);
    return { crew, cast };
  }

  function contactCard(record, type) {
    const f = record.fields || {};
    const email = text(f.Email);
    const name = text(f.Name) || '---';
    const role = type === 'crew' ? text(f.Preferred_role_by_Director) || text(f.Role) : text(f.Role);
    const detail = type === 'crew' ? [text(f.Phone), role].filter(Boolean).join(' - ') : [text(f.Location), role].filter(Boolean).join(' - ');
    const alias = type === 'crew' ? 'crew@bleuskm.com' : 'casting@bleuskm.com';
    return `<div class="contact-card"><div class="contact-card-name">${escapeHtml(name)}</div><div class="contact-card-detail">${escapeHtml(email)}<br>${escapeHtml(detail)}</div><div class="contact-card-actions">${email ? `<button class="contact-action-btn" data-pick-email="${escapeHtml(email)}" data-pick-name="${escapeHtml(name)}" data-pick-alias="${alias}">&#9993; Email</button>` : ''}</div></div>`;
  }

  async function renderProductionContacts() {
    const grid = document.getElementById('contactsGrid');
    const counts = document.getElementById('contactsCounts');
    if (!grid) return;
    grid.innerHTML = '<div class="contacts-loading"><div class="loader-ring-sm"></div><span>Loading...</span></div>';
    const { crew, cast } = await loadProductionContacts();
    if (counts) counts.textContent = `${crew.length} crew - ${cast.length} confirmed cast`;
    const parts = [];
    if (crew.length) {
      parts.push('<div class="contacts-section-label">CORE CREW - THE FINAL HAND</div>');
      parts.push(...crew.map(r => contactCard(r, 'crew')));
    }
    if (cast.length) {
      parts.push('<div class="contacts-section-label">CONFIRMED CAST - THE FINAL HAND</div>');
      parts.push(...cast.map(r => contactCard(r, 'cast')));
    }
    grid.innerHTML = parts.length ? parts.join('') : '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No production contacts match yet.</p>';
    grid.querySelectorAll('[data-pick-email]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof window.openComposeModal === 'function') window.openComposeModal(btn.dataset.pickEmail, btn.dataset.pickName, btn.dataset.pickAlias);
      });
    });
  }

  async function setupRecipientPicker() {
    const { crew, cast } = await loadProductionContacts();
    const contacts = [
      ...crew.map(r => ({ type: 'Crew', name: text(r.fields.Name), email: text(r.fields.Email), role: text(r.fields.Preferred_role_by_Director) || text(r.fields.Role) })),
      ...cast.map(r => ({ type: 'Cast', name: text(r.fields.Name), email: text(r.fields.Email), role: text(r.fields.Role) })),
    ].filter(c => c.email);
    ['qTo', 'composeTo'].forEach(id => attachPicker(document.getElementById(id), contacts));
  }

  function attachPicker(input, contacts) {
    if (!input || input.dataset.contactPickerReady) return;
    input.dataset.contactPickerReady = 'true';
    const wrap = document.createElement('div');
    wrap.className = 'contact-picker hidden';
    input.insertAdjacentElement('afterend', wrap);
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const matches = contacts.filter(c => !q || [c.name, c.email, c.role, c.type].join(' ').toLowerCase().includes(q)).slice(0, 30);
      wrap.innerHTML = matches.map(c => `<button type="button" class="contact-picker-row" data-email="${escapeHtml(c.email)}"><strong>${escapeHtml(c.name || c.email)}</strong><span>${escapeHtml(c.type)}${c.role ? ` - ${escapeHtml(c.role)}` : ''}<br>${escapeHtml(c.email)}</span></button>`).join('') || '<div class="contact-picker-empty">No matching contacts.</div>';
      wrap.classList.remove('hidden');
    };
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    wrap.addEventListener('mousedown', event => {
      const row = event.target.closest('[data-email]');
      if (!row) return;
      event.preventDefault();
      input.value = row.dataset.email;
      wrap.classList.add('hidden');
    });
    document.addEventListener('click', event => {
      if (event.target !== input && !wrap.contains(event.target)) wrap.classList.add('hidden');
    });
  }

  async function renderCrewContracts() {
    const list = document.getElementById('contractsList');
    const activeTab = document.querySelector('.contracts-tab.active')?.dataset.tab;
    if (!list || activeTab !== 'crew') return;
    list.innerHTML = '<p style="font-size:10px;color:var(--muted);padding:16px 0;">Loading signed crew contracts...</p>';
    const res = await rawFetch(`/.netlify/functions/airtable-proxy?table=${encodeURIComponent('Contracts')}`);
    const data = res.ok ? await res.json() : { records: [] };
    const signed = (data.records || []).filter(r => text(r.fields?.['Contract Status']).toLowerCase() === 'signed' || text(r.fields?.Signature));
    if (!signed.length) {
      list.innerHTML = '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No signed crew contracts yet.</p>';
      return;
    }
    list.innerHTML = signed.map(r => {
      const f = r.fields || {};
      const sig = Array.isArray(f.Signature) ? f.Signature[0]?.url : text(f.Signature);
      return `<div class="contract-card"><div class="contract-card-header"><div><div class="contract-card-name">${escapeHtml(text(f.Name) || '---')}</div><div class="contract-card-role">${escapeHtml(text(f.Role) || 'Crew')}</div></div><span class="contract-status-badge signed">Signed</span></div><div style="font-size:10px;color:var(--muted);line-height:1.5;">${escapeHtml(text(f.Email))}<br>${escapeHtml(text(f['Date Signed']))}</div><div class="contract-card-actions">${sig ? `<a class="contact-action-btn" href="${escapeHtml(sig)}" target="_blank" rel="noopener" style="text-decoration:none;">View Signature</a>` : ''}</div></div>`;
    }).join('');
  }

  function repairNewContractButton() {
    const btn = document.getElementById('newContractBtn');
    if (!btn || btn.dataset.liveFixReady) return;
    btn.dataset.liveFixReady = 'true';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.openContractModal === 'function') window.openContractModal();
      else document.getElementById('contractModal')?.classList.remove('hidden');
    }, true);
  }

  function limitProductionLocks() {
    document.querySelectorAll('#prodLocksGrid > *').forEach(card => {
      if (!/The Final Hand/i.test(card.textContent || '')) card.remove();
    });
  }

  async function enrichCastingParams(body) {
    const payload = body.payload || {};
    const templateId = Number(payload.templateId);
    if (![16, 17, 18, 19].includes(templateId)) return body;
    const to = text(payload.to?.[0]?.email);
    const record = await findCastingByEmail(to);
    if (!record) return body;
    const f = record.fields || {};
    const film = text(payload.params?.FILM_NAME) || text(f.Film) || 'The Final Hand';
    const role = text(f.Role);
    const toRole = text(payload.params?.TO_ROLE) || text(f['To Role']);
    payload.params = { ...(payload.params || {}), NAME: text(f.Name), EMAIL: to, PHONE: text(f.Phone), LOCATION: text(f.Location), ROLE: role, FILM_NAME: film };
    if (templateId === 17) {
      payload.params.FILM_LINK = payload.params.FILM_LINK || 'https://bleuskm.com/casting/';
      payload.params.CONSENT_YES_URL = consentUrl(record.id, 'yes', film);
      payload.params.CONSENT_NO_URL = consentUrl(record.id, 'no', film);
    }
    if (templateId === 18) {
      payload.params.TO_ROLE = toRole || role;
      payload.params.NEW_ROLE = payload.params.TO_ROLE;
      payload.params.CONSENT_YES_URL = consentUrl(record.id, 'yes', film);
      payload.params.CONSENT_NO_URL = consentUrl(record.id, 'no', film);
    }
    if (templateId === 19) {
      payload.params.CALENDLY_URL = payload.params.CALENDLY_URL || 'https://calendly.com/studio-bleuskm/30min';
      payload.params.SELFTAPE_URL = payload.params.SELFTAPE_URL || selfTapeUrl(f, record.id);
    }
    return body;
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = endpointUrl(input);
    if (url.includes('/.netlify/functions/brevo-proxy') && init && init.body) {
      let body;
      try { body = JSON.parse(init.body); } catch {}
      if (body?.payload) {
        body = await enrichCastingParams(body);
        init = { ...init, body: JSON.stringify(body) };
      }
      const res = await rawFetch(input, init);
      if (res.ok && body?.payload) archive({ from: body.payload.sender?.email, to: body.payload.to?.[0]?.email, subject: body.payload.subject, templateId: body.payload.templateId, name: body.payload.params?.NAME });
      return res;
    }
    const res = await rawFetch(input, init);
    if (url.includes('/.netlify/functions/airtable-proxy')) {
      const parsed = new URL(url, window.location.href);
      if (parsed.searchParams.get('table') === 'Crew applications' && res.ok) {
        const data = await res.clone().json();
        data.records = (data.records || []).map(normalizeCrewRecord);
        return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: { 'Content-Type': 'application/json' } });
      }
      if (parsed.searchParams.get('table') === 'Casting Submissions' && res.ok) {
        const data = await res.clone().json();
        data.records = (data.records || []).map(normalizeCastingRecord);
        return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return res;
  };

  function repairTabs(hub) {
    if (!hub) return;
    document.querySelectorAll('.hub-panel').forEach(panel => {
      const active = panel.id === `hub-${hub}`;
      panel.classList.toggle('active', active);
      panel.classList.toggle('hidden', !active);
    });
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest('.hub-btn[data-hub]');
    if (btn) setTimeout(() => {
      repairTabs(btn.dataset.hub);
      if (btn.dataset.hub === 'contacts') renderProductionContacts();
      if (btn.dataset.hub === 'contracts') renderCrewContracts();
      if (btn.dataset.hub === 'admin') setTimeout(limitProductionLocks, 250);
    }, 0);
    if (event.target.closest('.contracts-tab[data-tab="crew"]')) setTimeout(renderCrewContracts, 100);
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureArchive();
    repairNewContractButton();
    setupRecipientPicker().catch(() => {});
    setTimeout(limitProductionLocks, 1000);
    const active = document.querySelector('.hub-btn.active[data-hub]');
    if (active) repairTabs(active.dataset.hub);
  });
})();