const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const pages = [
  { group: 'Command', items: [['overview','▦','Overview'], ['braindump','💭','Brain Dump']] },
  { group: 'Production', items: [['projects','🎬','Projects'], ['scripts','📄','Scripts'], ['shotlist','🎥','Shot Lists'], ['casting','🎭','Casting'], ['crew','👥','Crew'], ['callsheet','📋','Call Sheet'], ['festivals','🏆','Festivals']] },
  { group: 'Business', items: [['clients','💼','Clients'], ['newsletter','✉','Newsletter'], ['revenue','◈','Revenue'], ['email','📨','Emails'], ['filmalerts','🎞','Film Alerts']] },
  { group: 'Content', items: [['series','📼','My Series'], ['content','📅','Content Calendar'], ['social','📊','Social Command'], ['aistudio','✨','AI Studio']] },
  { group: 'Life OS', items: [['schedule','☀','Schedule'], ['school','📚','School'], ['selfcare','✿','Self Care'], ['setup','⚙','Setup']] }
];

const tables = {
  casting: 'tblLGmXULNb9ebFxH',
  crew: 'tblCR7Cg3WugORlwO',
  inquiries: 'tblwfk7tmoFhGIia5',
  newsletter: 'tblSMb3y7vrvjbONx'
};

const projects = [
  ['The Final Hand','Pre-Production','Short · Afro-Surrealist · Now Casting'],
  ['Love Me Like This','Pre-Production','Short · Casting Soon'],
  ['The 15th Hour','Development','Short · Psychological'],
  ['Overstood','Development','Short · Character-driven'],
  ['Book of Beginnings','Development','Short'],
  ['As Is','Development','Short / Feature'],
  ['Liminal County','Development','Feature'],
  ['Of Blood and Dominion','Development','Feature']
];

