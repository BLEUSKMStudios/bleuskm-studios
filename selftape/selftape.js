/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Self-Tape Submission Page
   selftape.js
═══════════════════════════════════════════════════════════════ */

const PROXY = '/.netlify/functions/selftape-submit';

/* ── Read URL params ─────────────────────────────────────────── */
const params     = new URLSearchParams(window.location.search);
const actorName  = decodeURIComponent(params.get('name')  || '').trim();
const actorRole  = decodeURIComponent(params.get('role')  || '').trim();
const actorEmail = decodeURIComponent(params.get('email') || '').trim();
const recordId   = decodeURIComponent(params.get('id')    || '').trim();

/* ── Populate actor bar ──────────────────────────────────────── */
document.getElementById('actorName').textContent  = actorName  || '—';
document.getElementById('actorRole').textContent  = actorRole  || '—';
document.getElementById('successName').textContent = actorName || 'Actor';

/* ── Global instructions toggle ──────────────────────────────── */
const globalToggleBtn = document.getElementById('globalToggleBtn');
const globalBody      = document.getElementById('globalBody');
globalToggleBtn.addEventListener('click', () => {
  const collapsed = globalBody.classList.toggle('hidden');
  globalToggleBtn.classList.toggle('collapsed', collapsed);
  globalToggleBtn.querySelector('span').textContent = collapsed ? 'Expand' : 'Collapse';
});

/* ── Role key matcher ────────────────────────────────────────── */
function getRoleKey(role) {
  const r = role.toLowerCase();
  if (r.includes('high john'))                          return 'high_john';
  if (r.includes('player'))                             return 'player';
  if (r.includes('stranger'))                           return 'stranger';
  if (r.includes('bartender') || r.includes('waitress')) return 'bartender';
  if (r.includes('couple'))                             return 'couple';
  if (r.includes('patron') || r.includes('table'))     return 'patron';
  return 'unknown';
}

