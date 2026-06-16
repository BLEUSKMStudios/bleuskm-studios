(function () {
  const ZOHO = '/.netlify/functions/zoho-mail';
  const $ = (id) => document.getElementById(id);
  const text = (value) => String(value ?? '').trim();
  const esc = (value) => text(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function selectedRecipients() {
    const checked = [...document.querySelectorAll('#emailRecipients input:checked')].map((input) => input.value);
    const manual = text($('emailToManual')?.value).split(',').map((item) => item.trim()).filter(Boolean);
    return [...new Set([...checked, ...manual])];
  }

  async function sendZohoEmail(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const recipients = selectedRecipients();
    const from = $('emailFrom')?.value || 'studio@bleuskm.com';
    const subject = text($('emailSubject')?.value);
    const body = text($('emailBody')?.value);
    if (!recipients.length) return alert('Select or enter at least one recipient.');
    if (!subject || !body) return alert('Add a subject and message.');
    const button = $('sendHubEmail');
    if (button) {
      button.disabled = true;
      button.textContent = 'Sending...';
    }
    try {
      const res = await fetch(ZOHO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          from,
          fromName: 'Regan Galindo - Assistant Director',
          to: recipients,
          subject,
          textContent: body,
          htmlContent: `<p>${esc(body).replace(/\n/g, '<br>')}</p>`
        })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        return alert(error.error || 'Email failed.');
      }
      $('emailSubject').value = '';
      $('emailBody').value = '';
      $('emailToManual').value = '';
      alert('Email sent.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Send Email';
      }
    }
  }

  function applyEmailUiFixes() {
    const from = $('emailFrom');
    if (from) {
      [...from.options].forEach((option) => {
        if (option.value === 'cast@bleuskm.com') {
          option.value = 'casting@bleuskm.com';
          option.textContent = 'casting@bleuskm.com';
        }
      });
    }
    const group = $('emailGroup');
    if (group && ![...group.options].some((option) => option.value === 'private')) {
      group.insertAdjacentHTML('afterbegin', '<option value="private">Private / one person</option>');
    }
    if (group && !group.dataset.privateDefaulted) {
      group.dataset.privateDefaulted = '1';
      group.value = 'private';
    }
    const list = $('emailRecipients');
    if (group?.value === 'private' && list) {
      list.innerHTML = '<p class="meta">Private mode: type one recipient email in the To field.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyEmailUiFixes();
    setTimeout(applyEmailUiFixes, 500);
    $('sendHubEmail')?.addEventListener('click', sendZohoEmail, true);
  });
})();