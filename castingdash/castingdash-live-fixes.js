(function () {
  const A = '/.netlify/functions/airtable-proxy';
  const B = '/.netlify/functions/brevo-proxy';
  const DEADLINE = 'June 20th, 2026';
  const PROJECT = 'The Final Hand';
  const groups = {
    cast: [['cast', 'Cast Agreement', 'ALL speaking roles, leads, supporting cast.', 'cast', ''], ['talent_release', 'Talent Release', 'Background actors, extras, anyone on camera without a full contract.', 'talent_release', ''], ['actor_deal_memo', 'Actor Deal Memo', 'Quick confirmations before a full contract or last-minute casting.', 'custom', 'Actor Deal Memo: This short-form memo confirms the performer is booked for the project, role, basic schedule expectations, credit, communication duties, and that a full agreement may follow.'], ['self_tape', 'Self-Tape Agreement', 'Callbacks and audition footage permission.', 'custom', 'Self-Tape Agreement: Performer grants BLEUSKM Studios permission to receive, review, store, and internally share audition/self-tape footage for casting decisions related to this production.']],
    crew: [['crew', 'Crew Agreement', 'Confirmed on-set crew.', 'crew', ''], ['contractor', 'Contractor Agreement', 'Remote roles, freelancers, graphics, admin, non-set collaborators.', 'custom', 'Independent Contractor Agreement: Contractor provides agreed services as an independent contractor, controls their method of work, grants BLEUSKM Studios rights to use delivered work for the project, and confirms no employment relationship is created.']],
    production: [['location', 'Location Release', 'Any filming location.', 'location', ''], ['media', 'Media Release (BTS)', 'Behind-the-scenes photography, video, and promo capture.', 'custom', 'Media Release: Contributor grants BLEUSKM Studios permission to use behind-the-scenes photography, video, audio, and related media for promotion, press, social media, festival materials, archival use, and distribution connected to the project.']],
    post: [['editor', 'Editor Agreement', 'Picture editor or post-production editor.', 'custom', 'Editor Agreement: Editor agrees to provide editing services and grants BLEUSKM Studios rights to use the edited work, project files, exports, and deliverables for completion, distribution, promotion, and archival purposes.'], ['composer', 'Composer Agreement', 'Original music and music-rights clearance.', 'composer', '']]
  };
  const $ = (id) => document.getElementById(id);
  const tx = (v) => Array.isArray(v) ? v.map(tx).filter(Boolean).join(', ') : (v && typeof v === 'object' ? (v.name || v.url || v.filename || '') : String(v ?? '').trim());
  const esc = (v) => tx(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function records(table) { const r = await fetch(`${A}?table=${encodeURIComponent(table)}`); return r.ok ? (await r.json()).records || [] : []; }
  function css() {
    if ($('castingFinalPolishCss')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="castingFinalPolishCss">
      .casting-card-grid,.agreement-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))!important;gap:12px!important}.casting-card,.agreement-card{background:var(--surface2,#111)!important;border:1px solid var(--borderdim)!important;border-radius:6px!important;padding:16px!important;color:var(--text)!important;text-align:left!important}.casting-card-main{display:block!important;width:100%!important;background:transparent!important;border:0!important;padding:0!important;color:inherit!important;text-align:left!important;text-transform:none!important;letter-spacing:0!important;min-height:0!important}.casting-card strong,.agreement-card strong{display:block!important;color:var(--text)!important;font-size:15px!important;letter-spacing:0!important;text-transform:none!important}.casting-card span,.agreement-card span{display:block!important;color:var(--muted)!important;font-size:12px!important;line-height:1.45!important;margin-top:7px!important;letter-spacing:0!important;text-transform:none!important}.casting-card-status{display:inline-block!important;width:max-content!important;color:var(--gold)!important;border:1px solid rgba(218,175,55,.34)!important;padding:4px 6px!important;font-size:8px!important;letter-spacing:.13em!important;text-transform:uppercase!important}.casting-card-actions,.contact-card-actions,.portal-row-actions{display:flex!important;gap:6px!important;flex-wrap:wrap!important;margin-top:12px!important}.casting-card-actions button,.contact-card-actions button,.portal-row-actions button,.agreement-card,.calendar-pill{min-height:0!important;background:transparent!important;border:1px solid rgba(218,175,55,.35)!important;color:var(--gold)!important;font-family:var(--font,inherit)!important;font-size:9px!important;font-weight:700!important;line-height:1!important;letter-spacing:.14em!important;text-transform:uppercase!important;padding:8px 10px!important;cursor:pointer!important}.danger{color:#ff8b8b!important;border-color:rgba(255,139,139,.45)!important}.agreement-card span{text-transform:none!important;letter-spacing:0!important;font-weight:400!important}.calendar-grid{display:grid!important;grid-template-columns:repeat(7,minmax(118px,1fr))!important;gap:1px!important;background:var(--borderdim)!important;border:1px solid var(--borderdim)!important;overflow-x:auto!important}.calendar-head,.calendar-day{background:var(--surface2,#111)!important;padding:8px!important}.calendar-head{min-height:0!important;color:var(--gold)!important;text-align:center!important;font-size:9px!important;letter-spacing:.14em!important;text-transform:uppercase!important}.calendar-day{min-height:112px!important;cursor:pointer!important}.calendar-day:hover{outline:1px solid rgba(218,175,55,.38);outline-offset:-1px}.calendar-day.muted{opacity:.35}.calendar-date{font-size:10px!important;color:var(--muted)!important;margin-bottom:7px!important}.calendar-pill{display:block!important;width:100%!important;background:rgba(218,175,55,.05)!important;color:var(--text)!important;text-align:left!important;letter-spacing:0!important;text-transform:none!important;line-height:1.25!important;margin:4px 0!important}.calendar-pill span{display:block!important;color:var(--muted)!important;font-size:8px!important;margin-top:3px!important}
    </style>`);
    document.head.insertAdjacentHTML('beforeend', '<style>.admin-locks-hidden{display:none!important}</style>');
  }
  function activeFilter() { return document.querySelector('.filter-btn.active')?.dataset.filter || 'All'; }
  async function renderApps() {
    const wrap = $('tableWrap'), main = document.querySelector('#hub-applications .dash-main');
    if (!wrap || !main) return;
    wrap.classList.add('hidden');
    let grid = $('castingCardsGrid');
    if (!grid) { grid = document.createElement('div'); grid.id = 'castingCardsGrid'; grid.className = 'casting-card-grid'; main.appendChild(grid); }
    const q = tx($('searchInput')?.value).toLowerCase();
    let rows = await records('Casting Submissions');
    rows = rows.filter((r) => {
      const f = r.fields || {}, status = tx(f['Casting Status']);
      return (activeFilter() === 'All' || activeFilter() === status) && (!q || [f.Name, f.Email, f.Role, status, f.Location].map(tx).join(' ').toLowerCase().includes(q));
    });
    window.__castingCardRecords = rows;
    grid.innerHTML = rows.map((r) => {
      const f = r.fields || {}, name = tx(f.Name) || 'Applicant', email = tx(f.Email), role = tx(f['To Role']) || tx(f.Role), status = tx(f['Casting Status']) || 'Pending', self = tx(f['Self Tape URL']) ? 'Self tape submitted' : 'No self tape';
      return `<article class="casting-card"><button type="button" class="casting-card-main" data-polish-open="${esc(r.id)}"><strong>${esc(name)}</strong><span>${esc(role || 'Role not set')}</span><span>${esc(email)}</span><span class="casting-card-status">${esc(status)} - ${esc(self)}</span></button><div class="casting-card-actions">${email ? `<button data-direct-email="${esc(email)}" data-direct-name="${esc(name)}">Email</button>` : ''}<button data-polish-open="${esc(r.id)}">Open</button></div></article>`;
    }).join('') || '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No submissions match.</p>';
  }
  function openApplicant(id) {
    const r = (window.__castingCardRecords || []).find((x) => x.id === id); if (!r) return;
    const f = r.fields || {}, keys = ['Name', 'Email', 'Location', 'Role', 'To Role', 'Casting Status', 'Cast Status', 'Self Tape Status', 'Self Tape URL', 'Callback/Redirect', 'Notes'];
    const details = keys.map((k) => tx(f[k]) ? `<div><small>${esc(k)}</small>${k.includes('URL') ? `<a href="${esc(tx(f[k]))}" target="_blank" rel="noopener">${esc(tx(f[k]))}</a>` : esc(tx(f[k]))}</div>` : '').join('');
    document.body.insertAdjacentHTML('beforeend', `<div class="casting-modal"><div class="casting-modal-card"><button class="casting-modal-close" data-close-cast>&times;</button><h2>${esc(tx(f.Name) || 'Applicant')}</h2><div class="casting-detail-grid">${details}</div><div class="casting-card-actions">${tx(f.Email) ? `<button data-direct-email="${esc(tx(f.Email))}" data-direct-name="${esc(tx(f.Name))}">Email</button><button data-template-person="${esc(tx(f.Email))}" data-template-id="15">Self Tape T15</button><button data-template-person="${esc(tx(f.Email))}" data-template-id="16">Rejection T16</button><button data-template-person="${esc(tx(f.Email))}" data-template-id="17">Redirect T17</button><button data-template-person="${esc(tx(f.Email))}" data-template-id="18">Offer T18</button><button data-template-person="${esc(tx(f.Email))}" data-template-id="19">Callback T19</button>` : ''}</div></div></div>`);
  }
  async function sendTemplate(email, id) {
    const res = await fetch(B, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://api.brevo.com/v3/smtp/email', payload: { sender: { email: 'casting@bleuskm.com', name: 'BLEUSKM Studios' }, to: [{ email }], templateId: Number(id), params: { DEADLINE } } }) });
    alert(res.ok ? `Template T${id} sent.` : 'Template send failed.');
  }
  function selectedGroup() { return document.querySelector('.agreement-tab.active')?.dataset.group || 'cast'; }
  function renderAgreements() {
    const tabs = document.querySelector('#hub-contracts .contracts-tabs'); if (!tabs) return;
    tabs.classList.add('old-contract-tabs');
    if (!$('agreementGrid')) tabs.insertAdjacentHTML('afterend', `<div class="agreement-tabs"><button class="contracts-tab agreement-tab active" data-group="cast">Cast</button><button class="contracts-tab agreement-tab" data-group="crew">Crew</button><button class="contracts-tab agreement-tab" data-group="production">Production</button><button class="contracts-tab agreement-tab" data-group="post">Post</button></div><div class="agreement-grid" id="agreementGrid"></div>`);
    document.querySelectorAll('.agreement-tab').forEach((b) => b.onclick = () => { document.querySelectorAll('.agreement-tab').forEach((x) => x.classList.remove('active')); b.classList.add('active'); renderAgreements(); });
    $('agreementGrid').innerHTML = (groups[selectedGroup()] || groups.cast).map((g) => `<button type="button" class="agreement-card" data-polish-agreement="${esc(g[0])}"><strong>${esc(g[1])}</strong><span>${esc(g[2])}</span></button>`).join('');
    const nb = $('newContractBtn');
    if (nb && !nb.dataset.polish) { const clone = nb.cloneNode(true); clone.dataset.polish = '1'; clone.onclick = (e) => { e.preventDefault(); openAgreement((groups[selectedGroup()] || groups.cast)[0][0]); }; nb.replaceWith(clone); }
  }
  function crewRole(f) { return tx(f['Preferred role by Director'] || f.Preferred_role_by_Director) || tx(f.Role); }
  async function renderCoreContacts() {
    const grid = $('contactsGrid'); if (!grid) return;
    const title = document.querySelector('#hub-contacts .hub-title'); if (title) title.textContent = 'Core Crew Contacts';
    const count = $('contactsCounts'), q = tx($('contactsSearch')?.value).toLowerCase();
    const rows = (await records('Crew applications')).filter((r) => tx(r.fields?.Status).toLowerCase() === 'core').filter((r) => !q || [r.fields?.Name, r.fields?.Email, crewRole(r.fields || {})].map(tx).join(' ').toLowerCase().includes(q));
    if (count) count.textContent = `${rows.length} core crew`;
    grid.innerHTML = rows.map((r) => { const f = r.fields || {}, name = tx(f.Name) || 'Crew Member', email = tx(f.Email), role = crewRole(f); return `<div class="contact-card"><div class="contact-card-name">${esc(name)}</div><div class="contact-card-detail">${esc(email)}${role ? `<br><span style="color:var(--golddim);font-size:9px">${esc(role)}</span>` : ''}</div><div class="contact-card-actions">${email ? `<button data-direct-email="${esc(email)}" data-direct-name="${esc(name)}">Email</button>` : ''}<button data-contract-link="${esc(`https://bleuskm.com/crew/contract?${new URLSearchParams({ name, email, role, film: PROJECT })}`)}">Copy Contract Link</button></div></div>`; }).join('') || '<p style="font-size:10px;color:var(--muted);padding:16px 0;">No Core crew contacts found.</p>';
  }
  async function renderNotes() {
    const list = $('portalNotesList'); if (!list) return;
    const rows = (await records('Portal Notes')).filter((r) => tx(r.fields?.Status || 'Open').toLowerCase() !== 'archived');
    list.innerHTML = rows.map((r) => `<div class="portal-note"><div class="portal-note-head"><div><strong>${esc(tx(r.fields?.Title) || 'Note')}</strong><small>${esc(tx(r.fields?.Author) || 'BLEUSKM')}</small></div><div class="portal-row-actions"><button data-note-edit="${esc(r.id)}">Edit</button><button class="danger" data-note-delete="${esc(r.id)}">Delete</button></div></div><p>${esc(tx(r.fields?.Note))}</p></div>`).join('') || '<p style="font-size:10px;color:var(--muted)">No notes yet.</p>';
  }
  function notesPanel() {
    const hub = $('hub-timeline'); if (!hub) return;
    if (!$('portalNotesList')) hub.querySelector('.hub-inner')?.insertAdjacentHTML('beforeend', `<div class="portal-notes-panel"><div class="hub-section-label">Production Notes</div><div id="portalNotesList" class="portal-notes-list"></div><div class="portal-note-compose"><input class="modal-input" id="portalNoteTitle" placeholder="Note title"><textarea class="modal-input" id="portalNoteBody" rows="3" placeholder="Leave a note for the team..."></textarea><button class="modal-save" id="portalNoteSave">Post Note</button></div></div>`);
    const b = $('portalNoteSave'); if (b && !b.dataset.polish) { b.dataset.polish = '1'; b.onclick = saveNote; }
    renderNotes();
  }
  async function saveNote() {
    const title = $('portalNoteTitle'), body = $('portalNoteBody'), b = $('portalNoteSave'), note = tx(body?.value), id = b?.dataset.editing || '';
    if (!note) return alert('Write a note first.');
    const payload = { table: 'Portal Notes', fields: { Title: tx(title?.value) || 'Production Note', Production: PROJECT, Author: sessionStorage.getItem('bleuskm_user') || localStorage.getItem('bleuskm_user') || 'Zaria', Audience: 'All', Note: note, Status: 'Open' } };
    if (id) payload.id = id;
    const r = await fetch(A, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) return alert('Could not save note.');
    title.value = ''; body.value = ''; delete b.dataset.editing; b.textContent = 'Post Note'; renderNotes();
  }
  async function editNote(id) {
    const r = (await records('Portal Notes')).find((x) => x.id === id); if (!r) return;
    $('portalNoteTitle').value = tx(r.fields?.Title); $('portalNoteBody').value = tx(r.fields?.Note); $('portalNoteSave').dataset.editing = id; $('portalNoteSave').textContent = 'Save Note';
  }
  async function deleteNote(id) {
    if (!confirm('Delete this note for everyone?')) return;
    await fetch(A, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'Portal Notes', id }) });
    renderNotes();
  }
  function hideLocks() {
    const grid = $('prodLocksGrid'); if (!grid) return;
    grid.classList.add('admin-locks-hidden'); let p = grid.previousElementSibling;
    while (p && !p.classList?.contains('hub-section-label')) { p.classList.add('admin-locks-hidden'); p = p.previousElementSibling; }
    if (p) p.classList.add('admin-locks-hidden');
  }
  function template(key) { return Object.values(groups).flat().find((x) => x[0] === key) || groups.cast[0]; }
  function openAgreement(key) {
    const g = template(key);
    if (typeof window.openContractModal === 'function') window.openContractModal(); else $('contractModal')?.classList.remove('hidden');
    setTimeout(() => {
      const sel = $('contractType'); if (sel) { sel.value = [...sel.options].some((o) => o.value === g[3]) ? g[3] : 'custom'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      setTimeout(() => { if ($('contractModalTitle')) $('contractModalTitle').textContent = g[1].toUpperCase(); if ($('contractTerms') && g[4]) $('contractTerms').value = g[4]; }, 60);
    }, 60);
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  async function renderCalendar() {
    const wrap = $('calendarWrap'), grid = $('calendarGrid'); if (!wrap || !grid) return;
    wrap.classList.remove('hidden');
    const rows = await records('Production Timeline');
    const firstDate = rows.map((r) => tx(r.fields?.['Start Date'])).find(Boolean);
    const base = firstDate ? new Date(`${firstDate}T12:00:00`) : new Date();
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1), start = new Date(monthStart); start.setDate(monthStart.getDate() - monthStart.getDay());
    if ($('calMonthLabel')) $('calMonthLabel').textContent = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="calendar-head">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) { const day = new Date(start); day.setDate(start.getDate() + i); const key = iso(day); const events = rows.filter((r) => tx(r.fields?.['Start Date']) === key); html += `<div class="calendar-day ${day.getMonth() === monthStart.getMonth() ? '' : 'muted'}" data-polish-date="${key}"><div class="calendar-date">${day.getDate()}</div>${events.map((r) => `<button class="calendar-pill" data-edit-event="${esc(r.id)}">${esc(tx(r.fields?.Phase) || 'Event')}<span>${esc(tx(r.fields?.Status) || 'Upcoming')}</span></button>`).join('')}</div>`; }
    grid.innerHTML = html;
  }
  function eventModalForDate(date) {
    document.body.insertAdjacentHTML('beforeend', `<div class="casting-modal"><div class="casting-modal-card"><button class="casting-modal-close" data-close-cast>&times;</button><h2>Add Event</h2><div class="modal-field"><label class="modal-label">TITLE</label><input class="modal-input" id="polishEvTitle"></div><div class="modal-row"><div class="modal-field"><label class="modal-label">START</label><input type="date" class="modal-input" id="polishEvStart" value="${esc(date)}"></div><div class="modal-field"><label class="modal-label">END</label><input type="date" class="modal-input" id="polishEvEnd" value="${esc(date)}"></div></div><div class="modal-field"><label class="modal-label">STATUS</label><select class="modal-input" id="polishEvStatus"><option>Upcoming</option><option>Active</option><option>Complete</option></select></div><div class="modal-field"><label class="modal-label">DESCRIPTION</label><textarea class="modal-input" id="polishEvDesc" rows="3"></textarea></div><div class="portal-row-actions"><button data-polish-save-event>Save</button></div></div></div>`);
  }
  async function savePolishEvent() {
    const fields = { Phase: tx($('polishEvTitle')?.value) || 'Untitled Event', 'Start Date': $('polishEvStart')?.value || null, 'End Date': $('polishEvEnd')?.value || null, Status: $('polishEvStatus')?.value || 'Upcoming', Description: tx($('polishEvDesc')?.value) };
    await fetch(A, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'Production Timeline', fields }) });
    document.querySelector('.casting-modal')?.remove();
    renderCalendar();
  }
  function resetCalendarButton() {
    const old = $('calendarToggleBtn'); if (!old || old.dataset.polish) return;
    const clone = old.cloneNode(true); clone.dataset.polish = '1'; clone.onclick = (e) => { e.preventDefault(); renderCalendar(); }; old.replaceWith(clone);
  }
  function boot() {
    css(); renderAgreements(); resetCalendarButton(); hideLocks();
    if (document.querySelector('#hub-applications.active')) renderApps();
    if (document.querySelector('#hub-contacts.active')) renderCoreContacts();
    if (document.querySelector('#hub-timeline.active')) { resetCalendarButton(); notesPanel(); }
  }
  document.addEventListener('DOMContentLoaded', () => { boot(); setTimeout(renderApps, 250); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.hub-btn[data-hub]')) setTimeout(() => { boot(); if (e.target.closest('[data-hub="applications"]')) renderApps(); if (e.target.closest('[data-hub="contacts"]')) renderCoreContacts(); }, 120);
    const card = e.target.closest('[data-polish-open]'); if (card) { e.preventDefault(); e.stopPropagation(); openApplicant(card.dataset.polishOpen); }
    const tmpl = e.target.closest('[data-template-person]'); if (tmpl) { e.stopPropagation(); sendTemplate(tmpl.dataset.templatePerson, tmpl.dataset.templateId); }
    const ag = e.target.closest('[data-polish-agreement]'); if (ag) { e.preventDefault(); e.stopPropagation(); openAgreement(ag.dataset.polishAgreement); }
    const day = e.target.closest('[data-polish-date]'); if (day && !e.target.closest('[data-edit-event]')) { e.preventDefault(); e.stopPropagation(); eventModalForDate(day.dataset.polishDate); }
    if (e.target.closest('[data-polish-save-event]')) { e.preventDefault(); e.stopPropagation(); savePolishEvent(); }
    const editN = e.target.closest('[data-note-edit]'); if (editN) editNote(editN.dataset.noteEdit);
    const delN = e.target.closest('[data-note-delete]'); if (delN) deleteNote(delN.dataset.noteDelete);
  }, true);
  document.addEventListener('input', (e) => { if (e.target?.id === 'searchInput') setTimeout(renderApps, 120); if (e.target?.id === 'contactsSearch') setTimeout(renderCoreContacts, 120); }, true);
  setInterval(boot, 1800);
})();