/* ── Role content ────────────────────────────────────────────── */
const ROLE_CONTENT = {

  high_john: {
    title: 'High John',
    character: 'High John is the House. Composed, unhurried, already present before anyone else arrives. He does not perform power — he is it. Stillness is his primary language. He is not a villain. He is a mirror. Every word he speaks carries the weight of something that was already decided.',
    instructions: `
      <div class="instr-block">
        <p class="instr-label">DIRECTION</p>
        <ul class="instr-list">
          <li>Minimal movement</li>
          <li>Let stillness carry the performance</li>
          <li>Do NOT force intensity</li>
        </ul>
      </div>
      <div class="instr-block">
        <p class="instr-label">OPTIONAL VERSIONS</p>
        <ul class="instr-list">
          <li>One version completely still</li>
          <li>One version slightly expressive</li>
        </ul>
      </div>`,
    scenes: [{
      label: 'SCENE',
      lines: [
        { char: 'READER',    text: '(Player watches. Still.)',        reader: true,  direction: true },
        { char: 'READER',    text: 'You just gotta know when to move.', reader: true },
        { char: 'DIRECTION', text: '(High John watches. Still.)',     direction: true },
        { char: 'HIGH JOHN', text: 'You borrowed fire with wet hands.', reader: false },
        { char: 'DIRECTION', text: '(Hold silence. No added movement.)', direction: true },
      ],
      note: 'The silence after this line is the performance. Do not fill it.'
    }]
  },

  player: {
    title: 'The Player',
    character: 'The Player is confident, observant, and just self-aware enough to think he understands the room. He is not reckless — he is certain. That certainty is what costs him. His arc is not about failure. It is about the moment a man realizes the thing he was chasing was never his to begin with.',
    instructions: `
      <div class="instr-block">
        <p class="instr-label">DIRECTION</p>
        <p class="instr-text">Perform 2 versions if possible:</p>
        <ul class="instr-list" style="margin-top:8px;">
          <li>Version 1: Controlled / confident</li>
          <li>Version 2: Control slipping</li>
        </ul>
        <p class="instr-text" style="margin-top:10px;">You may paraphrase slightly if it feels natural.</p>
      </div>
      <div class="instr-block">
        <p class="instr-label">FOCUS</p>
        <ul class="instr-list">
          <li>Observation</li>
          <li>Ego</li>
          <li>Quiet unraveling</li>
        </ul>
      </div>`,
    scenes: [
      {
        label: 'SCENE 1',
        lines: [
          { char: 'PLAYER',    text: "I swear... some people just move different. Like the room adjusts or somethin'.", reader: false },
          { char: 'READER',    text: 'Adjusts how?', reader: true },
          { char: 'PLAYER',    text: "Like they're not rushin'. Not lookin' around for permission.", reader: false },
          { char: 'DIRECTION', text: '(beat)', direction: true },
          { char: 'PLAYER',    text: "That's the kinda thing nobody ever explains how to get.", reader: false },
          { char: 'DIRECTION', text: '(low)', direction: true },
          { char: 'PLAYER',    text: "Like it's somethin' you're either born with... or shut out of.", reader: false },
        ]
      },
      {
        label: 'SCENE 2',
        lines: [
          { char: 'PLAYER',    text: "That's solid. You just gotta know when to move.", reader: false },
          { char: 'DIRECTION', text: '(beat)', direction: true },
          { char: 'PLAYER',    text: 'I think I can hold it...', reader: false },
          { char: 'DIRECTION', text: '(he hesitates)', direction: true },
          { char: 'PLAYER',    text: 'Just one more...', reader: false },
          { char: 'DIRECTION', text: '(pause)', direction: true },
          { char: 'PLAYER',    text: 'No — no, wait —', reader: false },
        ]
      }
    ]
  },

  stranger: {
    title: 'The Stranger',
    character: 'The Stranger is the messenger. Grounded, conversational, carrying knowledge he offers without announcement. He plants seeds and walks away. He is warm but deliberate — every word chosen, nothing wasted. He already knows how this ends.',
    instructions: `
      <div class="instr-block">
        <p class="instr-label">DIRECTION</p>
        <ul class="instr-list">
          <li>Keep it grounded and conversational</li>
          <li>Play with subtle intention</li>
        </ul>
      </div>
      <div class="instr-block">
        <p class="instr-label">YOU MAY CHOOSE</p>
        <ul class="instr-list">
          <li>Knowing</li>
          <li>Calm</li>
          <li>Slightly amused</li>
        </ul>
      </div>`,
    scenes: [{
      label: 'SCENE',
      lines: [
        { char: 'STRANGER', text: 'You ever play with the House?', reader: false },
        { char: 'READER',   text: 'House always wins.', reader: true },
        { char: 'STRANGER', text: 'Most folks sit with him once.', reader: false },
        { char: 'DIRECTION',text: '(beat)', direction: true },
        { char: 'READER',   text: 'And?', reader: true },
        { char: 'STRANGER', text: "Depends what they came lookin' for.", reader: false },
      ]
    }]
  },

  bartender: {
    title: 'Bartender / Waitress',
    character: 'The Bartender moves through the space like she belongs to it. She sees everything and reacts to nothing — until the knock. Her awareness is quiet and constant. She is the room\'s pulse. Presence over performance.',
    instructions: `
      <div class="instr-block">
        <p class="instr-label">DIRECTION</p>
        <p class="instr-text">Submit a 30 to 60 second tape. Perform simple actions:</p>
        <ul class="instr-list" style="margin-top:8px;">
          <li>Placing a drink</li>
          <li>Observing the room</li>
          <li>Moving through space</li>
        </ul>
      </div>
      <div class="instr-block">
        <p class="instr-label">FOCUS</p>
        <ul class="instr-list">
          <li>Awareness</li>
          <li>Presence</li>
          <li>Subtle observation</li>
        </ul>
      </div>`,
    scenes: [{
      label: 'LINE',
      lines: [{ char: 'BARTENDER', text: 'You want anything?', reader: false }],
      note: 'Say it casually. No performance. The weight is in what she already knows.'
    }]
  },

  patron: {
    title: 'Table Patrons',
    character: 'The Table Patron is a living part of the room\'s atmosphere. Natural, unbothered, fully present in their own scene — until the energy shifts. The interruption is brief and unconscious. The ability to be real in a space without performing it is the entire role.',
    instructions: `
      <div class="instr-block">
        <p class="instr-label">DIRECTION</p>
        <p class="instr-text">Submit a 30 to 60 second behavioral tape. You may:</p>
        <ul class="instr-list" style="margin-top:8px;">
          <li>Sit at a table</li>
          <li>Sip a drink</li>
          <li>Interact lightly with someone nearby</li>
        </ul>
      </div>
      <div class="instr-block">
        <p class="instr-label">THE INTERRUPTION MOMENT</p>
        <p class="instr-text">At some point, pause briefly as if something in the room shifted. Then continue naturally. No dialogue required.</p>
      </div>`,
    scenes: []
  },

  couple: {
    title: 'The Couple',
    character: 'The Couple exists in their own world — comfortable, familiar, present with each other. They are background until the knock interrupts them. In that moment, something passes through the woman without explanation. She taps the rhythm without knowing why. Then it is gone. Chemistry and subtlety are everything.',
    instructions: `
      <div class="instr-block">
        <p class="instr-label">DIRECTION</p>
        <p class="instr-text">Submit a 30 to 60 second scene, together or solo. Create:</p>
        <ul class="instr-list" style="margin-top:8px;">
          <li>A casual conversation, OR</li>
          <li>A quiet shared moment</li>
        </ul>
      </div>
      <div class="instr-block">
        <p class="instr-label">THE INTERRUPTION MOMENT</p>
        <p class="instr-text">At some point, stop mid-conversation. Become completely still.</p>
      </div>`,
    scenes: [{
      label: 'THE KNOCK (REQUIRED)',
      lines: [],
      custom: `
        <p class="instr-text" style="margin-bottom:14px;">The woman unconsciously recreates the rhythm of "Shave and a Haircut — Two Bits."</p>
        <ul class="instr-list" style="margin-bottom:14px;">
          <li>Tap the rhythm on a glass or object</li>
          <li>Keep it subtle and natural</li>
          <li>It should feel unconscious, not performed</li>
        </ul>
        <div class="knock-ref">
          <p>Reference timing: <a href="https://youtu.be/zWbjP_ahuB4?si=sWcdUfVBCuADtmhy" target="_blank" rel="noopener">youtu.be/zWbjP_ahuB4</a></p>
        </div>
        <div class="instr-block" style="margin-top:18px;">
          <p class="instr-label">AFTER THE KNOCK</p>
          <ul class="instr-list">
            <li>She pauses</li>
            <li>Blinks</li>
            <li>Looks at her partner</li>
            <li>The moment passes</li>
            <li>Conversation resumes</li>
          </ul>
        </div>`
    }]
  },

  unknown: {
    title: 'Your Role',
    character: '',
    instructions: `<div class="instr-block"><p class="instr-text">Please refer to your callback email for specific instructions for your role, or contact us at <a href="mailto:casting@bleuskm.com" style="color:var(--golddim);">casting@bleuskm.com</a>.</p></div>`,
    scenes: []
  }
};

