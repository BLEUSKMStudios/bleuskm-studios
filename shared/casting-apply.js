/* BLEUSKM Studios: live casting applications.
 *
 * A casting modal marked data-casting-call="<key>" is filled from Studio OS:
 * open roles, deadline and an application form with file uploads. Applicants
 * and their files are saved in Studio OS (Supabase, private storage). The
 * existing /api/form-submit "casting" form then still records the submission
 * in Airtable and sends the usual Brevo confirmation email.
 *
 * Only the public (publishable) Supabase key is used here. Signed-out visitors
 * can do exactly three things with it: read an open casting call, submit an
 * application, and upload files into their own application's folder for one
 * hour. If Studio OS can't be reached, the page keeps its original content.
 */
(function () {
  'use strict';

  var CFG = window.BLEUSKM_CASTING || {};
  var SB_URL = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
  var SB_KEY = String(CFG.publishableKey || '');
  var BUCKET = 'casting-materials';
  var MAX_BYTES = 10 * 1024 * 1024;
  var IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  var DOC_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  var TZ = 'America/Chicago';

  if (!SB_URL || !SB_KEY || !window.fetch) return;

  // Early access: a private link like /casting?access=CODE#love-me-like-this
  var ACCESS = '';
  try {
    var q = new URLSearchParams(location.search).get('access') || sessionStorage.getItem('bleuskm_casting_access') || '';
    if (/^[A-Za-z0-9_-]{6,40}$/.test(q)) { ACCESS = q.toUpperCase(); sessionStorage.setItem('bleuskm_casting_access', ACCESS); }
  } catch (e) {}

  function headers(json) {
    var h = { apikey: SB_KEY };
    if (/^eyJ/.test(SB_KEY)) h.Authorization = 'Bearer ' + SB_KEY; // legacy anon key
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function rpc(fn, body) {
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(true), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('rpc_' + r.status); return r.json(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lines(s) {
    return String(s || '').split(/\r?\n/).map(function (l) { return l.replace(/^\s*[-•·*]\s*/, '').trim(); }).filter(Boolean);
  }
  function fmt(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
    } catch (e) { return new Date(iso).toLocaleString(); }
  }
  function ages(r) {
    if (r.age_min != null && r.age_max != null) return r.age_min + '–' + r.age_max;
    if (r.age_min != null) return r.age_min + '+';
    if (r.age_max != null) return 'up to ' + r.age_max;
    return '';
  }
  function safeName(name) {
    var base = String(name || 'file').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^[-.]+/, '').slice(-80);
    return base || 'file';
  }

  var ERRORS = {
    casting_closed: 'Submissions for this casting call are closed.',
    role_closed: 'Submissions for this role are closed. Please choose another role.',
    role_required: 'Please choose a role.',
    name_required: 'Please enter your full name.',
    invalid_email: 'Please check your email address.',
    invalid_age: 'Please enter your age as a number.',
    too_long: 'One of your answers is too long. Please shorten it.',
    invalid_links: 'Links must be full web addresses starting with https://',
    already_applied: 'We already have your submission for this role. Thank you! To update it, email casting@bleuskm.com.',
    too_many: 'Too many submissions from this network right now. Please try again in an hour.',
    upload_expired: 'Your upload took too long. Your application was saved; please email any missing files to casting@bleuskm.com.'
  };

  function roleHtml(r) {
    var seeking = lines(r.requirements);
    var meta = [r.role_type, ages(r) ? 'Ages ' + ages(r) : ''].filter(Boolean).join(' · ');
    return '<div class="role-row">' +
      '<div class="role-name">' + esc(r.name) + (meta ? '<span class="role-type">' + esc(meta) + '</span>' : '') + '</div>' +
      (r.summary ? '<div class="role-summary">' + esc(r.summary) + '</div>' : '') +
      ((r.description || seeking.length) ?
        '<button class="breakdown-toggle" type="button" onclick="toggleBreakdown(this)">Character Breakdown <span class="toggle-arrow">▾</span></button>' +
        '<div class="breakdown-body">' +
          (r.description ? '<span class="bd-label">Character</span><p>' + esc(r.description).replace(/\n/g, '<br>') + '</p>' : '') +
          (seeking.length ? '<span class="bd-label">Seeking</span><ul>' + seeking.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '') +
          (r.deadline ? '<p><em>Submissions for this role close ' + esc(fmt(r.deadline)) + '</em></p>' : '') +
        '</div>' : '') +
      (r.open ? '' : '<div class="role-summary"><em>Not accepting submissions</em></div>') +
    '</div>';
  }

  function formHtml(key, call, roles) {
    var open = roles.filter(function (r) { return r.open; });
    var f = function (label, inner) { return '<div class="form-field"><label>' + label + '</label>' + inner + '</div>'; };
    return '<div class="casting-form">' +
      '<h3>' + esc(call.film || call.title) + '</h3>' +
      '<p class="form-sub">Submit your audition materials' + (call.deadline ? ' by ' + esc(fmt(call.deadline)) : '') + '.</p>' +
      (call.instructions ? '<p class="form-sub" style="white-space:pre-line">' + esc(call.instructions) + '</p>' : '') +
      '<form id="apply-' + esc(key) + '" novalidate>' +
        f('Role Applying For *', '<select name="role_id" required><option value="">Select role</option>' +
          open.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + (r.role_type ? ' (' + esc(r.role_type) + ')' : '') + '</option>'; }).join('') +
        '</select>') +
        '<div class="form-row-two">' +
          f('Full Name *', '<input type="text" name="full_name" maxlength="200" autocomplete="name" required>') +
          f('Email *', '<input type="email" name="email" maxlength="254" autocomplete="email" required>') +
        '</div>' +
        '<div class="form-row-two">' +
          f('Phone', '<input type="tel" name="phone" maxlength="40" autocomplete="tel">') +
          f('Age *', '<input type="number" name="age" min="16" max="120" required>') +
        '</div>' +
        f('City / Location *', '<input type="text" name="location" maxlength="200" placeholder="City, State" required>') +
        f('Headshot * <span style="text-transform:none;letter-spacing:0">(JPG, PNG, WEBP or HEIC, up to 10 MB)</span>', '<input type="file" name="headshot" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">') +
        f('Or headshot link', '<input type="url" name="headshot_url" maxlength="1000" placeholder="https://drive.google.com/…">') +
        f('Resume <span style="text-transform:none;letter-spacing:0">(PDF or Word, up to 10 MB)</span>', '<input type="file" name="resume" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">') +
        f('Reel / Demo Link', '<input type="url" name="reel_url" maxlength="1000" placeholder="https://vimeo.com/yourwork">') +
        f('Portfolio / Website Link', '<input type="url" name="portfolio_url" maxlength="1000" placeholder="https://">') +
        f('Additional Materials <span style="text-transform:none;letter-spacing:0">(up to 3 files: photos, PDF or Word)</span>', '<input type="file" name="extra" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.doc,.docx">') +
        f('Additional Link', '<input type="url" name="other_url" maxlength="1000" placeholder="Self-tape, IMDb, Actors Access…">') +
        f('Tell us about yourself &amp; why you\'re right for this role *', '<textarea name="about" rows="4" maxlength="5000" required></textarea>') +
        '<div style="position:absolute;left:-10000px" aria-hidden="true"><label>Leave empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="form-field" style="flex-direction:row;align-items:center;gap:10px;margin-top:4px"><input type="checkbox" name="newsletter" style="width:auto;accent-color:#DAAF37"><label style="font-size:0.75rem;color:rgba(234,223,207,0.45);text-transform:none;letter-spacing:0">Also subscribe to all BLEUSKM casting updates</label></div>' +
        '<p class="casting-error" role="alert" style="display:none;color:#ff8a8a;font-size:0.82rem;margin:8px 0"></p>' +
        '<button type="submit" class="form-submit-btn">Submit Audition Materials</button>' +
        '<p class="form-note">Your materials are stored privately and seen only by the BLEUSKM casting team. See our <a href="/privacy" style="color:#DAAF37">privacy policy</a>.</p>' +
      '</form>' +
      '<div class="form-success" style="display:none"><h4>Submission received</h4><p>Thank you for submitting for ' + esc(call.film || call.title) + '. Check your inbox for a confirmation from casting@bleuskm.com. We will reach out directly if we would like to see more.</p></div>' +
    '</div>';
  }

  // ── Film crew application (goes to the existing Crew applications pipeline) ──
  // The film's crew positions are a second Studio OS call, named on the popup with
  // data-crew-call="<key>": each position is a role there, so crew applicants are
  // tracked per position in Studio OS and still reach the existing Crew applications
  // table in Airtable. No open crew call means no crew tab, and the general
  // /crew-application page is not affected either way.
  function crewHtml(call, crewRoles) {
    var f = function (label, inner) { return '<div class="form-field"><label>' + label + '</label>' + inner + '</div>'; };
    var film = esc(call.film || call.title);
    return '<div class="casting-form">' +
      '<h3>' + film + ': Crew</h3>' +
      '<p class="form-sub">Apply to work behind the camera on ' + film + '.</p>' +
      '<form novalidate>' +
        '<div class="form-row-two">' +
          f('Full Name *', '<input type="text" name="name" maxlength="200" autocomplete="name" required>') +
          f('Email *', '<input type="email" name="email" maxlength="254" autocomplete="email" required>') +
        '</div>' +
        '<div class="form-row-two">' +
          f('Phone', '<input type="tel" name="phone" maxlength="40">') +
          f('City *', '<input type="text" name="city" maxlength="200" placeholder="City, State" required>') +
        '</div>' +
        f('Position *', '<select name="role" required><option value="">Select a position</option>' + crewRoles.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('') + '</select>') +
        f('Resume / Portfolio Link *', '<input type="url" name="resume" maxlength="1000" placeholder="Link to your resume, portfolio, or IMDb" required>') +
        f('Reel / Work Samples', '<input type="url" name="reel" maxlength="1000" placeholder="Vimeo, YouTube, or Google Drive link">') +
        f('Gear', '<input type="text" name="gear" maxlength="5000" placeholder="Equipment you own (optional)">') +
        f('Availability *', '<input type="text" name="availability" maxlength="500" placeholder="e.g. Weekends only, Flexible" required>') +
        '<div style="position:absolute;left:-10000px" aria-hidden="true"><label>Leave empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="form-field" style="flex-direction:row;align-items:center;gap:10px;margin-top:4px"><input type="checkbox" name="newsletter" style="width:auto;accent-color:#DAAF37"><label style="font-size:0.75rem;color:rgba(234,223,207,0.45);text-transform:none;letter-spacing:0">Also subscribe to BLEUSKM updates</label></div>' +
        '<p class="casting-error" role="alert" style="display:none;color:#ff8a8a;font-size:0.82rem;margin:8px 0"></p>' +
        '<button type="submit" class="form-submit-btn">Submit Crew Application</button>' +
        '<p class="form-note">Looking for other BLEUSKM projects? Use the <a href="/crew-application" style="color:#DAAF37">general crew application</a>.</p>' +
      '</form>' +
      '<div class="form-success" style="display:none"><h4>Application received</h4><p>Thank you for applying to the ' + film + ' crew. Check your inbox for a confirmation from crew@bleuskm.com.</p></div>' +
    '</div>';
  }

  function wireCrew(box, call, crewCall) {
    var form = box.querySelector('form');
    var err = box.querySelector('.casting-error');
    var btn = form.querySelector('button[type="submit"]');
    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; };
      var show = function (m) { err.textContent = m; err.style.display = m ? 'block' : 'none'; };
      show('');
      if (val('website')) return;
      if (!val('name')) return show(ERRORS.name_required);
      if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(val('email'))) return show(ERRORS.invalid_email);
      if (!val('city')) return show('Please enter your city.');
      if (!val('role')) return show('Please choose a position.');
      if (!/^https?:\/\/\S+$/i.test(val('resume'))) return show('Please add a link to your resume or portfolio (starting with https://).');
      if (val('reel') && !/^https?:\/\/\S+$/i.test(val('reel'))) return show(ERRORS.invalid_links);
      if (!val('availability')) return show('Please tell us your availability.');
      busy = true; btn.disabled = true; btn.textContent = 'Submitting…';
      var nl = form.querySelector('[name="newsletter"]');
      var sel = form.querySelector('[name="role"]');
      var position = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
      rpc('casting_apply', { p: { call: crewCall.slug, role_id: val('role'), access: ACCESS || null,
        full_name: val('name'), email: val('email'), phone: val('phone'), location: val('city'),
        availability: val('availability'), about: val('gear') ? 'Gear: ' + val('gear') : '',
        links: [{ kind: 'resume', url: val('resume'), label: 'Resume / Portfolio' }, { kind: 'reel', url: val('reel'), label: 'Reel / Work Samples' }]
      } }).then(function (res) {
        if (!res || !res.ok) { var e = new Error('apply'); e.code = res && res.error; throw e; }
        // Existing crew pipeline: Airtable Crew applications + Brevo confirmation from crew@.
        var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
        return fetch('/api/form-submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form: 'crew', newsletter: !!(nl && nl.checked), submissionId: id, fields: {
            Name: val('name'), Email: val('email'), Phone: val('phone'), City: val('city'), Role: position,
            'Resume / Portfolio Link': val('resume'), 'Reel / Work Samples': val('reel'), 'Gear List': val('gear'),
            Availability: val('availability'), 'Film Interest': call.film || call.title
          } })
        }).catch(function () { /* saved in Studio OS; Airtable copy is best effort */ });
      }).then(function () { form.style.display = 'none'; box.querySelector('.form-success').style.display = 'block'; })
        .catch(function (e) {
          busy = false; btn.disabled = false; btn.textContent = 'Submit Crew Application';
          var m = ERRORS[e && e.code] || 'Submission failed. Please try again, or email crew@bleuskm.com.';
          show(m.replace('casting@bleuskm.com', 'crew@bleuskm.com').replace('this role', 'this position').replace('another role', 'another position'));
        });
    });
  }

  function addCrewTab(modal, key, call) {
    var crewKey = modal.getAttribute('data-crew-call');
    if (!crewKey) return;
    rpc('casting_public_call', { p_slug: crewKey, p_access: ACCESS || null }).then(function (crewCall) {
      var crewRoles = ((crewCall && crewCall.found && crewCall.open && crewCall.roles) || []).filter(function (r) { return r.open; });
      if (crewRoles.length) buildCrewTab(modal, key, call, crewCall, crewRoles);
    }).catch(function () { /* no crew tab */ });
  }

  function buildCrewTab(modal, key, call, crewCall, crewRoles) {
    var tabsBar = modal.querySelector('.modal-tabs');
    var second = modal.querySelector('[id$="-subscribe"]');
    if (!tabsBar || !second || modal.querySelector('#' + key + '-crew')) return;
    var btn = document.createElement('button');
    btn.className = 'modal-tab'; btn.type = 'button'; btn.textContent = 'Join the Crew';
    tabsBar.appendChild(btn);
    var pane = document.createElement('div');
    pane.className = 'modal-tab-content'; pane.id = key + '-crew';
    pane.innerHTML = crewHtml(call, crewRoles);
    second.parentNode.insertBefore(pane, second.nextSibling);
    wireCrew(pane, call, crewCall);
    var tabs = [].slice.call(modal.querySelectorAll('.modal-tab'));
    var panes = [modal.querySelector('[id$="-info"]'), second, pane];
    tabs.forEach(function (t, i) {
      t.onclick = function () {
        tabs.forEach(function (x) { x.classList.remove('active'); });
        panes.forEach(function (x) { if (x) x.classList.remove('active'); });
        t.classList.add('active'); if (panes[i]) panes[i].classList.add('active');
      };
    });
    var crewLink = modal.querySelector('[id$="-info"] a[href="/crew-application"]');
    if (crewLink) { crewLink.textContent = 'Not an actor? Join the ' + (call.film || 'film') + ' crew →'; crewLink.onclick = function (e) { e.preventDefault(); btn.click(); }; }
  }

  function pickFiles(form) {
    var out = [];
    var add = function (input, kind, max) {
      if (!input || !input.files) return;
      for (var i = 0; i < input.files.length && i < max; i++) out.push({ kind: kind, file: input.files[i] });
    };
    add(form.querySelector('[name="headshot"]'), 'headshot', 1);
    add(form.querySelector('[name="resume"]'), 'resume', 1);
    add(form.querySelector('[name="extra"]'), 'other', 3);
    return out;
  }

  function checkFiles(files) {
    for (var i = 0; i < files.length; i++) {
      var f = files[i].file;
      var t = (f.type || '').toLowerCase();
      if (f.size > MAX_BYTES) return f.name + ' is larger than 10 MB.';
      var ok = files[i].kind === 'headshot' ? IMAGE_TYPES.indexOf(t) >= 0
        : files[i].kind === 'resume' ? DOC_TYPES.indexOf(t) >= 0
        : IMAGE_TYPES.indexOf(t) >= 0 || DOC_TYPES.indexOf(t) >= 0;
      if (!ok) return f.name + ' is not an accepted file type.';
    }
    return '';
  }

  function upload(prefix, item, n) {
    var path = prefix + item.kind + '-' + n + '-' + safeName(item.file.name);
    var h = headers(false);
    h['Content-Type'] = item.file.type || 'application/octet-stream';
    h['x-upsert'] = 'false';
    h['cache-control'] = '3600';
    return fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST', headers: h, body: item.file
    }).then(function (r) {
      return r.ok ? { kind: item.kind, path: path, name: item.file.name } : null;
    }).catch(function () { return null; });
  }

  function headshotLink(kinds, appId) {
    var hub = (window.BLEUSKM_CASTING || {}).hubUrl;
    if (!hub || !appId || !kinds || kinds.indexOf('headshot') < 0) return '';
    return hub.replace(/\/+$/, '') + '/casting/headshot/' + encodeURIComponent(appId);
  }

  function mirrorToAirtable(call, role, v, links, newsletter, kinds, appId) {
    // Existing website flow: Airtable Casting Submissions + Brevo confirmation from casting@.
    if (typeof fetch !== 'function') return Promise.resolve();
    var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    return fetch('/api/form-submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form: 'casting', newsletter: !!newsletter, submissionId: id,
        fields: {
          Name: v.full_name, Email: v.email, Phone: v.phone, Age: v.age, Location: v.location,
          Film: call.film || call.title, Role: role, 'Reel/Portfolio Link': links.reel || links.portfolio || '',
          // An uploaded headshot gets a Studio OS link (opens for signed-in staff only).
          Headshot: links.headshot || headshotLink(kinds, appId),
          // Uploaded files live privately in Studio OS; note them so the Airtable row says where they are.
          About: (kinds && kinds.length) ? String(v.about || '').slice(0, 4800) + '\n\n[Files uploaded to Studio OS: ' + kinds.join(', ') + ']' : v.about
        }
      })
    }).catch(function () { /* Studio OS already has the application */ });
  }

  function wire(key, box, call, roles) {
    var form = box.querySelector('form');
    var err = box.querySelector('.casting-error');
    var btn = form.querySelector('button[type="submit"]');
    var busy = false;
    var show = function (msg) { err.textContent = msg; err.style.display = msg ? 'block' : 'none'; };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      show('');
      var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; };
      if (val('website')) return; // bots fill hidden fields
      var v = { role_id: val('role_id'), full_name: val('full_name'), email: val('email'), phone: val('phone'), age: val('age'), location: val('location'), about: val('about') };
      var links = { headshot: val('headshot_url'), reel: val('reel_url'), portfolio: val('portfolio_url'), other: val('other_url') };
      var files = pickFiles(form);
      if (!v.role_id) return show(ERRORS.role_required);
      if (!v.full_name) return show(ERRORS.name_required);
      if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v.email)) return show(ERRORS.invalid_email);
      if (!/^\d{1,3}$/.test(v.age)) return show('Please enter your age.');
      if (!v.location) return show('Please enter your city.');
      if (!v.about) return show('Please tell us a little about yourself.');
      var hasHeadshotFile = files.some(function (f) { return f.kind === 'headshot'; });
      if (!hasHeadshotFile && !links.headshot) return show('Please upload a headshot or paste a link to one.');
      for (var k in links) if (links[k] && !/^https?:\/\/\S+$/i.test(links[k])) return show(ERRORS.invalid_links);
      var fileErr = checkFiles(files);
      if (fileErr) return show(fileErr);

      busy = true; btn.disabled = true; btn.textContent = 'Submitting…';
      var roleName = (roles.filter(function (r) { return r.id === v.role_id; })[0] || {}).name || '';
      var nl = form.querySelector('[name="newsletter"]');
      var payload = Object.assign({ call: key, access: ACCESS || undefined, links: [
        { kind: 'headshot', url: links.headshot }, { kind: 'reel', url: links.reel },
        { kind: 'portfolio', url: links.portfolio }, { kind: 'other', url: links.other }
      ] }, v);

      rpc('casting_apply', { p: payload }).then(function (res) {
        if (!res || !res.ok) throw { code: (res && res.error) || 'failed' };
        var n = 0;
        btn.textContent = files.length ? 'Uploading files…' : 'Submitting…';
        return files.reduce(function (chain, item) {
          return chain.then(function (done) { n++; return upload(res.upload_prefix, item, n).then(function (u) { if (u) done.push(u); return done; }); });
        }, Promise.resolve([])).then(function (uploaded) {
          return rpc('casting_attach_files', { p_id: res.id, p_token: res.upload_token, p_files: uploaded }).then(function () {
            return { id: res.id, uploaded: uploaded.length, wanted: files.length, kinds: uploaded.map(function (u) { return u.kind === 'other' ? 'additional file' : u.kind; }) };
          });
        });
      }).then(function (r) {
        return mirrorToAirtable(call, roleName, v, links, nl && nl.checked, r.kinds, r.id).then(function () { return r; });
      }).then(function (r) {
        form.style.display = 'none';
        var ok = box.querySelector('.form-success');
        if (r.uploaded < r.wanted) {
          ok.querySelector('p').textContent += ' Some files did not upload; please email them to casting@bleuskm.com.';
        }
        ok.style.display = 'block';
      }).catch(function (e) {
        busy = false; btn.disabled = false; btn.textContent = 'Submit Audition Materials';
        show(ERRORS[e && e.code] || 'Submission failed. Please try again, or email casting@bleuskm.com.');
      });
    });
  }

  function apply(modal) {
    var key = modal.getAttribute('data-casting-call');
    rpc('casting_public_call', { p_slug: key, p_access: ACCESS || null }).then(function (call) {
      if (!call || !call.found) return;
      var roles = call.roles || [];
      var open = call.open && roles.some(function (r) { return r.open; });
      var info = modal.querySelector('[id$="-info"]');
      var second = modal.querySelector('[id$="-subscribe"]');
      var badge = modal.querySelector('.cast-status-badge');
      var tabs = modal.querySelectorAll('.modal-tab');
      if (roles.length && info) {
        var title = info.querySelector('.modal-roles-title');
        info.querySelectorAll('.role-row').forEach(function (el) { el.parentNode.removeChild(el); });
        if (title) title.insertAdjacentHTML('afterend', roles.map(roleHtml).join(''));
      }
      if (!open) {
        if (badge && !call.open) badge.textContent = call.opens_at && new Date(call.opens_at) > new Date() ? 'Casting Opens ' + fmt(call.opens_at) : 'Submissions Closed';
        return; // keep the "notify me" form
      }
      if (badge) { badge.textContent = (call.early_access ? 'Early Access' : 'Now Casting') + (call.deadline ? ' · Closes ' + fmt(call.deadline) : ''); badge.className = 'cast-status-badge badge-open'; }
      if (tabs[1]) tabs[1].textContent = 'Apply Now';
      var cta = info && info.querySelector('.apply-from-info-btn');
      if (cta) cta.textContent = 'Submit Audition Materials →';
      if (second) { second.innerHTML = formHtml(key, call, roles); wire(key, second, call, roles); }
      addCrewTab(modal, key, call);
      var card = document.querySelector('[onclick="openModal(\'' + key + '\')"]');
      var s = card && card.querySelector('.cast-status-badge');
      if (s) { s.textContent = call.early_access ? 'Early Access Open' : 'Now Casting'; s.className = 'cast-status-badge badge-open'; }
      if (location.hash === '#' + key && typeof window.openModal === 'function') window.openModal(key);
    }).catch(function () { /* keep the original page */ });
  }

  function start() {
    document.querySelectorAll('[data-casting-call]').forEach(apply);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