function toast(message){ const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(()=> el.hidden = true, 4500); }
function setStatus(text){ $('#vixStatus').innerHTML = `<span></span> ${text}`; }
function speak(text){ return fetch('/.netlify/functions/elevenlabs-proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: text.slice(0, 650) }) }).then(async r => { if(!r.ok) return; const blob = await r.blob(); if(blob.size) new Audio(URL.createObjectURL(blob)).play().catch(()=>{}); }).catch(()=>{}); }
async function askVix(message){
    message = String(message || '').trim();
  if (!message) {
    toast('Type something for Vix first.');
    return '';
  }
  setStatus('THINKING');
  try{
    const r = await fetch('/.netlify/functions/anthropic-proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message }) });
    const data = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error || `Vix proxy error ${r.status}`);
    const answer = data.text || 'I heard you, but my answer came back empty.';
    $('#reply').textContent = answer; $('#reply').hidden = false;
    setStatus('READY'); speak(answer);
    return answer;
  }catch(err){ setStatus('READY'); toast(err.message); return err.message; }
}

function maybeNavigate(message){
  const m = message.toLowerCase();
  const map = { casting:['casting','audition','submissions'], crew:['crew'], projects:['projects','films','pipeline'], clients:['client','inquiry','proposal'], content:['calendar','caption','content'], social:['social','instagram','tiktok'], scripts:['script','writing'], revenue:['revenue','stripe','invoice'], newsletter:['newsletter','subscribers'], braindump:['brain dump','idea vault'], callsheet:['call sheet','callsheet'] };
  for(const [page, words] of Object.entries(map)){ if(words.some(w => m.includes(w))){ openApp(page); return true; } }
  return false;
}

function buildSidebar(){
  $('#sidebar').innerHTML = pages.map(group => `<div class="navgroup"><p>${group.group}</p>${group.items.map(([id,icon,label]) => `<button class="navitem" data-page="${id}"><span>${icon}</span>${label}</button>`).join('')}</div>`).join('');
  $$('.navitem').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
}

function openApp(page='overview'){ $('#home').classList.add('hidden'); $('#app').hidden = false; showPage(page); }
function closeApp(){ $('#home').classList.remove('hidden'); $('#app').hidden = true; }
function showPage(id){
  $$('.navitem').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  $('#pageTitle').textContent = id.replace(/(^|-)\w/g, s => s.replace('-',' ').toUpperCase());
  $('#main').innerHTML = renderPage(id);
  $('#sidebar').classList.remove('open');
  hydratePage(id);
}

function toolbar(title, sub, actions=''){ return `<div class="toolbar"><div><h2>${title}</h2><p>${sub}</p></div><div class="actions">${actions}</div></div>`; }
function stat(label, value='—', sub=''){ return `<div class="card"><div class="label">${label}</div><div class="value" data-stat="${label}">${value}</div><div class="sub">${sub}</div></div>`; }
function safe(x){ return String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

function renderPage(id){
  if(id === 'overview') return toolbar('Overview','Live Studio Status · BLEUSKM Studios') + `<section class="grid">${stat('Cast Submissions','—','Live from Airtable')}${stat('Project Inquiries','—','Live from Airtable')}${stat('Newsletter Subs','—','Live from Airtable')}${stat('Crew Applications','—','Live from Airtable')}</section><section class="grid two" style="margin-top:12px"><div class="card"><div class="label">This Week</div><div class="list"><div class="row"><i class="dot"></i><div><strong>Review casting submissions</strong><small>Keep The Final Hand moving</small></div></div><div class="row"><i class="dot"></i><div><strong>Prep callback sides</strong><small>Zoom callback ready</small></div></div><div class="row"><i class="dot"></i><div><strong>Build content for casting extension</strong><small>Social command center</small></div></div></div></div><div class="card"><div class="label">Recent Submissions</div><div id="recent" class="list"><small class="sub">Loading...</small></div></div></section>`;
  if(id === 'projects') return toolbar('Projects','All Films · Pipeline','<button class="btn" id="newProject">+ New Project</button>') + `<div class="kanban">${['Development','Pre-Production','Production','Post · Festival'].map(status => `<div class="column"><h3>${status}</h3>${projects.filter(p=>p[1]===status).map(p=>`<article class="project"><h4>${p[0]}</h4><p class="sub">${p[2]}</p><select class="select"><option>${status}</option><option>Development</option><option>Pre-Production</option><option>Production</option><option>Post · Festival</option></select></article>`).join('') || '<p class="sub">Nothing here yet.</p>'}</div>`).join('')}</div>`;
  if(id === 'casting') return toolbar('Casting','The Final Hand · Live Submissions','<button class="outline" id="refreshCasting">Refresh</button>') + `<section class="grid">${stat('Total','—')}${stat('Pending','—')}${stat('Callbacks','—')}${stat('Cast','—')}</section><div class="card" style="margin-top:12px"><div class="label">Submissions</div><div id="castingList" class="list"><p class="sub">Loading...</p></div></div>`;
  if(id === 'crew') return toolbar('Crew','Applications · Production Team') + `<div class="card"><div class="label">Applications</div><div id="crewList" class="list"><p class="sub">Loading...</p></div></div>`;
  if(id === 'clients') return toolbar('Clients','Project inquiries · proposals · contracts','<button class="btn" data-vix="Draft a BLEUSKM client proposal template with payment terms and revision policy.">Vix Proposal</button>') + `<section class="grid two"><div class="card"><div class="label">Inquiries</div><div id="clientList" class="list"><p class="sub">Loading...</p></div></div><div class="card"><div class="label">Services</div><div class="list"><div class="row"><i class="dot"></i><div><strong>Brand Film</strong><small>Concept, direction, edit</small></div></div><div class="row"><i class="dot"></i><div><strong>Creative Direction</strong><small>Visual identity, rollout, shoot planning</small></div></div><div class="row"><i class="dot"></i><div><strong>Content Package</strong><small>Social-first visuals</small></div></div></div></div></section>`;
  if(id === 'braindump') return toolbar('Brain Dump','Idea Vault · capture the spark') + `<div class="card"><textarea id="dump" class="textarea" placeholder="Drop the line, scene, visual, weird dream, character, whole cosmic breadcrumb..."></textarea><br><br><button class="btn" id="saveDump">Save</button> <button class="outline" data-vix-source="dump">Ask Vix</button></div><div class="card" style="margin-top:12px"><div class="label">Saved</div><div id="dumps" class="list"></div></div>`;
  if(id === 'callsheet') return toolbar('Call Sheet','Generate shoot-day command docs','<button class="btn" data-vix="Generate a professional call sheet template for The Final Hand with sections for call time, scenes, location, hospital, weather, parking, contacts, and notes.">Vix Generate</button>') + `<div class="card"><textarea class="textarea" placeholder="Shoot date, location, call time, wrap time, scenes, hospital, parking, notes..."></textarea></div>`;
  if(id === 'shotlist') return toolbar('Shot Lists','Scenes, shots, lens, angle, status','<button class="btn" data-vix="Create a cinematic shot list for The Final Hand lounge opening with lens, angle, movement, and purpose.">Vix Generate</button>') + `<div class="card"><div class="label">Scene 1 · Lounge Opening</div><div class="list"><div class="row"><span class="pill">01</span><div><strong>Wide · 24mm · Eye Level</strong><small>Amber neon through frosted glass. Smoke. Jazz.</small></div></div><div class="row"><span class="pill">02</span><div><strong>Medium · 50mm</strong><small>The Gambler enters and scans the room.</small></div></div></div></div>`;
  if(['scripts','festivals','newsletter','revenue','email','filmalerts','series','content','social','aistudio','schedule','school','selfcare','setup'].includes(id)) return toolbar(id.replace(/([a-z])([A-Z])/g,'$1 $2'), 'Module shell ready') + `<div class="card"><div class="label">Next Build Step</div><p class="sub">This module is scaffolded. Ask Vix or wire this page to Airtable/Brevo/Stripe next.</p><button class="btn" data-vix="Build out the ${id} module for BLEUSKM Studios with practical fields and workflow actions.">Ask Vix to build this module</button></div>`;
  return toolbar('Missing Page','No module yet') + `<p class="sub">Page not found.</p>`;
}

function hydratePage(id){
  $$('[data-vix]').forEach(btn => btn.addEventListener('click', () => askVix(btn.dataset.vix)));
  $$('[data-vix-source]').forEach(btn => btn.addEventListener('click', () => askVix($(`#${btn.dataset.vixSource}`).value)));
  if(id === 'overview') loadOverview();
  if(id === 'casting') { loadCasting(); $('#refreshCasting')?.addEventListener('click', loadCasting); }
  if(id === 'crew') loadRecords('crew', '#crewList', ['Name','Full Name','Applicant'], ['Position','Role','Department']);
  if(id === 'clients') loadRecords('inquiries', '#clientList', ['Name','Full Name','Client Name'], ['Service','Project Type','Budget']);
  if(id === 'braindump') initDump();
}

async function api(path, options){ const r = await fetch(path, options); const data = await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error || `API error ${r.status}`); return data; }
async function getAirtable(table){ return api(`/.netlify/functions/airtable-proxy?table=${encodeURIComponent(table)}`); }

function pick(fields, names){ for(const n of names){ if(fields[n]) return fields[n]; } return '—'; }
async function loadOverview(){
  try{
    const [casting, inquiries, newsletter, crew] = await Promise.all([getAirtable(tables.casting), getAirtable(tables.inquiries), getAirtable(tables.newsletter), getAirtable(tables.crew)]);
    const vals = [casting.records.length, inquiries.records.length, newsletter.records.length, crew.records.length];
    $$('.value').slice(0,4).forEach((el,i)=> el.textContent = vals[i]);
    $('#recent').innerHTML = casting.records.slice(0,5).map(r => `<div class="row"><i class="dot"></i><div><strong>${safe(pick(r.fields,['Name','Full Name','Applicant']))}</strong><small>${safe(pick(r.fields,['Role','Applying For','Character']))} · ${safe(r.fields['Casting Status'] || 'New')}</small></div></div>`).join('') || '<p class="sub">No submissions yet.</p>';
  }catch(err){ toast(err.message); }
}
async function loadCasting(){
  try{
    const { records } = await getAirtable(tables.casting);
    const statuses = records.map(r => r.fields['Casting Status'] || 'New');
    const nums = [records.length, statuses.filter(s => ['New','Under Review'].includes(s)).length, statuses.filter(s => s === 'Callback').length, statuses.filter(s => s === 'Cast').length];
    $$('.value').slice(0,4).forEach((el,i)=> el.textContent = nums[i]);
    $('#castingList').innerHTML = records.map(r => `<div class="row"><i class="dot"></i><div style="flex:1"><strong>${safe(pick(r.fields,['Name','Full Name','Applicant']))}</strong><small>${safe(pick(r.fields,['Role','Applying For','Character']))} · ${safe(pick(r.fields,['Email','Email Address']))}</small></div><select class="select" style="max-width:160px" data-record="${r.id}" data-table="${tables.casting}">${['New','Under Review','Callback','Passed','Cast'].map(s => `<option ${s===(r.fields['Casting Status']||'New')?'selected':''}>${s}</option>`).join('')}</select></div>`).join('') || '<p class="sub">No submissions yet.</p>';
    $$('select[data-record]').forEach(sel => sel.addEventListener('change', () => patchRecord(sel.dataset.table, sel.dataset.record, {'Casting Status': sel.value})));
  }catch(err){ toast(err.message); }
}
async function loadRecords(key, target, nameFields, metaFields){
  try{ const { records } = await getAirtable(tables[key]); $(target).innerHTML = records.map(r => `<div class="row"><i class="dot"></i><div><strong>${safe(pick(r.fields,nameFields))}</strong><small>${safe(pick(r.fields,metaFields))}</small></div></div>`).join('') || '<p class="sub">Nothing yet.</p>'; }
  catch(err){ toast(err.message); }
}
async function patchRecord(table, id, fields){
  try{ await api('/.netlify/functions/airtable-proxy', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ table, id, fields }) }); toast('Saved to Airtable.'); }
  catch(err){ toast(err.message); }
}
function initDump(){
  const key = 'bleuskm_dumps';
  const draw = () => { const list = JSON.parse(localStorage.getItem(key)||'[]'); $('#dumps').innerHTML = list.map(x => `<div class="row"><i class="dot"></i><div><strong>${safe(x.text)}</strong><small>${x.date}</small></div></div>`).join('') || '<p class="sub">No dumps yet.</p>'; };
  $('#saveDump').addEventListener('click', () => { const text = $('#dump').value.trim(); if(!text) return; const list = JSON.parse(localStorage.getItem(key)||'[]'); list.unshift({ text, date:new Date().toLocaleString() }); localStorage.setItem(key, JSON.stringify(list)); $('#dump').value=''; draw(); });
  draw();
}