/* ── Render role section ─────────────────────────────────────── */
function renderRole() {
  const key     = getRoleKey(actorRole);
  const content = ROLE_CONTENT[key];
  const section = document.getElementById('roleSection');

  let html = `
    <div class="section-header">
      <div class="section-header-left">
        <span class="section-eyebrow">YOUR ROLE</span>
        <h2 class="section-title">${content.title}</h2>
      </div>
    </div>
    <div class="instructions-body">`;

  // Character description block
  if (content.character) {
    html += `
      <div class="instr-block" style="padding:16px 20px;background:rgba(218,175,55,0.04);border-left:2px solid rgba(218,175,55,0.3);margin-bottom:20px;">
        <p class="instr-label" style="margin-bottom:8px;">CHARACTER</p>
        <p class="instr-text" style="font-style:italic;color:rgba(234,223,207,0.6);">${esc(content.character)}</p>
      </div>`;
  }

  html += content.instructions;

  if (content.scenes && content.scenes.length > 0) {
    content.scenes.forEach(scene => {
      html += `<div class="scene-block" style="margin-top:24px;"><span class="scene-label">${scene.label}</span>`;
      if (scene.custom) {
        html += `<div>${scene.custom}</div>`;
      } else if (scene.lines && scene.lines.length > 0) {
        html += `<div class="sides">`;
        scene.lines.forEach(line => {
          if (line.direction) { html += `<div class="line-direction">${esc(line.text)}</div>`; }
          else { html += `<div class="line"><span class="line-char ${line.reader ? 'reader' : ''}">${esc(line.char)}</span><span class="line-text ${line.reader ? 'reader-text' : ''}">${esc(line.text)}</span></div>`; }
        });
        html += `</div>`;
      }
      if (scene.note) html += `<p class="scene-note">${esc(scene.note)}</p>`;
      html += `</div>`;
    });
  }

  html += `</div>`;
  section.innerHTML = html;
}

renderRole();

/* ── Submission ──────────────────────────────────────────────── */
const submitBtn    = document.getElementById('submitBtn');
const urlInput     = document.getElementById('selfTapeUrl');
const errorMsg     = document.getElementById('errorMsg');
const formGroup    = document.getElementById('formGroup');
const successBlock = document.getElementById('successBlock');

submitBtn.addEventListener('click', async () => {
  const link = urlInput.value.trim();
  errorMsg.classList.add('hidden');

  if (!link)          { showError('Please paste your self-tape link before submitting.'); return; }
  if (!isValidUrl(link)) { showError('Please enter a valid URL (must start with https://).'); return; }
  if (!recordId)      { showError('Missing record ID. Please use the link from your callback email.'); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const res = await fetch(PROXY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, selfTapeUrl: link }),
    });
    if (!res.ok) throw new Error('Submission failed');
    formGroup.classList.add('hidden');
    submitBtn.classList.add('hidden');
    successBlock.classList.remove('hidden');
  } catch {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Self-Tape';
    showError('Something went wrong. Please try again or email casting@bleuskm.com.');
  }
});

function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); }
function isValidUrl(str) { try { return Boolean(new URL(str)); } catch { return false; } }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
