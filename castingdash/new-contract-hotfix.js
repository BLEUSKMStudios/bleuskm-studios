(function () {
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function activeType() {
    return document.querySelector('.contracts-tab.active')?.dataset.tab || 'cast';
  }

  function openFallbackContractModal() {
    const type = activeType();
    const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const overlay = document.createElement('div');
    overlay.className = 'portal-overlay new-contract-fallback';
    overlay.innerHTML = `
      <div class="portal-contract-doc">
        <div class="portal-contract-top">
          <div><small>BLEUSKM STUDIOS</small><h2>New ${esc(typeLabel)} Contract</h2></div>
          <button class="portal-x" data-close>&times;</button>
        </div>
        <div class="portal-contract-info">
          <label>NAME<input id="fallbackContractName" placeholder="Full name"></label>
          <label>EMAIL<input id="fallbackContractEmail" placeholder="recipient@email.com"></label>
          <label>ROLE<input id="fallbackContractRole" placeholder="Role / position"></label>
          <label>PROJECT<span>The Final Hand</span></label>
        </div>
        <div class="portal-contract-clause"><span>1</span><div><strong>CONTRACT LINK</strong><p>Fill in name, email, and role, then copy a direct contract signing link. You can send this link manually if email buttons are blocked.</p></div></div>
        <div class="modal-field"><label class="modal-label">DIRECT LINK</label><input class="modal-input" id="fallbackContractLink" readonly></div>
        <div class="portal-contract-actions"><button type="button" data-copy-link>Copy Direct Link</button><button type="button" data-close>Close</button></div>
      </div>`;

    const updateLink = () => {
      const qs = new URLSearchParams({
        name: document.getElementById('fallbackContractName')?.value || '',
        email: document.getElementById('fallbackContractEmail')?.value || '',
        role: document.getElementById('fallbackContractRole')?.value || '',
        film: 'The Final Hand'
      });
      document.getElementById('fallbackContractLink').value = `https://bleuskm.com/crew/contract?${qs.toString()}`;
    };

    overlay.addEventListener('input', updateLink);
    overlay.addEventListener('click', async event => {
      if (event.target === overlay || event.target.closest('[data-close]')) overlay.remove();
      if (event.target.closest('[data-copy-link]')) {
        updateLink();
        await navigator.clipboard?.writeText(document.getElementById('fallbackContractLink').value);
        alert('Direct contract link copied.');
      }
    });

    document.body.appendChild(overlay);
    updateLink();
  }

  function repairNewContractButton() {
    const btn = document.getElementById('newContractBtn') || [...document.querySelectorAll('button')].find(b => /new contract/i.test(b.textContent || ''));
    if (!btn || btn.dataset.newContractHotfixReady) return;
    btn.dataset.newContractHotfixReady = 'true';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openFallbackContractModal();
    }, true);
  }

  document.addEventListener('DOMContentLoaded', repairNewContractButton);
  document.addEventListener('click', event => {
    if (event.target.closest('.hub-btn[data-hub="contracts"]')) setTimeout(repairNewContractButton, 50);
  }, true);
  setInterval(repairNewContractButton, 1000);
})();
