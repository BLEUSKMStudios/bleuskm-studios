/* BLEUSKM Studios: public form handlers.
 * Every form posts once to /api/form-submit. The server saves the Airtable
 * record and sends the Brevo confirmation. No credentials live in this file. */
(function () {
  var ENDPOINT = '/api/form-submit';
  var busy = new WeakMap();

  function val(el) { return el && el.value != null ? String(el.value) : ''; }
  function q(form, sel) { return form ? form.querySelector(sel) : null; }
  function byId() { for (var i = 0; i < arguments.length; i++) { var el = document.getElementById(arguments[i]); if (el) return el; } return null; }
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  async function post(key, form, fields, newsletter) {
    key = key || document.body;
    if (busy.get(key)) throw new Error('already_submitting');
    busy.set(key, true);
    try {
      var r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: form, fields: fields, newsletter: !!newsletter, submissionId: newId() })
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      return j;
    } finally {
      busy.delete(key);
    }
  }

  function setBtn(btn, text, disabled) { if (btn) { btn.textContent = text; btn.disabled = disabled; } }

  // ── CASTING SUBMISSION ──
  window.submitCasting = async function (e, filmTitle) {
    e.preventDefault();
    var form = e.target; var btn = q(form, 'button[type="submit"]');
    if (busy.get(form)) return;
    setBtn(btn, 'Submitting...', true);
    var fields = {
      'Name': val(q(form, '[name="name"]')).trim(), 'Email': val(q(form, '[name="email"]')).trim(),
      'Film': filmTitle, 'Role': val(q(form, '[name="role"]')), 'Phone': val(q(form, '[name="phone"]')),
      'Age': val(q(form, '[name="age"]')), 'Location': val(q(form, '[name="location"]')),
      'Reel/Portfolio Link': val(q(form, '[name="reel"]')), 'Headshot': val(q(form, '[name="files"]')),
      'About': val(q(form, '[name="about"]'))
    };
    var nl = q(form, '[name="newsletter"]');
    try {
      await post(form, 'casting', fields, nl && nl.checked);
      form.style.display = 'none';
      var s = document.getElementById(form.id.replace('form-', '') + '-success');
      if (s) s.style.display = 'block';
    } catch (err) {
      console.error(err); setBtn(btn, 'Submit Audition Materials', false);
      alert('Submission failed. Please try again.');
    }
  };

  async function notifyLike(e, filmTitle, formKey) {
    e.preventDefault();
    var form = e.target; var btn = q(form, 'button[type="submit"]');
    if (busy.get(form)) return;
    setBtn(btn, 'Submitting...', true);
    var fields = { 'Name': val(q(form, '[name="name"]')), 'Email': val(q(form, '[name="email"]')).trim(), 'Film': filmTitle };
    if (formKey === 'notify') fields['Role Interested In'] = val(q(form, '[name="role"]'));
    var nl = q(form, '[name="newsletter"]');
    try {
      await post(form, formKey, fields, nl && nl.checked);
      form.style.display = 'none';
      var s = form.nextElementSibling; if (s) s.style.display = 'block';
    } catch (err) {
      console.error(err); setBtn(btn, 'Notify Me When Casting Opens', false);
      alert('Submission failed. Please try again.');
    }
  }
  // ── FILM NOTIFICATION (casting soon / coming soon) ──
  window.submitNotify = function (e, filmTitle) { return notifyLike(e, filmTitle, 'notify'); };
  window.submitComingSoon = function (e, filmTitle) { return notifyLike(e, filmTitle, 'coming-soon'); };

  // ── NEWSLETTER (footer forms, film pages, echos, casting) ──
  window.submitNewsletter = async function (e) {
    e.preventDefault();
    var form = e.target; var btn = q(form, 'button[type="submit"]');
    if (busy.get(form)) return;
    var name = val(q(form, '[name="name"]') || q(form, 'input[type="text"]') || byId('fnl-name'));
    var email = val(q(form, '[name="email"]') || q(form, 'input[type="email"]') || byId('fnl-email')).trim();
    if (!email) return;
    setBtn(btn, 'Subscribing...', true);
    try {
      await post(form, 'newsletter', { 'Name': name, 'Email': email }, false);
      form.style.display = 'none';
      var successId = form.id ? form.id.replace('Form', 'Success').replace('form', 'Success') : null;
      var s = (successId && document.getElementById(successId)) || byId('newsletterSuccess', 'fnl-success') || form.nextElementSibling;
      if (s) s.style.display = 'block';
    } catch (err) {
      console.error(err); setBtn(btn, 'Subscribe', false);
    }
  };
  window.submitNewsletterFooter = window.submitNewsletter;
  window.submitEchosNewsletter = window.submitNewsletter;
  window.submitFilmNewsletter = window.submitNewsletter;

  // ── CREW APPLICATION ──
  window.submitCrewForm = async function (e) {
    e.preventDefault();
    var formEl = byId('crewForm');
    if (busy.get(formEl)) return;
    var btn = document.querySelector('#crewForm button[type="submit"]');
    setBtn(btn, 'Submitting...', true);
    var jc = byId('join-collective'); var isCollective = !!(jc && jc.checked);
    if (isCollective && typeof window.updatePillValue === 'function') {
      ['lt-roles', 'lt-projects', 'lt-interests'].forEach(function (g) { window.updatePillValue(g); });
    }
    var fields = {
      'Name': val(byId('crew-name')).trim(), 'Email': val(byId('crew-email')).trim(), 'Role': val(byId('crew-role')),
      'Phone': val(byId('crew-phone')), 'City': val(byId('crew-city')),
      'Resume / Portfolio Link': val(byId('crew-resume')), 'Reel / Work Samples': val(byId('crew-reel')),
      'Gear List': val(byId('crew-gear')), 'Availability': val(byId('crew-availability')),
      'Film Interest': val(byId('crew-film-interest'))
    };
    if (isCollective) {
      fields['Join Collective'] = true;
      fields['LT Roles'] = val(byId('lt-roles-val'));
      fields['LT Project Types'] = val(byId('lt-projects-val'));
      fields['Why Build With BLEUSKM'] = val(byId('lt-why'));
      fields['Inspirations'] = val(byId('lt-inspo'));
      fields['Collective Interests'] = val(byId('lt-interests-val'));
    }
    var nl = byId('crew-newsletter');
    try {
      await post(formEl, 'crew', fields, nl && nl.checked);
      formEl.style.display = 'none';
      var s = byId('crewSuccess'); if (s) s.style.display = 'block';
    } catch (err) {
      console.error(err); setBtn(btn, 'Submit Crew Application', false);
      alert('Submission failed. Please try again.');
    }
  };

  // ── PROJECT INQUIRY ──
  window.submitContact = async function () {
    var formEl = byId('contactForm') || document.querySelector('form');
    if (busy.get(formEl)) return;
    var email = val(byId('cf-email', 'contact-email')).trim();
    var agree = byId('cf-agree', 'contact-understood');
    if (!email) { alert('Email is required.'); return; }
    if (agree && !agree.checked) { alert('Please confirm you understand this is an inquiry.'); return; }
    var btn = document.querySelector('.submit-btn');
    setBtn(btn, 'Submitting...', true);
    var fields = {
      'Name': val(byId('cf-name', 'contact-name')), 'Email': email, 'Phone number': val(byId('cf-phone', 'contact-phone')),
      'Project Type': val(byId('cf-type', 'contact-type')), 'Budget': val(byId('cf-budget', 'contact-budget')),
      'Concept': val(byId('cf-concept', 'contact-concept')), 'Timeline': val(byId('cf-timeline', 'contact-timeline'))
    };
    var nl = byId('cf-newsletter', 'contact-newsletter');
    try {
      await post(formEl, 'inquiry', fields, nl && nl.checked);
      if (formEl) formEl.style.display = 'none';
      var s = byId('contactSuccess'); if (s) s.style.display = 'block';
    } catch (err) {
      console.error(err); setBtn(btn, 'Submit Project Inquiry', false);
      alert('Submission failed. Please try again.');
    }
  };
})();
