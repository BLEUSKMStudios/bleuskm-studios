(function () {
  // Final layer intentionally stays light. The working portal behavior lives in
  // castingdash-live-fixes.js; this file only prevents older cached markup from
  // showing controls that were removed from the casting portal.
  function installGuardStyles() {
    if (document.getElementById('castingFinalGuardStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="castingFinalGuardStyles">
      .hub-btn[data-hub="admin"],
      #hub-email .compose-quickform,
      #contractsList,
      #hub-contracts > .hub-inner > .contracts-tabs:not(.old-contract-tabs) {
        display: none !important;
      }
      .repair-actions button,
      .contact-card-actions button,
      .portal-row-actions button,
      .tc-send-btn {
        min-height: 0 !important;
        background: transparent !important;
        border: 0 !important;
        border-bottom: 1px solid rgba(218,175,55,.45) !important;
        color: var(--gold) !important;
        font-size: 9px !important;
        letter-spacing: .12em !important;
        padding: 3px 1px !important;
      }
    </style>`);
  }

  function removeLegacyControls() {
    document.querySelectorAll('.hub-btn[data-hub="admin"]').forEach((button) => button.remove());
    document.querySelectorAll('#castingCardsGrid [data-open-app]').forEach((button) => {
      if (button.textContent.trim().toLowerCase() === 'open') button.remove();
    });
    document.querySelectorAll('#contactsGrid [data-contract-link]').forEach((button) => button.remove());
  }

  function txt(value) {
    if (Array.isArray(value)) return value.map(txt).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
    return String(value || '').trim();
  }

  function isFinalRound(record) {
    return txt(record?.fields?.['Self Tape Status']).toLowerCase() === 'selected for final round';
  }

  function ensureSelfTapeTemplateOption() {
    const select = document.getElementById('emailModalTemplate');
    if (!select || select.querySelector('option[value="15"]')) return;
    const option = document.createElement('option');
    option.value = '15';
    option.textContent = 'T15 - Self Tape Invitation';
    const firstReal = select.querySelector('option[value="16"]');
    select.insertBefore(option, firstReal || null);
  }

  function installCallbackTemplateGuard() {
    ensureSelfTapeTemplateOption();
    if (window.__bleuskmCallbackTemplateGuard) return;
    window.__bleuskmCallbackTemplateGuard = true;

    const originalOpen = window.openEmailModal;
    if (typeof originalOpen === 'function') {
      window.openEmailModal = function guardedOpenEmailModal(record) {
        window.__bleuskmActiveEmailRecord = record;
        originalOpen(record);
        ensureSelfTapeTemplateOption();
        const status = txt(record?.fields?.['Casting Status']);
        const select = document.getElementById('emailModalTemplate');
        const filmField = document.getElementById('emailFilmField');
        const roleField = document.getElementById('emailRoleField');
        if (status === 'Callback' && select) select.value = '15';
        if (select?.value === '15') {
          filmField?.classList.add('hidden');
          roleField?.classList.add('hidden');
        }
        if (select?.value === '19' && !isFinalRound(record)) select.value = '15';
      };
    }

    document.addEventListener('click', (event) => {
      const sendModal = event.target.closest('#emailModalSend');
      if (sendModal) {
        const select = document.getElementById('emailModalTemplate');
        if (select?.value === '19' && !isFinalRound(window.__bleuskmActiveEmailRecord)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          alert('Final Callback + Calendly is locked until Self Tape Status is Selected for Final Round. Use T15 Self Tape Invitation for Callback.');
        }
      }

      const batchSend = event.target.closest('#batchSendBtn, #repairBatchSend');
      if (batchSend) {
        const select = document.getElementById('batchTemplateSelect') || document.getElementById('repairBatchTemplate');
        if (select?.value !== '19') return;
        const boxes = Array.from(document.querySelectorAll('.row-check:checked, .app-check:checked'));
        const unsafe = boxes.some((box) => !/selected for final round|selected/i.test(box.closest('tr, article')?.textContent || ''));
        if (unsafe) {
          event.preventDefault();
          event.stopImmediatePropagation();
          alert('T19 Calendly can only be sent after Self Tape Status is Selected for Final Round. Send T15 Self Tape Invitation to Callback applicants.');
        }
      }
    }, true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    installGuardStyles();
    removeLegacyControls();
    installCallbackTemplateGuard();
    setInterval(removeLegacyControls, 1500);
    setInterval(ensureSelfTapeTemplateOption, 1500);
  });
})();
