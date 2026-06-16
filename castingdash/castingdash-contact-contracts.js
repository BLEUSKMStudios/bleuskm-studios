/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Contact Contract Link Fix
   castingdash-contact-contracts.js

   Overrides openContractForContact() so that clicking CONTRACT
   on any contact card copies that person's direct signing link
   instead of opening the full contract-builder modal.

   Contract URL format:
     https://bleuskm.com/crew/contract/?name=...&email=...&role=...&film=...

   Role resolution (already done in renderContacts before this runs):
     • Crew  → "Preferred role by Director" if set, else "Role" field
     • Cast  → "Role" from their casting submission

   Load order (index.html):
     1. castingdash.js          (defines openContractForContact)
     2. castingdash-live-fixes.js
     3. castingdash-contact-contracts.js   ← this file (overrides it)
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const CONTRACT_BASE = 'https://bleuskm.com/crew/contract/';
  const FILM_DEFAULT  = 'The Final Hand';

  /* ── Helpers ─────────────────────────────────────────────── */
  function escHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
    );
  }

  function buildLink(name, email, role, film) {
    return CONTRACT_BASE + '?' + new URLSearchParams({
      name:  name  || '',
      email: email || '',
      role:  role  || '',
      film:  film  || FILM_DEFAULT,
    }).toString();
  }

  /* ── Link modal ──────────────────────────────────────────── */
  function showLinkModal(name, url, alreadyCopied) {
    const old = document.getElementById('_bskm_clink_overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = '_bskm_clink_overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,.74)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'z-index:99999', 'font-family:inherit',
    ].join(';');

    overlay.innerHTML = `
      <div style="
        background:var(--surface,#141414);
        border:1px solid var(--border,#2a2a2a);
        border-radius:8px; padding:28px 24px;
        max-width:560px; width:92%;
        box-shadow:0 20px 60px rgba(0,0,0,.65);
      ">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px;">
          <div>
            <div style="font-size:9px;letter-spacing:.14em;color:var(--muted,#666);text-transform:uppercase;margin-bottom:5px;">
              CONTRACT LINK
            </div>
            <div style="font-size:13px;color:var(--text,#e8e8e8);font-weight:600;">${escHtml(name)}</div>
          </div>
          <button id="_bskm_clink_x"
            style="background:none;border:none;color:var(--muted,#666);cursor:pointer;font-size:22px;line-height:1;padding:0;flex-shrink:0;"
            aria-label="Close">&times;</button>
        </div>

        <!-- Copied banner -->
        ${alreadyCopied ? `
          <div style="font-size:10px;color:#5cb85c;letter-spacing:.08em;margin-bottom:12px;">
            &#10003; COPIED TO CLIPBOARD
          </div>` : ''}

        <!-- Link field -->
        <input id="_bskm_clink_field" readonly value="${escHtml(url)}"
          style="
            width:100%; background:var(--surface2,#0d0d0d);
            border:1px solid var(--border,#2a2a2a);
            color:var(--text,#e8e8e8); padding:10px 12px;
            border-radius:4px; font-size:10px; font-family:monospace;
            box-sizing:border-box; cursor:text;
          ">

        <!-- Hint -->
        <div style="font-size:9px;color:var(--muted,#666);margin-top:8px;letter-spacing:.04em;">
          Send this link to ${escHtml(name.split(' ')[0])} — they sign directly at bleuskm.com/crew/contract
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
          <button id="_bskm_clink_copy"
            style="
              background:var(--gold,#c9a84c); color:#000; border:none;
              padding:9px 20px; border-radius:4px; cursor:pointer;
              font-size:10px; letter-spacing:.1em; font-weight:700;
              text-transform:uppercase;
            ">Copy Link</button>
          <button id="_bskm_clink_close"
            style="
              background:none; border:1px solid var(--border,#2a2a2a);
              color:var(--muted,#888); padding:9px 18px;
              border-radius:4px; cursor:pointer; font-size:10px; letter-spacing:.08em;
            ">Close</button>
        </div>
      </div>`;

    /* Copy button */
    overlay.querySelector('#_bskm_clink_copy').addEventListener('click', function () {
      const field = overlay.querySelector('#_bskm_clink_field');
      (navigator.clipboard
        ? navigator.clipboard.writeText(url)
        : Promise.reject()
      ).catch(() => { field.select(); document.execCommand('copy'); });

      this.textContent = 'Copied!';
      this.style.background = '#5cb85c';
      setTimeout(() => {
        if (overlay.isConnected) {
          this.textContent = 'Copy Link';
          this.style.background = '';
        }
      }, 2400);
    });

    /* Close */
    function close() { overlay.remove(); }
    overlay.querySelector('#_bskm_clink_x').addEventListener('click', close);
    overlay.querySelector('#_bskm_clink_close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });

    document.body.appendChild(overlay);
    /* Pre-select so Ctrl+C also works */
    overlay.querySelector('#_bskm_clink_field').select();
  }

  /* ── Core override ───────────────────────────────────────── */
  function installOverride() {
    window.openContractForContact = function (name, email, role, type) {
      /*
        role is already the effective role:
          • crew → "Preferred role by Director" if set, else "Role" (resolved in renderContacts)
          • cast → "Role" from their casting submission
        film defaults to "The Final Hand" for all contacts in this dash.
      */
      const url = buildLink(name, email, role, FILM_DEFAULT);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => showLinkModal(name, url, true))
          .catch(() => showLinkModal(name, url, false));
      } else {
        showLinkModal(name, url, false);
      }
    };
  }

  /* Run after castingdash.js has defined the original function */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installOverride);
  } else {
    installOverride();
  }

})();
