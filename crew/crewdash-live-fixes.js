(function () {
  const ARCHIVE_KEY = 'bleuskm_crew_email_archive';
  const CONTRACT_BASE = 'https://bleuskm.com/crew/contract';
  const rawFetch = window.fetch.bind(window);

  function text(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
    return String(value ?? '').trim();
  }

  function status(value) {
    const current = text(value);
    return current.toLowerCase() === 'core' ? 'Core' : current;
  }

  function preferred(fields) {
    return text(fields['Preferred role by Director'] || fields.Preferred_role_by_Director);
  }

  function effectiveRole(fields) {
    return preferred(fields) || text(fields.Role);
  }

  function normalizeCrewRecord(record) {
    const f = record.fields || {};
    f.Status = status(f.Status);
    f.Preferred_role_by_Director = preferred(f);
    f.LT_Roles = text(f['LT Roles'] || f.LT_Roles);
    if (f['For the final Hand'] !== undefined && f['For the Final Hand'] === undefined) {
      f['For the Final Hand'] = f['For the final Hand'];
    }
    return record;
  }

  function endpointUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  async function findCrewByEmail(email) {
    if (!email) return null;
    const res = await rawFetch(`/.netlify/functions/airtable-proxy?table=${encodeURIComponent('Crew applications')}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.records || []).map(normalizeCrewRecord).find(r => text(r.fields?.Email).toLowerCase() === email.toLowerCase()) || null;
  }

  function contractLink(name, email, role, film) {
    const qs = new URLSearchParams({ name, email, role, film: film || 'The Final Hand' });
    return `${CONTRACT_BASE}?${qs.toString()}`;
  }

  async function enrichCrewParams(body) {
    const payload = body.payload || {};
    const templateId = Number(payload.templateId);
    if (![20, 21, 22, 23, 25, 26, 27].includes(templateId)) return body;
    const email = text(payload.to?.[0]?.email);
    const record = await findCrewByEmail(email);
    if (!record) return body;
    const f = record.fields || {};
    const appliedRole = text(f.Role);
    const onSetRole = effectiveRole(f);
    const guideLink = text(f['Guide Link']);
    payload.params = {
      ...(payload.params || {}),
      NAME: text(f.Name),
      EMAIL: email,
      ROLE: onSetRole,
      APPLIED_ROLE: appliedRole,
      ORIGINAL_ROLE: appliedRole,
      ON_SET_ROLE: onSetRole,
      PREFERRED_ROLE_BY_DIRECTOR: onSetRole,
      LT_ROLES: text(f.LT_Roles),
      FILM: payload.params?.FILM || 'The Final Hand',
    };
    if (templateId === 21 || templateId === 27) {
      payload.params.CONTRACT_LINK = contractLink(text(f.Name), email, onSetRole, payload.params.FILM);
    }
    if (templateId === 26) {
      payload.params.GUIDE_LINK = payload.params.GUIDE_LINK || guideLink;
      payload.params.SHOOT_DATES = payload.params.SHOOT_DATES || 'July 19-25, 2026';
      payload.params.SHOOT_LOCATION = payload.params.SHOOT_LOCATION || 'Denton, TX';
    }
    return body;
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
    if (!document.getElementById('crewEmailArchiveList')) {
      const templateGrid = document.querySelector('#hub-email .template-grid');
      if (templateGrid) {
        templateGrid.insertAdjacentHTML('afterend', '<div class="hub-section-label" style="margin-top:32px;">SENT EMAIL ARCHIVE</div><div class="email-archive-list" id="crewEmailArchiveList"></div>');
      }
    }
    if (!document.getElementById('crewLiveFixArchiveStyle')) {
      document.head.insertAdjacentHTML('beforeend', '<style id="crewLiveFixArchiveStyle">.email-archive-list{display:grid;gap:8px}.archive-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:10px 12px;background:var(--surface2);border:1px solid var(--borderdim);border-radius:var(--r)}.archive-row strong{display:block;color:var(--text);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.archive-row span,.archive-row>div:last-child{color:var(--muted);font-size:10px;line-height:1.45}</style>');
    }
    renderArchive();
  }

  function renderArchive() {
    const list = document.getElementById('crewEmailArchiveList');
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

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = endpointUrl(input);
    if (url.includes('/.netlify/functions/brevo-proxy') && init && init.body) {
      let body;
      try { body = JSON.parse(init.body); } catch {}
      if (body?.payload) {
        body = await enrichCrewParams(body);
        init = { ...init, body: JSON.stringify(body) };
      }
      const res = await rawFetch(input, init);
      if (res.ok && body?.payload) {
        archive({
          from: body.payload.sender?.email,
          to: body.payload.to?.[0]?.email,
          subject: body.payload.subject,
          templateId: body.payload.templateId,
          name: body.payload.params?.NAME,
        });
      }
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
    if (btn) setTimeout(() => repairTabs(btn.dataset.hub), 0);
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureArchive();
    const active = document.querySelector('.hub-btn.active[data-hub]');
    if (active) repairTabs(active.dataset.hub);
  });
})();