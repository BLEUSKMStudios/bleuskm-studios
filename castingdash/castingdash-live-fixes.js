(function () {
  const rawFetch = window.fetch.bind(window);

  function text(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return value.name || value.url || value.filename || '';
    return String(value ?? '').trim();
  }

  function addOption(select, value, label, beforeValue) {
    if (!select || select.querySelector(`option[value="${value}"]`)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    const before = beforeValue ? select.querySelector(`option[value="${beforeValue}"]`) : null;
    select.insertBefore(option, before || null);
  }

  function ensureTemplate15Controls() {
    addOption(document.getElementById('batchTemplateSelect'), '15', 'T15 — Self Tape Invitation', '16');
    addOption(document.getElementById('repairBatchTemplate'), '15', 'T15 — Self Tape Invitation', '16');
    addOption(document.getElementById('emailModalTemplate'), '15', 'T15 — Self Tape Invitation', '16');

    const grid = document.querySelector('#hub-email .template-grid');
    if (grid && !grid.querySelector('[data-template-card="15"], .tc-num[data-template-num="15"]')) {
      grid.insertAdjacentHTML('afterbegin', `<div class="template-card" data-template-card="15">
        <div class="tc-num" data-template-num="15">T15</div>
        <div class="tc-name">Self Tape Invitation</div>
        <div class="tc-desc">Sent to callback applicants for the self-tape stage.</div>
        <button class="tc-send-btn" onclick="openBatchFromEmailHub(15)">Send to Selected</button>
      </div>`);
    }
  }

  function isFinalRoundRecord(record) {
    return text(record?.fields?.['Self Tape Status']).toLowerCase() === 'selected for final round';
  }

  function rowLooksFinalRound(node) {
    return /selected for final round|selected/i.test(node?.textContent || '');
  }

  function installTemplateGuards() {
    if (window.__bleuskmTemplate15LiveGuard) return;
    window.__bleuskmTemplate15LiveGuard = true;

    const originalOpenEmailModal = window.openEmailModal;
    if (typeof originalOpenEmailModal === 'function') {
      window.openEmailModal = function patchedOpenEmailModal(record) {
        window.__bleuskmActiveEmailRecord = record;
        originalOpenEmailModal(record);
        ensureTemplate15Controls();
        const select = document.getElementById('emailModalTemplate');
        const filmField = document.getElementById('emailFilmField');
        const roleField = document.getElementById('emailRoleField');
        if (text(record?.fields?.['Casting Status']) === 'Callback' && select) select.value = '15';
        if (select?.value === '15') {
          filmField?.classList.add('hidden');
          roleField?.classList.add('hidden');
        }
        if (select?.value === '19' && !isFinalRoundRecord(record)) select.value = '15';
      };
    }

    document.addEventListener('change', (event) => {
      const select = event.target.closest('#emailModalTemplate, #batchTemplateSelect, #repairBatchTemplate');
      if (!select || select.value !== '19') return;
      const active = window.__bleuskmActiveEmailRecord;
      if (select.id === 'emailModalTemplate' && active && !isFinalRoundRecord(active)) {
        select.value = '15';
        alert('T19 Calendly is locked until Self Tape Status is Selected for Final Round. Use T15 Self Tape Invitation for Callback.');
      }
    }, true);

    document.addEventListener('click', (event) => {
      const sendModal = event.target.closest('#emailModalSend');
      if (sendModal) {
        const select = document.getElementById('emailModalTemplate');
        if (select?.value === '19' && !isFinalRoundRecord(window.__bleuskmActiveEmailRecord)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          alert('T19 Calendly is locked until Self Tape Status is Selected for Final Round. Use T15 Self Tape Invitation for Callback.');
          return;
        }
      }

      const batchSend = event.target.closest('#batchSendBtn, #repairBatchSend');
      if (batchSend) {
        const select = document.getElementById('batchTemplateSelect') || document.getElementById('repairBatchTemplate');
        if (select?.value !== '19') return;
        const selected = Array.from(document.querySelectorAll('.row-check:checked, .app-check:checked'));
        const unsafe = selected.some((box) => !rowLooksFinalRound(box.closest('tr, article')));
        if (unsafe) {
          event.preventDefault();
          event.stopImmediatePropagation();
          alert('T19 Calendly can only be sent after Self Tape Status is Selected for Final Round. Send T15 Self Tape Invitation to Callback applicants.');
        }
      }
    }, true);
  }

  function repairTabs(hub) {
    if (!hub) return;
    document.querySelectorAll('.hub-panel').forEach((panel) => {
      const active = panel.id === `hub-${hub}`;
      panel.classList.toggle('active', active);
      panel.classList.toggle('hidden', !active);
    });
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body);
        const templateId = Number(body?.payload?.templateId);
        if (templateId === 19 && !isFinalRoundRecord(window.__bleuskmActiveEmailRecord)) {
          return new Response(JSON.stringify({ error: 'Template 19 locked until final round.' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch {}
    }
    return rawFetch(input, init);
  };

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.hub-btn[data-hub]');
    if (btn) setTimeout(() => { repairTabs(btn.dataset.hub); ensureTemplate15Controls(); }, 0);
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureTemplate15Controls();
    installTemplateGuards();
    const active = document.querySelector('.hub-btn.active[data-hub]');
    if (active) repairTabs(active.dataset.hub);
    setInterval(ensureTemplate15Controls, 750);
  });
})();
