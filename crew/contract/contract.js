/* ═══════════════════════════════════════════════════════════════
   BLEUSKM Studios — Contract Signing Page
   contract.js
═══════════════════════════════════════════════════════════════ */

const CLOUDINARY_CLOUD   = 'df2x5q7zw';
const CLOUDINARY_PRESET  = 'bleuskm_signatures';
const CONTRACT_SUBMIT    = '/.netlify/functions/contract-submit';

/* ── URL params ──────────────────────────────────────────────── */
const params    = new URLSearchParams(window.location.search);
const crewName  = decodeURIComponent(params.get('name')  || '').trim();
const crewEmail = decodeURIComponent(params.get('email') || '').trim();
const crewRole  = decodeURIComponent(params.get('role')  || '').trim();

/* ── Populate crew bar ───────────────────────────────────────── */
document.getElementById('crewName').textContent  = crewName  || '—';
document.getElementById('crewRole').textContent  = crewRole  || '—';
document.getElementById('successName').textContent = crewName || 'Crew Member';

/* ── Auto-fill date ──────────────────────────────────────────── */
const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
document.getElementById('dateSigned').textContent = today;

/* ── Signature mode tabs ─────────────────────────────────────── */
let sigMode = 'draw';
document.querySelectorAll('.sig-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    sigMode = tab.dataset.mode;
    document.getElementById('panelDraw').classList.toggle('hidden', sigMode !== 'draw');
    document.getElementById('panelType').classList.toggle('hidden', sigMode !== 'type');
  });
});

/* ── Canvas signature ────────────────────────────────────────── */
const canvas  = document.getElementById('sigCanvas');
const ctx     = canvas.getContext('2d');
let drawing   = false;
let hasDrawn  = false;

// Set canvas resolution
function resizeCanvas() {
  const rect  = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
}

resizeCanvas();
window.addEventListener('resize', () => { if (!hasDrawn) resizeCanvas(); });

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

function startDraw(e) { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
function draw(e)      { e.preventDefault(); if (!drawing) return; hasDrawn = true; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
function stopDraw()   { drawing = false; }

canvas.addEventListener('mousedown',  startDraw);
canvas.addEventListener('mousemove',  draw);
canvas.addEventListener('mouseup',    stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove',  draw,      { passive: false });
canvas.addEventListener('touchend',   stopDraw);

document.getElementById('clearBtn').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
  resizeCanvas();
});

/* ── Type signature preview ──────────────────────────────────── */
const typedSig   = document.getElementById('typedSig');
const typePreview = document.getElementById('typePreview');
typedSig.addEventListener('input', () => {
  typePreview.textContent = typedSig.value;
});

/* ── Generate signature image ────────────────────────────────── */
function generateSignatureBlob() {
  return new Promise((resolve, reject) => {
    if (sigMode === 'draw') {
      if (!hasDrawn) { reject(new Error('Please draw your signature.')); return; }
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas error')), 'image/png');
    } else {
      const text = typedSig.value.trim();
      if (!text) { reject(new Error('Please type your signature.')); return; }

      // Render typed sig to offscreen canvas
      const offscreen = document.createElement('canvas');
      offscreen.width  = 560;
      offscreen.height = 160;
      const octx = offscreen.getContext('2d');
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, 560, 160);
      octx.font = '52px "Brush Script MT", "Segoe Script", cursive';
      octx.fillStyle = '#1a1a1a';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillText(text, 280, 90);
      offscreen.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas error')), 'image/png');
    }
  });
}

/* ── Upload to Cloudinary ────────────────────────────────────── */
async function uploadToCloudinary(blob) {
  const formData = new FormData();
  const fileName = `sig_${crewName.replace(/\s+/g, '_')}_${Date.now()}`;
  formData.append('file', blob, `${fileName}.png`);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', 'signatures');
  formData.append('public_id', fileName);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body:   formData,
  });

  if (!res.ok) throw new Error('Signature upload failed');
  const data = await res.json();
  return data.secure_url;
}

/* ── Submit ──────────────────────────────────────────────────── */
const submitBtn    = document.getElementById('submitBtn');
const agreeCheck   = document.getElementById('agreeCheck');
const errorMsg     = document.getElementById('errorMsg');
const successBlock = document.getElementById('successBlock');

submitBtn.addEventListener('click', async () => {
  errorMsg.classList.add('hidden');

  if (!crewName || !crewEmail) {
    showError('Missing name or email. Please use the link from your email.');
    return;
  }

  if (!agreeCheck.checked) {
    showError('Please check the agreement box before submitting.');
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading signature...';

  try {
    // 1. Generate blob
    const blob = await generateSignatureBlob();

    // 2. Upload to Cloudinary
    submitBtn.textContent = 'Saving agreement...';
    const signatureUrl = await uploadToCloudinary(blob);

    // 3. Submit to Airtable via Netlify
    const res = await fetch(CONTRACT_SUBMIT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:         crewName,
        email:        crewEmail,
        role:         crewRole,
        signatureUrl,
        dateSigned:   new Date().toISOString().split('T')[0],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Submission failed');
    }

    // 4. Success
    submitBtn.classList.add('hidden');
    agreeCheck.closest('.agree-wrap').classList.add('hidden');
    document.querySelector('.date-row').classList.add('hidden');
    document.querySelector('.sig-tabs').classList.add('hidden');
    document.querySelector('.sig-panel:not(.hidden)').classList.add('hidden');
    successBlock.classList.remove('hidden');

  } catch (err) {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Agreement';
    showError(err.message || 'Something went wrong. Please try again.');
  }
});

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