function initVoice(){
  let recog, listening = false;
  $('#micBtn').addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return toast('Voice needs Chrome or Edge on HTTPS.');
    if(listening && recog) return recog.stop();
    recog = new SR(); recog.lang='en-US'; recog.continuous=false; recog.interimResults=false;
    recog.onstart = () => { listening=true; $('#micBtn').classList.add('listening'); setStatus('LISTENING'); };
    recog.onend = () => { listening=false; $('#micBtn').classList.remove('listening'); setStatus('READY'); };
    recog.onerror = e => toast(`Mic error: ${e.error || 'permission issue'}`);
    recog.onresult = e => { const text = e.results[0][0].transcript; $('#vixInput').value = text; maybeNavigate(text); askVix(text); };
    recog.start();
  });
}
function initOrb(){
  if(!window.THREE) return;
  const canvas = $('#orb'); const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, .1, 1000); camera.position.z = 4;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true }); renderer.setSize(innerWidth, innerHeight);
  const geometry = new THREE.BufferGeometry(); const pts = [];
  for(let i=0;i<180;i++){ const a=Math.random()*Math.PI*2, z=Math.random()*2-1, r=Math.sqrt(1-z*z); pts.push(r*Math.cos(a), r*Math.sin(a), z); }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  const material = new THREE.PointsMaterial({ color:0xff2d78, size:.035 }); const sphere = new THREE.Points(geometry, material); scene.add(sphere);
  const animate = () => { requestAnimationFrame(animate); sphere.rotation.y += .003; sphere.rotation.x += .001; renderer.render(scene,camera); }; animate();
  addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
}
function tick(){ const n = new Date(); $('#clock').textContent = n.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); } setInterval(tick, 15000);

buildSidebar(); initVoice(); initOrb(); tick();
$$('[data-open]').forEach(btn => btn.addEventListener('click', () => openApp(btn.dataset.open)));
$('#backHome').addEventListener('click', closeApp); $('#backVix').addEventListener('click', closeApp); $('#toggleSidebar').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#vixForm').addEventListener('submit', e => { e.preventDefault(); const msg = $('#vixInput').value.trim(); if(!msg) return; $('#vixInput').value=''; maybeNavigate(msg); askVix(msg); });
