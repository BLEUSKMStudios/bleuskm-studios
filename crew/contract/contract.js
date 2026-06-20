const CLOUDINARY_CLOUD='df2x5q7zw';
const CLOUDINARY_PRESET='bleuskm_signatures';
const CONTRACT_SUBMIT='/.netlify/functions/contract-submit';

const params=new URLSearchParams(window.location.search);
const crewName=decodeURIComponent(params.get('name')||'').trim();
const crewEmail=decodeURIComponent(params.get('email')||'').trim();
const crewRole=decodeURIComponent(params.get('role')||'').trim();
const crewFilm=decodeURIComponent(params.get('film')||'The Final Hand').trim();
const sendDate=decodeURIComponent(params.get('senddate')||'').trim();
const allowEdit=params.get('edit')==='1'||params.get('admin')==='1';

function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value||'-'}
function makeInput(id,inputId,value,label){const el=document.getElementById(id);if(!el)return;const input=document.createElement('input');input.id=inputId;input.className='crew-value crew-edit';input.value=value||'';input.placeholder=label;input.setAttribute('aria-label',label);el.replaceWith(input)}
function currentCrewName(){return(document.getElementById('crewNameInput')?.value||crewName||'').trim()}
function currentCrewRole(){return(document.getElementById('crewRoleInput')?.value||crewRole||'').trim()}

setText('crewName',crewName);
setText('crewRole',crewRole);
setText('crewFilm',crewFilm);
setText('successName',crewName||'Crew Member');
if(allowEdit){makeInput('crewName','crewNameInput',crewName,'Name');makeInput('crewRole','crewRoleInput',crewRole,'Role')}
const filmNameEl=document.getElementById('contractFilmName');if(filmNameEl)filmNameEl.textContent=crewFilm;
const dateEl=document.getElementById('dateSigned');if(dateEl)dateEl.textContent=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

const zariaDateEl=document.getElementById('zariaDate');
if(zariaDateEl){
  if(sendDate){
    const d=new Date(sendDate+'T00:00:00');
    zariaDateEl.textContent=isNaN(d)?sendDate:d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  }else{
    zariaDateEl.textContent=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  }
}

let sigMode='draw';
document.querySelectorAll('.sig-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.sig-tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');sigMode=tab.dataset.mode;document.getElementById('panelDraw')?.classList.toggle('hidden',sigMode!=='draw');document.getElementById('panelType')?.classList.toggle('hidden',sigMode!=='type')}));

const canvas=document.getElementById('sigCanvas');
const ctx=canvas?.getContext('2d');
let drawing=false,hasDrawn=false;
function resizeCanvas(){if(!canvas||!ctx)return;const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.strokeStyle='#1a1a1a';ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round'}
function pos(e){const r=canvas.getBoundingClientRect(),s=e.touches?e.touches[0]:e;return{x:s.clientX-r.left,y:s.clientY-r.top}}
function start(e){e.preventDefault();drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)}
function draw(e){e.preventDefault();if(!drawing)return;hasDrawn=true;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke()}
function stop(){drawing=false}
if(canvas&&ctx){resizeCanvas();window.addEventListener('resize',()=>{if(!hasDrawn)resizeCanvas()});canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',draw);canvas.addEventListener('mouseup',stop);canvas.addEventListener('mouseleave',stop);canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',draw,{passive:false});canvas.addEventListener('touchend',stop)}
document.getElementById('clearBtn')?.addEventListener('click',()=>{ctx?.clearRect(0,0,canvas.width,canvas.height);hasDrawn=false;resizeCanvas()});
const typedSig=document.getElementById('typedSig'),typePreview=document.getElementById('typePreview');typedSig?.addEventListener('input',()=>{if(typePreview)typePreview.textContent=typedSig.value});

function signatureBlob(){return new Promise((resolve,reject)=>{if(sigMode==='draw'){if(!hasDrawn)return reject(new Error('Please draw your signature.'));canvas.toBlob(b=>b?resolve(b):reject(new Error('Canvas error')),'image/png');return}const value=(typedSig?.value||'').trim();if(!value)return reject(new Error('Please type your signature.'));const c=document.createElement('canvas');c.width=560;c.height=160;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,560,160);x.font='52px "Brush Script MT", "Segoe Script", cursive';x.fillStyle='#1a1a1a';x.textAlign='center';x.textBaseline='middle';x.fillText(value,280,90);c.toBlob(b=>b?resolve(b):reject(new Error('Canvas error')),'image/png')})}
async function upload(blob){const fd=new FormData(),safe=(currentCrewName()||'signature').replace(/\s+/g,'_');fd.append('file',blob,`sig_${safe}_${Date.now()}.png`);fd.append('upload_preset',CLOUDINARY_PRESET);fd.append('folder','signatures');const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,{method:'POST',body:fd});if(!res.ok)throw new Error('Signature upload failed');return(await res.json()).secure_url}
function showError(msg){const el=document.getElementById('errorMsg');if(!el)return alert(msg);el.textContent=msg;el.classList.remove('hidden');el.scrollIntoView({behavior:'smooth',block:'center'})}

document.getElementById('submitBtn')?.addEventListener('click',async()=>{const btn=document.getElementById('submitBtn'),agree=document.getElementById('agreeCheck'),err=document.getElementById('errorMsg');err?.classList.add('hidden');const name=currentCrewName(),role=currentCrewRole();if(!name||!crewEmail)return showError('Missing name or email. Please use the link from your email.');if(!agree?.checked)return showError('Please check the agreement box before submitting.');btn.disabled=true;btn.textContent='Uploading signature...';try{const blob=await signatureBlob();btn.textContent='Saving agreement...';const signatureUrl=await upload(blob);const res=await fetch(CONTRACT_SUBMIT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:crewEmail,role,signatureUrl,dateSigned:new Date().toISOString().split('T')[0],contractType:'crew-agreement',film:crewFilm})});if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Submission failed')}btn.classList.add('hidden');agree.closest('.agree-wrap')?.classList.add('hidden');document.querySelector('.date-row')?.classList.add('hidden');document.querySelector('.sig-tabs')?.classList.add('hidden');document.querySelector('.sig-panel:not(.hidden)')?.classList.add('hidden');document.getElementById('successBlock')?.classList.remove('hidden')}catch(error){btn.disabled=false;btn.textContent='Submit Agreement';showError(error.message||'Something went wrong. Please try again.')}});
