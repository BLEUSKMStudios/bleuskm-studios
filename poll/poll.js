const API = '/.netlify/functions/portal';
const params = new URLSearchParams(window.location.search);
const pollId = (params.get('id') || '').trim();
const presetName = decodeURIComponent(params.get('name') || '').trim();
const presetEmail = decodeURIComponent(params.get('email') || '').trim();
const presetRole = decodeURIComponent(params.get('role') || '').trim();

function escText(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

function showError(msg) {
  const el = document.getElementById('pollError');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadPoll() {
  if (!pollId) { showError('This poll link is missing its ID. Please ask for a fresh link.'); return; }
  try {
    const res = await fetch(`${API}?action=get-poll&id=${encodeURIComponent(pollId)}`);
    const data = await res.json();
    if (!data || !data.fields || !data.fields['Title']) throw new Error('not found');
    renderPoll(data.fields);
  } catch (e) {
    showError('This poll link is invalid or has been removed.');
  }
}

function renderPoll(fields) {
  document.getElementById('pollTitle').textContent = fields['Title'] || 'Meeting Poll';
  const options = (fields['Options'] || '').split('\n').map(s => s.trim()).filter(Boolean);
  const wrap = document.getElementById('pollOptions');
  wrap.innerHTML = options.length
    ? options.map(o => `
        <label class="poll-option">
          <input type="checkbox" class="poll-opt" value="${escAttr(o)}">
          <span>${escText(o)}</span>
        </label>
      `).join('')
    : '<p style="color:var(--muted);font-size:13px">No time options have been added to this poll yet.</p>';

  if (presetName) document.getElementById('p-name').value = presetName;
  if (presetEmail) document.getElementById('p-email').value = presetEmail;
  if (presetRole) document.getElementById('p-role').value = presetRole;

  document.getElementById('pollLoading').classList.add('hidden');
  document.getElementById('pollForm').classList.remove('hidden');
}

document.getElementById('submitBtn').addEventListener('click', async () => {
  const name = document.getElementById('p-name').value.trim();
  const email = document.getElementById('p-email').value.trim();
  const role = document.getElementById('p-role').value.trim();
  const selected = [...document.querySelectorAll('.poll-opt:checked')].map(c => c.value);
  document.getElementById('pollError').classList.add('hidden');

  if (!name) return showError('Please enter your name.');
  if (!selected.length) return showError('Select at least one time that works for you.');

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const res = await fetch(`${API}?action=submit-poll-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId, name, email, role, selectedOptions: selected }),
    });
    if (!res.ok) throw new Error('failed');
    document.getElementById('pollForm').classList.add('hidden');
    document.getElementById('pollSuccess').classList.remove('hidden');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Submit My Availability';
    showError('Something went wrong submitting your response. Please try again.');
  }
});

loadPoll();
