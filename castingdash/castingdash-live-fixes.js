(function () {
  const rawFetch = window.fetch.bind(window);
  const A = '/.netlify/functions/airtable-proxy';
  const B = '/.netlify/functions/brevo-proxy';
  const DEADLINE = 'June 20th, 2026';
  const TYPES = {
    cast: 'Cast / Performer Agreement',
    location: 'Location Agreement',
    talent_release: 'Talent / Actor Release',
    background: 'Background Actor Release',
    composer: 'Composer / Music Release',
    custom: 'Custom Agreement',
  };

  const text = v => Array.isArray(v) ? v.map(text).filter(Boolean).join(', ') : (v && typeof v === 'object' ? (v.name || v.url || v.filename || '') : String(v ?? '').trim());
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const user = () => sessionStorage.getItem('bleuskm_user') || localStorage.getItem('bleuskm_user') || 'Zaria';

  async function table(name) {
    const res = await rawFetch(`${A}?table=${encodeURIComponent(name)}`);
    return res.ok ? (await res.json()).records || [] : [];
  }

  function contractLink(name, email, role) {
    return `https://bleuskm.com/crew/contract?${new URLSearchParams({
      name: name || '',
      email: email || '',
      role: role || '',
      film: 'The Final Hand',
    })}`;
  }

  function styles() {
    if (document.getElementById('castingOnlyFixStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="castingOnlyFixStyles">
      .hub-panel.active{display:block!important}.portal-note{background:var(--surface2,#111);border:1px solid var(--borderdim,rgba(255,255,255,.08));padding:14px;border-radius:6px}.portal-note-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.portal-note strong{display:block;color:var(--text);font-size:14px}.portal-note span{font-size:9px;color:var(--gold);text-transform:uppercase}.portal-note p{font-size:12px;color:var(--muted);line-height:1.55;margin-top:8px}.portal-row-actions{display:flex;gap:8px;flex-wrap:wrap}.portal-action,.portal-row-actions button,.portal-link-button{border:1px solid rgba(218,175,55,.35);background:transparent;color:var(--gold,#DAAF37);font:700 9px inherit;letter-spacing:.14em;text-transform:uppercase;padding:8px 10px;cursor:pointer}.portal-danger{color:#ff8b8b!important;border-color:rgba(255,139,139,.45)!important}.portal-notes-panel{margin-top:28px;border-top:1px solid var(--borderdim);padding-top:18px}.portal-notes-list{display:grid;gap:8px;margin-bottom:12px}.portal-note-compose{display:grid;gap:8px}.contract-builder-hint{font-size:10px;color:var(--muted);line-height:1.5;margin:10px 0}.contracts-tab[data-tab="crew"],#contractType option[value="crew"]{display:none!important}
    </style>`);
  }

  function repairTabs(hub) {
    document.querySelectorAll('.hub-panel').forEach(panel => {
      const active = panel.id === `hub-${hub}`;
      panel.classList.toggle('active', active);
      panel.classList.toggle('hidden', !active);
    });
  }

  function activeContractType() {
    const tab = document.querySelector('.contracts-tab.active')?.dataset.tab;
    return tab && tab !== 'crew' ? tab : 'cast';
  }

  function removeCrewContractTab() {
    document.querySelectorAll('.contracts-tab[data-tab="crew"], #contractType option[value="crew"]').forEach(el => el.remove());
    const active = document.querySelector('.contracts-tab.active');
    if (!active || active.dataset.tab === 'crew') {
      const cast = document.querySelector('.contracts-tab[data-tab="cast"]');
      cast?.classList.add('active');
      window.activeContractTab = 'cast';
    }
  }

  function setContractType(type) {
    const safeType = TYPES[type] ? type : 'cast';
    const select = document.getElementById('contractType');
    if (select) {
      select.value = safeType;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const title = document.getElementById('contractModalTitle');
    if (title) title.textContent = TYPES[safeType].toUpperCase();
    const hint = document.getElementById('castingContractHint') || document.createElement('p');
    hint.id = 'castingContractHint';
    hint.className = 'contract-builder-hint';
    hint.textContent = 'Enter the recipient name, role/position, and email here. The signing link they receive stamps those values into the contract so the recipient cannot edit them.';
    document.querySelector('.cmodal-infobar')?.insertAdjacentElement('afterend', hint);
  }

  function repairContractBuilder() {
    removeCrewContractTab();
    document.querySelectorAll('.contracts-tab').forEach(tab => {
      if (tab.dataset.castingFix) return;
      tab.dataset.castingFix = '1';
      tab.addEventListener('click', () => setTimeout(() => setContractType(activeContractType()), 50), true);
    });
    const btn = document.getElementById('newContractBtn');
    if (btn && !btn.dataset.castingFix) {
      btn.dataset.castingFix = '1';
      btn.addEventListener('click', () => setTimeout(() => setContractType(activeContractType()), 80), true);
    }
    const save = document.getElementById('contractSaveBtn');
    if (save && !save.dataset.castingLinkFix) {
      save.dataset.castingLinkFix = '1';
      save.insertAdjacentHTML('beforebegin', '<button class="modal-cancel" id="copyContractDirectLink" type="button">Copy Direct Link</button>');
      document.getElementById('copyContractDirectLink')?.addEventListener('click', async () => {
        const name = text(document.getElementById('contractName')?.value);
        const email = text(document.getElementById('contractEmail')?.value);
        const role = text(document.getElementById('contractRole')?.value);
        if (!name || !email) return alert('Enter a name and email first.');
        await navigator.clipboard?.writeText(contractLink(name, email, role));
        alert('Direct contract link copied.');
      });
    }
  }

  async function loadNotes() {
    const list = document.getElementById('portalNotesList');
    if (!list) return;
    const notes = (await table('Portal Notes')).filter(r => text(r.fields?.Status || 'Open').toLowerCase() !== 'archived');
    list.innerHTML = notes.length ? notes.map(r => {
      const f = r.fields || {};
      return `<div class="portal-note" data-note-id="${esc(r.id)}">
        <div class="portal-note-head">
          <div><strong>${esc(text(f.Title) || 'Note')}</strong><span>${esc(text(f.Author) || 'BLEUSKM')}</span></div>
          <div class="portal-row-actions"><button type="button" data-edit-note="${esc(r.id)}">Edit</button><button type="button" class="portal-danger" data-delete-note="${esc(r.id)}">Delete</button></div>
        </div>
        <p>${esc(text(f.Note))}</p>
      </div>`;
    }).join('') : '<p style="font-size:10px;color:var(--muted);">No notes yet.</p>';
  }

  async function saveNote() {
    const titleEl = document.getElementById('portalNoteTitle');
    const bodyEl = document.getElementById('portalNoteBody');
    const id = document.getElementById('portalNoteSave')?.dataset.editingNote || '';
    const note = text(bodyEl?.value);
    if (!note) return alert('Write a note first.');
    const payload = { table: 'Portal Notes', fields: { Title: text(titleEl?.value) || 'Production Note', Production: 'The Final Hand', Author: user(), Audience: 'All', Note: note, Status: 'Open' } };
    if (id) payload.id = id;
    const res = await rawFetch(A, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) return alert('Could not save note. Check Airtable connection.');
    titleEl.value = '';
    bodyEl.value = '';
    delete document.getElementById('portalNoteSave').dataset.editingNote;
    document.getElementById('portalNoteSave').textContent = 'Post Note';
    loadNotes();
  }

  async function editNote(id) {
    const rec = (await table('Portal Notes')).find(r => r.id === id);
    if (!rec) return;
    document.getElementById('portalNoteTitle').value = text(rec.fields?.Title);
    document.getElementById('portalNoteBody').value = text(rec.fields?.Note);
    const save = document.getElementById('portalNoteSave');
    save.dataset.editingNote = id;
    save.textContent = 'Save Note';
    document.getElementById('portalNoteBody').focus();
  }

  async function deleteNote(id) {
    if (!confirm('Delete this note for everyone?')) return;
    const res = await rawFetch(A, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'Portal Notes', id }) });
    if (!res.ok) return alert('Could not delete note. Check Airtable connection.');
    loadNotes();
  }

  function ensureNotesPanel() {
    const hub = document.getElementById('hub-timeline');
    if (!hub) return;
    if (!document.getElementById('portalNotesList')) {
      hub.querySelector('.hub-inner')?.insertAdjacentHTML('beforeend', `<div class="portal-notes-panel">
        <div class="hub-section-label">PRODUCTION NOTES</div>
        <div id="portalNotesList" class="portal-notes-list"></div>
        <div class="portal-note-compose"><input class="modal-input" id="portalNoteTitle" placeholder="Note title" /><textarea class="modal-input" id="portalNoteBody" rows="3" placeholder="Leave a note for the team..."></textarea><button class="modal-save" id="portalNoteSave">Post Note</button></div>
      </div>`);
    }
    const save = document.getElementById('portalNoteSave');
    if (save && !save.dataset.bound) {
      save.dataset.bound = '1';
      save.addEventListener('click', saveNote);
    }
    loadNotes();
  }

  async function findCastingByEmail(email) {
    return (await table('Casting Submissions')).find(r => text(r.fields?.Email).toLowerCase() === email.toLowerCase());
  }

  function selfTapeUrl(f, id) {
    return `https://bleuskm.com/selftape?${new URLSearchParams({ id, name: text(f.Name), email: text(f.Email), role: text(f['To Role']) || text(f.Role), film: text(f.Film) || 'The Final Hand' })}`;
  }

  async function enrichCasting(body) {
    const payload = body.payload || {};
    const templateId = Number(payload.templateId);
    if (![15, 16, 17, 18, 19].includes(templateId)) return body;
    const email = text(payload.to?.[0]?.email);
    const rec = await findCastingByEmail(email);
    if (!rec) return body;
    const f = rec.fields || {};
    payload.params = { ...(payload.params || {}), NAME: text(f.Name), EMAIL: email, ROLE: text(f['To Role']) || text(f.Role), FILM_NAME: text(f.Film) || 'The Final Hand', DEADLINE };
    if (templateId === 15 || templateId === 19) payload.params.SELFTAPE_URL = payload.params.SELFTAPE_URL || selfTapeUrl(f, rec.id);
    return body;
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/.netlify/functions/brevo-proxy') && init.body) {
      let body;
      try { body = JSON.parse(init.body); } catch {}
      if (body?.payload) init = { ...init, body: JSON.stringify(await enrichCasting(body)) };
    }
    return rawFetch(input, init);
  };

  document.addEventListener('click', event => {
    const hub = event.target.closest('.hub-btn[data-hub]');
    if (hub) setTimeout(() => {
      repairTabs(hub.dataset.hub);
      repairContractBuilder();
      if (hub.dataset.hub === 'timeline') ensureNotesPanel();
      if (hub.dataset.hub === 'contracts') repairContractBuilder();
    }, 0);
    const edit = event.target.closest('[data-edit-note]');
    if (edit) editNote(edit.dataset.editNote);
    const del = event.target.closest('[data-delete-note]');
    if (del) deleteNote(del.dataset.deleteNote);
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    styles();
    repairContractBuilder();
    const active = document.querySelector('.hub-btn.active[data-hub]');
    if (active) repairTabs(active.dataset.hub);
    if (document.getElementById('hub-timeline')?.classList.contains('active')) ensureNotesPanel();
  });
  setInterval(repairContractBuilder, 1000);
})();