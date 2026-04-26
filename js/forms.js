/**
 * BLEUSKM Studios — Unified Form Handler
 * All forms POST to Netlify Functions (keys are server-side only)
 */

async function bleuskmPost(endpoint, data) {
  const res = await fetch(`/.netlify/functions/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Submission failed');
  return json;
}

function showSuccess(formEl, successId) {
  if (formEl) formEl.style.display = 'none';
  const s = successId
    ? document.getElementById(successId)
    : formEl && formEl.nextElementSibling;
  if (s) s.style.display = 'block';
}

function resetBtn(btn, label) {
  if (btn) { btn.textContent = label; btn.disabled = false; }
}

async function submitCasting(e, filmTitle) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type="submit"]');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  const val = (name) => (form.querySelector(`[name="${name}"]`) || {}).value || '';
  const data = {
    name: val('name'), email: val('email'), phone: val('phone'),
    age: val('age'), location: val('location'), role: val('role'),
    reel: val('reel'), headshot: val('files'), about: val('about'),
    film: filmTitle,
    newsletter: !!(form.querySelector('[name="newsletter"]') || {}).checked
  };
  if (!data.email || !data.name) { alert('Please fill in your name and email.'); resetBtn(btn, 'Submit Audition Materials'); return; }
  try {
    await bleuskmPost('submit-casting', data);
    const filmId = form.id.replace('form-', '');
    showSuccess(form, filmId + '-success');
  } catch (err) {
    console.error(err);
    alert('Submission failed. Please try again.');
    resetBtn(btn, 'Submit Audition Materials');
  }
}

async function submitNotify(e, filmTitle) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type="submit"]');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  const val = (name) => (form.querySelector(`[name="${name}"]`) || {}).value || '';
  const data = {
    name: val('name'), email: val('email'), film: filmTitle,
    roleInterest: val('role'), type: 'Casting Soon',
    newsletter: !!(form.querySelector('[name="newsletter"]') || {}).checked
  };
  if (!data.email) { alert('Email is required.'); resetBtn(btn, 'Notify Me When Casting Opens'); return; }
  try {
    await bleuskmPost('submit-notify', data);
    showSuccess(form, null);
  } catch (err) {
    console.error(err);
    alert('Submission failed. Please try again.');
    resetBtn(btn, 'Notify Me When Casting Opens');
  }
}

async function submitComingSoon(e, filmTitle) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type="submit"]');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  const val = (name) => (form.querySelector(`[name="${name}"]`) || {}).value || '';
  const data = {
    name: val('name'), email: val('email'), film: filmTitle,
    type: 'Coming Soon',
    newsletter: !!(form.querySelector('[name="newsletter"]') || {}).checked
  };
  if (!data.email) { alert('Email is required.'); resetBtn(btn, 'Notify Me When Casting Opens'); return; }
  try {
    await bleuskmPost('submit-notify', data);
    showSuccess(form, null);
  } catch (err) {
    console.error(err);
    alert('Submission failed. Please try again.');
    resetBtn(btn, 'Notify Me When Casting Opens');
  }
}

async function submitNewsletter(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type="submit"]');
  if (btn) { btn.textContent = 'Subscribing…'; btn.disabled = true; }
  const nameEl  = form.querySelector('[name="name"]')  || document.getElementById('fnl-name');
  const emailEl = form.querySelector('[name="email"]') || document.getElementById('fnl-email');
  const data = { name: (nameEl || {}).value || '', email: (emailEl || {}).value || '' };
  if (!data.email) { resetBtn(btn, 'Subscribe'); return; }
  try {
    await bleuskmPost('submit-newsletter', data);
    const s = document.getElementById('fnl-success') || form.nextElementSibling;
    form.style.display = 'none';
    if (s) s.style.display = 'block';
  } catch (err) {
    console.error(err);
    resetBtn(btn, 'Subscribe');
  }
}

async function submitCrewForm(e) {
  e.preventDefault();
  const btn = document.querySelector('#crewForm button[type="submit"]');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  const g = (id) => (document.getElementById(id) || {}).value || '';
  const data = {
    name: g('crew-name'), email: g('crew-email'), phone: g('crew-phone'),
    city: g('crew-city'), role: g('crew-role'), resume: g('crew-resume'),
    reel: g('crew-reel'), gear: g('crew-gear'), availability: g('crew-availability'),
    filmInterest: g('crew-film-interest'),
    newsletter: !!(document.getElementById('crew-newsletter') || {}).checked
  };
  if (!data.email || !data.name) { alert('Please fill in your name and email.'); resetBtn(btn, 'Submit Crew Application'); return; }
  try {
    await bleuskmPost('submit-crew', data);
    document.getElementById('crewForm').style.display = 'none';
    document.getElementById('crewSuccess').style.display = 'block';
  } catch (err) {
    console.error(err);
    alert('Submission failed. Please try again.');
    resetBtn(btn, 'Submit Crew Application');
  }
}

async function submitContact() {
  const g = (id) => (document.getElementById(id) || {}).value || '';
  const name = g('cf-name'), email = g('cf-email'), phone = g('cf-phone');
  const projType = g('cf-type'), budget = g('cf-budget');
  const concept = g('cf-concept'), timeline = g('cf-timeline');
  const newsletter = !!(document.getElementById('cf-newsletter') || {}).checked;
  const agree = document.getElementById('cf-agree');
  if (!email) { alert('Email is required.'); return; }
  if (agree && !agree.checked) { alert('Please confirm you understand this is an inquiry.'); return; }
  const btn = document.querySelector('.submit-btn');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  try {
    await bleuskmPost('submit-contact', { name, email, phone, projectType: projType, budget, concept, timeline, newsletter });
    const form = document.getElementById('contactForm');
    if (form) form.style.display = 'none';
    const s = document.getElementById('contactSuccess');
    if (s) s.style.display = 'block';
  } catch (err) {
    console.error(err);
    alert('Submission failed. Please try again.');
    resetBtn(btn, 'Submit Project Inquiry');
  }
}
