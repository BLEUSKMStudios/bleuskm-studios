(function () {
  const ARCHIVE_KEY = 'bleuskm_casting_email_archive';
  const rawFetch = window.fetch.bind(window);
  const AIRTABLE = '/.netlify/functions/airtable-proxy';

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

  function normalizeStatus(value) {
    const status = text(value);
    return status.toLowerCase() === 'core' ? 'Core' : status;
  }

  function endpointUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function tableCacheKey(table) {
    return `bleuskm_airtable_cache:${table}`;
  }

  function readCachedTable(table) {
    try {
      const cached = JSON.parse(localStorage.getItem(tableCacheKey(table)) || 'null');
      return Array.isArray(cached?.records) ? cached.records : [];
    } catch {
      return [];
    }
  }

  function writeCachedTable(table, records) {
    if (!Array.isArray(records) || !records.length) return;
    try {
      localStorage.setItem(tableCacheKey(table), JSON.stringify({ savedAt: new Date().toISOString(), records }));
    } catch {}
  }

  function tableResponse(table, records, status = 200) {
    return new Response(JSON.stringify({ records, cached: true }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function getAirtableRecords(table) {
    const res = await rawFetch(`${AIRTABLE}?table=${encodeURIComponent(table)}`);
    if (!res.ok) return readCachedTable(table);
    const data = await res.json().catch(() => ({}));
    const records = data.records || [];
    if (records.length) writeCachedTable(table, records);
    return records;
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
      document.head.insertAdjacentHTML('beforeend', '<style id="liveFixArchiveStyle">.email-archive-list{display:grid;gap:8px}.archive-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:10px 12px;background:var(--surface2);border:1px solid var(--borderdim);border-radius:var(--r)}.archive-row strong{display:block;color:var(--text);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.archive-row span,.archive-row>div:last-child{color:var(--muted);font-size:10px;line-height:1.45}</style>');
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

  /**
   * Find a casting submission by email.
   * PRIORITY ORDER:
   * 1. window.allRecords — already loaded by castingdash.js, zero network cost
   * 2. localStorage cache — from a prior successful session
   * 3. Network fetch — only if both above are empty
   */
  async function findCastingByEmail(email) {
    if (!email) return null;
    const emailLower = email.toLowerCase();

    // 1. Use in-memory records loaded by castingdash.js (no network call)
    if (Array.isArray(window.allRecords) && window.allRecords.length) {
      return window.allRecords.find(r => text(r.fields?.Email).toLowerCase() === emailLower) || null;
    }

    // 2. Fall back to localStorage cache
    const cached = readCachedTable('Casting Submissions');
    if (cached.length) {
      return cached.find(r => text(r.fields?.Email).toLowerCase() === emailLower) || null;
    }

    // 3. Last resort: fetch (proxy cache handles deduplication)
    const rows = await getAirtableRecords('Casting Submissions');
    return rows.find(r => text(r.fields?.Email).toLowerCase() === emailLower) || null;
  }

  function consentUrl(id, answer, film) {
    return `https://bleuskm.com/redirect-response?id=${encodeURIComponent(id)}&response=${answer}&film=${encodeURIComponent(film || 'The Final Hand')}`;
  }

  function selfTapeUrl(f, id) {
    const qs = new URLSearchParams({ name: text(f.Name), role: text(f.Role), email: text(f.Email), id });
    return `https://bleuskm.com/selftape?${qs.toString()}`;
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
    payload.params = {
      ...(payload.params || {}),
      NAME: text(f.Name),
      EMAIL: to,
      PHONE: text(f.Phone),
      LOCATION: text(f.Location),
      ROLE: role,
      FILM_NAME: film,
    };
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

    if (url.includes('/.netlify/functions/airtable-proxy') && (!init.method || init.method === 'GET')) {
      const parsed = new URL(url, window.location.href);
      const table = parsed.searchParams.get('table');
      const cached = table ? readCachedTable(table) : [];

      let res = await rawFetch(input, init);

      // 429 with no local cache: wait out Airtable's ~30s rate-limit window, then retry.
      // Proxy already retried for ~8s internally; we add two more tries at 25s and 35s.
      if (res.status === 429 && !cached.length) {
        for (const delay of [25000, 35000]) {
          await new Promise(r => setTimeout(r, delay));
          // If another parallel request already populated the cache while we waited, use it.
          const nowCached = table ? readCachedTable(table) : [];
          if (nowCached.length) return tableResponse(table, nowCached);
          res = await rawFetch(input, init);
          if (res.ok || res.status !== 429) break;
        }
      }

      if (!res.ok && cached.length) return tableResponse(table, cached);
      if (res.ok && table) {
        const data = await res.clone().json().catch(() => ({}));
        let records = data.records || [];
        if (table === 'Crew applications') records = records.map(normalizeCrewRecord);
        if (records.length) writeCachedTable(table, records);
        if (table === 'Crew applications') return tableResponse(table, records, res.status);
      }
      return res;
    }

    if (url.includes('/.netlify/functions/brevo-proxy') && init && init.body) {
      let body;
      try { body = JSON.parse(init.body); } catch {}
      if (body?.payload) {
        body = await enrichCastingParams(body);
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

    return rawFetch(input, init);
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
