// ═══════════════════════════════════════════════════════════
//  BACHELOR HOUSE MANAGER v3
//  Admin: Sanjith (full control)
//  Others: can only mark paid
//  Cloud: Firebase Firestore
// ═══════════════════════════════════════════════════════════

const ADMIN_NAME  = 'Sanjith';
const CAN_PRICE   = 40;
const HOUSE_ID    = 'house_config';
const LS_KEY      = 'bh_v3';
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_FULL   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const COLORS      = [
  {bg:'#E1F5EE',fg:'#085041'},{bg:'#E6F1FB',fg:'#0C447C'},
  {bg:'#FAEEDA',fg:'#633806'},{bg:'#FCEBEB',fg:'#501313'},
  {bg:'#EAF3DE',fg:'#27500A'},{bg:'#FBEAF0',fg:'#72243E'},
  {bg:'#EEEDFE',fg:'#26215C'},{bg:'#FCF4E0',fg:'#5C3D00'},
  {bg:'#E0F4FC',fg:'#0A4A6A'},{bg:'#F4E0FC',fg:'#52066B'},
];

// ── STATE ────────────────────────────────────────────────────
let S = {
  firebaseEnabled: false,
  houseName: 'Bachelor House',
  yourName: '',
  isAdmin: false,
  rentPerPerson: 5000,
  members: [],
  waterIncharge: '',
  billIncharge: '',
  // live data
  washSchedule: {},   // {'YYYY-MM-DD': memberName}
  sweepSchedule: {},  // {'YYYY-MM-DD': memberName}
  bathroomSchedule:{},// {'YYYY-MM-DD': memberName}
  waterHistory: [],
  billHistory: [],
  rentData: {},
  activity: [],
  notifications: [],
  sweepDone: {},
  bathroomDone: {},
  // UI
  washWeekOffset: 0,
  rentMonthOffset: 0,
  canCount: 2,
  selectedRentSender: null,
};

// ── HELPERS ──────────────────────────────────────────────────
const ini   = n => { const p=n.trim().split(' '); return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():n.slice(0,2).toUpperCase(); };
const col   = i => COLORS[i%COLORS.length];
const today = () => new Date();
const dKey  = (d=today()) => d.toISOString().split('T')[0];
const fmtD  = d => d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
const fmtDL = d => d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const mKey  = (off=0) => { const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+off);return d.toISOString().slice(0,7); };
const mLbl  = k => { const [y,m]=k.split('-');return new Date(+y,+m-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}); };
const nowStr= () => today().toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const getMon= (d=today()) => { const r=new Date(d);r.setDate(r.getDate()-r.getDay()+1);return r; };
const getSun= (d=today()) => { const r=new Date(d);r.setDate(r.getDate()-r.getDay()+7);return r; };

// ── LOCALSTORAGE FALLBACK ────────────────────────────────────
const lsAll  = () => { try{return JSON.parse(localStorage.getItem(LS_KEY)||'{}')}catch{return{}} };
const lsSave = d  => localStorage.setItem(LS_KEY,JSON.stringify(d));
const lsGet  = p  => lsAll()[p]||null;
const lsSet  = (p,d) => { const a=lsAll();a[p]=d;lsSave(a); };
const lsDel  = p  => { const a=lsAll();delete a[p];lsSave(a); };
const lsArr  = col=> Object.entries(lsAll()).filter(([k])=>k.startsWith(col+'/')).map(([,v])=>v).reverse();
const lsAdd  = (col,d) => { const id=d.id||(Date.now()+'');lsSet(col+'/'+id,{...d,id}); };

// ── FIREBASE LAYER ───────────────────────────────────────────
let db, fb;
async function dbGet(path){
  if(!S.firebaseEnabled)return lsGet(path);
  const snap=await fb.getDoc(fb.doc(db,...path.split('/')));
  return snap.exists()?snap.data():null;
}
async function dbSet(path,data){
  if(!S.firebaseEnabled){lsSet(path,data);return;}
  await fb.setDoc(fb.doc(db,...path.split('/')),data,{merge:true});
  setSyncOK();
}
async function dbUpdate(path,data){
  if(!S.firebaseEnabled){const c=lsGet(path)||{};lsSet(path,{...c,...data});return;}
  try{await fb.updateDoc(fb.doc(db,...path.split('/')),data);}
  catch{await fb.setDoc(fb.doc(db,...path.split('/')),data,{merge:true});}
  setSyncOK();
}
async function dbAdd(col,data){
  if(!S.firebaseEnabled){lsAdd(col,data);return data.id||Date.now()+'';}
  const ref=await fb.addDoc(fb.collection(db,col),{...data,_ts:fb.serverTimestamp()});
  setSyncOK(); return ref.id;
}
async function dbDel(path){
  if(!S.firebaseEnabled){lsDel(path);return;}
  await fb.deleteDoc(fb.doc(db,...path.split('/')));
}
function dbListen(col,cb,ord='_ts'){
  if(!S.firebaseEnabled){cb(lsArr(col));return()=>{};}
  const q=fb.query(fb.collection(db,col),fb.orderBy(ord,'desc'));
  return fb.onSnapshot(q,snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()}))));
}
function dbListenDoc(path,cb){
  if(!S.firebaseEnabled){cb(lsGet(path));return()=>{};}
  return fb.onSnapshot(fb.doc(db,...path.split('/')),snap=>cb(snap.exists()?snap.data():null));
}

// ── SYNC BAR ─────────────────────────────────────────────────
function setSyncOK(){const b=document.getElementById('sync-bar'),i=document.getElementById('sync-icon'),t=document.getElementById('sync-text');if(!b)return;b.className='sync-bar';i.textContent='☁️';t.textContent=S.firebaseEnabled?'Synced to Firebase':'Local mode';}
function setSyncing(){const b=document.getElementById('sync-bar'),i=document.getElementById('sync-icon'),t=document.getElementById('sync-text');if(!b)return;b.className='sync-bar syncing';i.textContent='🔄';t.textContent='Saving...';}

// ── LOADING ──────────────────────────────────────────────────
function hideLoading(){const el=document.getElementById('loading-screen');if(el){el.style.opacity='0';el.style.transition='opacity .4s';setTimeout(()=>el.classList.add('hidden'),400);}}

// ── STARTUP ──────────────────────────────────────────────────
window.startApp = async function(firebaseReady){
  S.firebaseEnabled=firebaseReady;
  if(firebaseReady){db=window._fb.db;fb=window._fb;}
  const cfg=await dbGet('config/'+HOUSE_ID);
  const savedName=localStorage.getItem('bh_yourName');
  setTimeout(hideLoading,300);
  if(!cfg){document.getElementById('setup-screen').classList.remove('hidden');setupListeners();return;}
  applyConfig(cfg);
  if(!savedName||!S.members.find(m=>m.name===savedName)){showJoinScreen(cfg);return;}
  S.yourName=savedName;
  S.isAdmin=(savedName===ADMIN_NAME);
  launchApp();
};

function applyConfig(cfg){
  S.houseName=cfg.houseName||'Bachelor House';
  S.rentPerPerson=cfg.rentPerPerson||5000;
  S.waterIncharge=cfg.waterIncharge||ADMIN_NAME;
  S.billIncharge=cfg.billIncharge||ADMIN_NAME;
  S.members=(cfg.members||[]).map((m,i)=>({name:m.name,initials:ini(m.name),color:col(i)}));
}

// ── SETUP ────────────────────────────────────────────────────
const _setupMembers=[];
function setupListeners(){
  document.getElementById('setup-member-input').addEventListener('keydown',e=>{if(e.key==='Enter')setupAddMember();});
}
window.setupAddMember=function(){
  const inp=document.getElementById('setup-member-input');
  const name=inp.value.trim();if(!name)return;
  if(_setupMembers.includes(name)){showToast('Already added!');return;}
  _setupMembers.push(name);inp.value='';inp.focus();renderSetupChips();
};
window.removeSetupMember=function(i){_setupMembers.splice(i,1);renderSetupChips();};
function renderSetupChips(){
  const el=document.getElementById('setup-members-list');el.innerHTML='';
  _setupMembers.forEach((n,i)=>{
    const c=document.createElement('span');c.className='setup-chip';
    c.innerHTML=n+' <span onclick="removeSetupMember('+i+')" style="opacity:.6;cursor:pointer;font-size:16px">×</span>';
    el.appendChild(c);
  });
  document.getElementById('setup-member-count').textContent=_setupMembers.length>0?_setupMembers.length+' housemates added':'';
  document.getElementById('setup-go-btn').disabled=_setupMembers.length<2;
}
window.finishSetup=async function(){
  const yourName=document.getElementById('setup-your-name').value.trim();
  const houseName=document.getElementById('setup-house-name').value.trim();
  const rent=parseInt(document.getElementById('setup-rent').value)||5000;
  if(!yourName){showToast('Enter your name');return;}
  if(_setupMembers.length<2){showToast('Add at least 2 housemates');return;}
  document.getElementById('setup-go-btn').disabled=true;
  document.getElementById('setup-go-btn').textContent='Creating...';
  const cfg={houseName:houseName||'Bachelor House',rentPerPerson:rent,
    members:_setupMembers.map(n=>({name:n})),
    waterIncharge:yourName,billIncharge:yourName,
    createdAt:new Date().toISOString(),createdBy:yourName};
  await dbSet('config/'+HOUSE_ID,cfg);
  localStorage.setItem('bh_yourName',yourName);
  applyConfig(cfg);S.yourName=yourName;S.isAdmin=(yourName===ADMIN_NAME);
  document.getElementById('setup-screen').classList.add('hidden');
  launchApp();
};

// ── JOIN ─────────────────────────────────────────────────────
let _joinSelected=null;
function showJoinScreen(cfg){
  document.getElementById('join-house-title').textContent='Join '+cfg.houseName;
  const chips=document.getElementById('join-members-chips');chips.innerHTML='';
  (cfg.members||[]).forEach(m=>{
    const c=document.createElement('span');c.className='setup-chip selectable';c.textContent=m.name;
    c.onclick=()=>{_joinSelected=m.name;document.querySelectorAll('#join-members-chips .setup-chip').forEach(x=>x.classList.remove('selected-join'));c.classList.add('selected-join');document.getElementById('join-go-btn').disabled=false;document.getElementById('join-status').textContent='Joining as '+m.name;};
    chips.appendChild(c);
  });
  document.getElementById('join-screen').classList.remove('hidden');
}
window.joinHouse=function(){
  if(!_joinSelected){showToast('Pick your name');return;}
  localStorage.setItem('bh_yourName',_joinSelected);
  S.yourName=_joinSelected;S.isAdmin=(_joinSelected===ADMIN_NAME);
  document.getElementById('join-screen').classList.add('hidden');
  launchApp();
};
window.switchUser=function(){localStorage.removeItem('bh_yourName');location.reload();};

// ── LAUNCH APP ────────────────────────────────────────────────
const _unsubs=[];
function launchApp(){
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('topbar-house-name').textContent=S.houseName;
  document.getElementById('topbar-date').textContent=fmtDL(today());
  if(S.isAdmin)document.getElementById('admin-badge').classList.remove('hidden');
  setSyncOK();
  showAdminSections();

  // Real-time listeners
  _unsubs.push(
    dbListenDoc('config/'+HOUSE_ID,cfg=>{if(!cfg)return;applyConfig(cfg);document.getElementById('topbar-house-name').textContent=S.houseName;renderHome();renderMembersSettings();updateInchargeSelects();renderWashing();renderSweep();renderBathroom();}),
    dbListenDoc('schedules/wash',d=>{S.washSchedule=d||{};renderWashing();}),
    dbListenDoc('schedules/sweep',d=>{S.sweepSchedule=d||{};renderSweep();}),
    dbListenDoc('schedules/bathroom',d=>{S.bathroomSchedule=d||{};renderBathroom();}),
    dbListen('water_entries',e=>{S.waterHistory=e;renderWater();renderHome();}),
    dbListen('bill_entries',e=>{S.billHistory=e;renderBill();renderHome();}),
    dbListen('activity',a=>{S.activity=a;renderHome();}),
    dbListen('notifications',n=>{S.notifications=n;if(n.length)document.getElementById('notif-dot').classList.remove('hidden');}),
    dbListen('rent',r=>{S.rentData={};r.forEach(x=>S.rentData[x.id]=x);renderRent();renderHome();}),
    dbListenDoc('sweep_done',d=>{S.sweepDone=d||{};renderSweep();}),
    dbListenDoc('bathroom_done',d=>{S.bathroomDone=d||{};renderBathroom();})
  );

  renderHome();renderMembersSettings();updateSettingsFields();renderCloudStatus();
  updateWaterCounter();updateBillPreview();
  scheduleNotifications();
  registerSW();
  initWashEditor();initSweepEditor();
}

function showAdminSections(){
  const show=el=>{const e=document.getElementById(el);if(e)e.classList.toggle('hidden',!S.isAdmin);};
  const hide=el=>{const e=document.getElementById(el);if(e)e.classList.toggle('hidden',S.isAdmin);};
  show('wash-admin-section');show('water-admin-section');show('bill-admin-section');
  show('sweep-admin-section');show('rent-admin-section');show('settings-admin-only');
  hide('water-member-notice');hide('bill-member-notice');
  document.getElementById('settings-your-name').textContent=S.yourName;
  document.getElementById('settings-your-role').textContent=S.isAdmin?'👑 Admin — full access':'Member — can mark payments only';
}

// ── TAB ───────────────────────────────────────────────────────
const ALL_TABS=['home','washing','water','rent','bill','sweep','bathroom','settings'];
window.showTab=function(name){
  ALL_TABS.forEach(t=>{
    document.getElementById('pane-'+t).classList.toggle('active',t===name);
    const n=document.getElementById('nav-'+t);if(n)n.classList.toggle('active',t===name);
  });
  if(name==='settings'){renderMembersSettings();updateSettingsFields();renderCloudStatus();updateInchargeSelects();}
};

// ── HOME ──────────────────────────────────────────────────────
function renderHome(){
  const washer=getTodayWasher();
  if(washer){
    document.getElementById('home-washer-name').textContent=washer+(washer===S.yourName?' (you)':'');
    document.getElementById('home-washer-badge').textContent='Today';
    document.getElementById('home-washer-sub').textContent=washer===S.yourName?"It's YOUR turn today!":'Reminder sent at 3:00 PM';
  }
  const mk=mKey(0);const rd=S.rentData[mk]||{payments:{}};
  const paidRent=S.members.filter(m=>rd.payments&&rd.payments[m.name]).length;
  const myPendingWater=S.waterHistory.filter(w=>w.payments&&!w.payments[S.yourName]&&w.addedBy!==S.yourName).length;
  const myPendingBill=S.billHistory.filter(b=>b.payments&&!b.payments[S.yourName]&&b.addedBy!==S.yourName).length;
  document.getElementById('home-quick-stats').innerHTML=`
    <div class="stat-box"><div class="stat-val" style="color:${myPendingWater>0?'#854F0B':'#1D9E75'}">${myPendingWater}</div><div class="stat-label">Pending water dues</div></div>
    <div class="stat-box"><div class="stat-val" style="color:${myPendingBill>0?'#854F0B':'#1D9E75'}">${myPendingBill}</div><div class="stat-label">Pending bill dues</div></div>
    <div class="stat-box"><div class="stat-val">${paidRent}/${S.members.length}</div><div class="stat-label">Rent paid</div></div>
    <div class="stat-box"><div class="stat-val">${getTodaySweeper()||'—'}</div><div class="stat-label">Today's sweeper</div></div>
  `;
  const al=document.getElementById('home-activity');if(!al)return;
  if(!S.activity.length){al.innerHTML='<div class="empty-state">No activity yet</div>';return;}
  al.innerHTML='';S.activity.slice(0,12).forEach(a=>{
    const d=document.createElement('div');d.className='activity-item';
    d.innerHTML=`<div class="activity-icon-wrap">${a.icon}</div><div class="activity-text"><div class="activity-title">${a.title}</div><div class="activity-time">${a.time||''}</div></div>`;
    al.appendChild(d);
  });
}
async function addActivity(icon,title){await dbAdd('activity',{icon,title,time:nowStr()});}
async function addNotif(icon,title){await dbAdd('notifications',{icon,title,time:nowStr()});document.getElementById('notif-dot').classList.remove('hidden');}

// ── WASHING SCHEDULE ──────────────────────────────────────────
function getDefaultWasher(dateObj){
  if(!S.members.length)return null;
  const epoch=new Date(2024,0,1);
  const diff=Math.floor((dateObj-epoch)/86400000);
  return S.members[((diff%S.members.length)+S.members.length)%S.members.length].name;
}
function getTodayWasher(){return S.washSchedule[dKey()]||getDefaultWasher(today());}
function getWasherForDate(d){return S.washSchedule[dKey(d)]||getDefaultWasher(d);}
function getYesterdayWasher(){const d=new Date(today());d.setDate(d.getDate()-1);return S.washSchedule[dKey(d)]||getDefaultWasher(d);}

// Editor for admin to customize week
function initWashEditor(){if(!S.isAdmin)return;renderWashEditor();}
function renderWashEditor(){
  const el=document.getElementById('wash-week-editor');if(!el)return;
  el.innerHTML='';
  const mon=getMon();mon.setDate(mon.getDate()+S.washWeekOffset*7);
  for(let i=0;i<7;i++){
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const dk=dKey(d);const current=S.washSchedule[dk]||getDefaultWasher(d);
    const row=document.createElement('div');row.className='editor-row';
    row.innerHTML=`<span class="editor-day">${DAYS[d.getDay()]} ${d.getDate()}</span>
      <select class="editor-select" data-date="${dk}">
        ${S.members.map(m=>`<option value="${m.name}" ${m.name===current?'selected':''}>${m.name}</option>`).join('')}
      </select>`;
    el.appendChild(row);
  }
}
window.saveWashSchedule=async function(){
  if(!S.isAdmin){showToast('Only admin can edit');return;}
  setSyncing();
  const selects=document.querySelectorAll('#wash-week-editor .editor-select');
  const updates={...S.washSchedule};
  selects.forEach(s=>{updates[s.dataset.date]=s.value;});
  await dbSet('schedules/wash',updates);
  showToast('✅ Washing schedule saved!');
  await addActivity('🧺','Admin updated washing schedule');
};

let _washWeekOff=0;
window.changeWeek=function(d){_washWeekOff+=d;S.washWeekOffset=_washWeekOff;renderWashing();renderWashEditor();};
function renderWashing(){
  const ws=document.getElementById('wash-schedule');if(!ws)return;ws.innerHTML='';
  const mon=getMon();mon.setDate(mon.getDate()+_washWeekOff*7);
  const lbl=_washWeekOff===0?'This week':_washWeekOff===1?'Next week':_washWeekOff===-1?'Last week':_washWeekOff>0?`+${_washWeekOff} weeks`:`${_washWeekOff} weeks`;
  document.getElementById('wash-week-label').textContent=lbl;
  for(let i=0;i<7;i++){
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const isToday=dKey(d)===dKey();
    const name=getWasherForDate(d);
    const m=S.members.find(x=>x.name===name)||{initials:name?name.slice(0,2).toUpperCase():'?',color:col(0)};
    const isPast=d<today()&&!isToday;
    const row=document.createElement('div');row.className='schedule-row'+(isToday?' today-row':'');
    let badge=isPast?'<span class="sched-badge" style="background:#f5f5f3;color:#888">done</span>':
              isToday?'<span class="sched-badge" style="background:#E1F5EE;color:#085041">today 📍</span>':
              '<span class="sched-badge" style="background:#f5f5f3;color:#888">upcoming</span>';
    row.innerHTML=`<span class="sched-day">${isToday?'Today':fmtD(d)}</span>
      <div class="sched-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
      <span class="sched-name">${name||'—'}${name===S.yourName?' (you)':''}</span>${badge}`;
    ws.appendChild(row);
  }
}

// ── WATER ─────────────────────────────────────────────────────
let _canCount=2;
window.changeCans=function(d){_canCount=Math.max(1,_canCount+d);updateWaterCounter();};
function updateWaterCounter(){
  const total=_canCount*CAN_PRICE;
  const per=S.members.length>0?Math.ceil(total/S.members.length):total;
  document.getElementById('can-count-disp').textContent=_canCount;
  document.getElementById('water-total-disp').textContent='₹'+total;
  document.getElementById('water-share-disp').textContent='₹'+per;
  document.getElementById('water-split-count').textContent=S.members.length||7;
}
window.logWaterCans=async function(){
  if(!S.isAdmin&&S.yourName!==S.waterIncharge){showToast('Only incharge can log water cans');return;}
  const btn=document.getElementById('log-water-btn');if(btn)btn.disabled=true;
  setSyncing();
  const total=_canCount*CAN_PRICE;
  const perPerson=Math.ceil(total/S.members.length);
  const payments={};payments[S.yourName]=true;
  await dbAdd('water_entries',{id:Date.now()+'',date:dKey(),displayDate:fmtD(today()),cans:_canCount,total,perPerson,addedBy:S.yourName,payments});
  await addActivity('💧',`${S.yourName} added ${_canCount} water can${_canCount>1?'s':''} — ₹${perPerson} each`);
  await addNotif('💧',`💧 Water cans added! Pay ₹${perPerson} to ${S.yourName}`);
  pushNotif('💧 Water cans added!',`Please pay ₹${perPerson} to ${S.yourName}`);
  if(btn)btn.disabled=false;
  showToast(`✅ Logged! All housemates notified to pay ₹${perPerson}`);
};
window.toggleWaterPayment=async function(entryId,memberName){
  if(memberName===S.yourName||!entryId){
    const entry=S.waterHistory.find(e=>e.id===entryId);
    if(!entry||memberName!==S.yourName)return;
  }
  // Anyone can mark their own payment; admin can mark others
  if(memberName!==S.yourName&&!S.isAdmin){showToast('You can only mark your own payment');return;}
  const entry=S.waterHistory.find(e=>e.id===entryId);if(!entry)return;
  const wasPaid=!!(entry.payments&&entry.payments[memberName]);
  setSyncing();
  await dbUpdate('water_entries/'+entryId,{[`payments.${memberName}`]:!wasPaid});
  if(!wasPaid)await addActivity('✅',`${memberName} paid water share — ₹${entry.perPerson}`);
  showToast(!wasPaid?`✅ ${memberName} marked paid`:`↩ Unmarked`);
};
window.toggleWaterEntry=function(h){const b=h.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none';};
function renderWater(){
  updateWaterCounter();
  const c=document.getElementById('water-history-list');if(!c)return;
  let myOwed=0;
  S.waterHistory.forEach(e=>{if(e.payments&&!e.payments[S.yourName]&&e.addedBy!==S.yourName)myOwed+=e.perPerson;});
  const oe=document.getElementById('water-total-owed');if(oe)oe.textContent=myOwed>0?`· You owe ₹${myOwed}`:'';
  if(!S.waterHistory.length){c.innerHTML='<div class="empty-state">No water can entries yet</div>';return;}
  c.innerHTML='';
  S.waterHistory.forEach(entry=>{
    const paidCount=S.members.filter(m=>entry.payments&&entry.payments[m.name]).length;
    const allPaid=paidCount===S.members.length;
    const div=document.createElement('div');div.className='water-entry';
    div.innerHTML=`<div class="water-entry-header" onclick="toggleWaterEntry(this)">
        <div><div class="water-entry-title">${entry.cans} can${entry.cans>1?'s':''} · ${entry.displayDate||entry.date}</div>
        <div class="water-entry-meta">₹${entry.total} total · ₹${entry.perPerson}/person · by ${entry.addedBy||'?'}</div></div>
        <span style="font-size:12px;padding:4px 10px;border-radius:20px;font-weight:500;background:${allPaid?'#E1F5EE':'#FAEEDA'};color:${allPaid?'#085041':'#854F0B'}">${paidCount}/${S.members.length} paid</span>
      </div>
      <div class="water-entry-body" style="display:none">
        ${S.members.map(m=>{
          const paid=!!(entry.payments&&entry.payments[m.name]);
          const isIncharge=m.name===entry.addedBy;
          const canToggle=m.name===S.yourName||S.isAdmin;
          return `<div class="payment-row">
            <div class="payment-person">
              <div class="pay-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
              <div><div class="pay-name">${m.name}${m.name===S.yourName?' (you)':''}</div><div class="pay-amount">₹${entry.perPerson}</div></div>
            </div>
            <button class="pay-btn ${paid?'paid':'unpaid'}${isIncharge?' mine-paid':''}"
              onclick="${canToggle&&!isIncharge?`toggleWaterPayment('${entry.id}','${m.name}')`:''}"
              ${!canToggle||isIncharge?'disabled':''}>
              ${isIncharge?'paid (incharge)':paid?'paid ✓':'mark paid'}
            </button></div>`;
        }).join('')}
      </div>`;
    c.appendChild(div);
  });
}

// ── ELECTRICITY BILL ──────────────────────────────────────────
window.updateBillPreview=function(){
  const amt=parseInt(document.getElementById('bill-amount-input')?.value)||0;
  const per=S.members.length>0?Math.ceil(amt/S.members.length):amt;
  const prev=document.getElementById('bill-preview');
  const pp=document.getElementById('bill-per-person');
  if(prev){prev.style.display=amt>0?'block':'none';}
  if(pp)pp.textContent='₹'+per;
};
window.logBill=async function(){
  if(!S.isAdmin&&S.yourName!==S.billIncharge){showToast('Only bill incharge can add bills');return;}
  const monthInp=document.getElementById('bill-month-input');
  const amtInp=document.getElementById('bill-amount-input');
  const month=monthInp?.value;const amt=parseInt(amtInp?.value)||0;
  if(!month){showToast('Select bill month');return;}
  if(!amt){showToast('Enter bill amount');return;}
  const per=Math.ceil(amt/S.members.length);
  setSyncing();
  const payments={};payments[S.yourName]=true;
  await dbAdd('bill_entries',{id:Date.now()+'',month,amount:amt,perPerson:per,addedBy:S.yourName,date:dKey(),payments});
  await addActivity('⚡',`${S.yourName} added electricity bill ₹${amt} for ${mLbl(month)} — ₹${per} each`);
  await addNotif('⚡',`⚡ Electricity bill ₹${amt} added! Pay ₹${per} to ${S.yourName}`);
  pushNotif('⚡ Electricity bill!',`Bill for ${mLbl(month)}: Pay ₹${per} to ${S.yourName}`);
  if(monthInp)monthInp.value='';if(amtInp)amtInp.value='';
  updateBillPreview();
  showToast(`✅ Bill added! All notified to pay ₹${per}`);
};
window.toggleBillPayment=async function(entryId,memberName){
  if(memberName!==S.yourName&&!S.isAdmin){showToast('You can only mark your own payment');return;}
  const entry=S.billHistory.find(e=>e.id===entryId);if(!entry)return;
  const wasPaid=!!(entry.payments&&entry.payments[memberName]);
  setSyncing();
  await dbUpdate('bill_entries/'+entryId,{[`payments.${memberName}`]:!wasPaid});
  if(!wasPaid)await addActivity('✅',`${memberName} paid electricity bill — ₹${entry.perPerson}`);
  showToast(!wasPaid?`✅ Marked paid`:`↩ Unmarked`);
};
window.toggleBillEntry=function(h){const b=h.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none';};
function renderBill(){
  const c=document.getElementById('bill-history-list');if(!c)return;
  if(!S.billHistory.length){c.innerHTML='<div class="empty-state">No bill entries yet</div>';return;}
  c.innerHTML='';
  S.billHistory.forEach(entry=>{
    const paidCount=S.members.filter(m=>entry.payments&&entry.payments[m.name]).length;
    const allPaid=paidCount===S.members.length;
    const div=document.createElement('div');div.className='water-entry';
    div.innerHTML=`<div class="water-entry-header" onclick="toggleBillEntry(this)">
        <div><div class="water-entry-title">⚡ ${mLbl(entry.month)} bill · ₹${entry.amount}</div>
        <div class="water-entry-meta">₹${entry.perPerson}/person · added by ${entry.addedBy||'?'}</div></div>
        <span style="font-size:12px;padding:4px 10px;border-radius:20px;font-weight:500;background:${allPaid?'#E1F5EE':'#FAEEDA'};color:${allPaid?'#085041':'#854F0B'}">${paidCount}/${S.members.length} paid</span>
      </div>
      <div class="water-entry-body" style="display:none">
        ${S.members.map(m=>{
          const paid=!!(entry.payments&&entry.payments[m.name]);
          const isIncharge=m.name===entry.addedBy;
          const canToggle=m.name===S.yourName||S.isAdmin;
          return `<div class="payment-row">
            <div class="payment-person">
              <div class="pay-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
              <div><div class="pay-name">${m.name}${m.name===S.yourName?' (you)':''}</div><div class="pay-amount">₹${entry.perPerson}</div></div>
            </div>
            <button class="pay-btn ${paid?'paid':'unpaid'}${isIncharge?' mine-paid':''}"
              onclick="${canToggle&&!isIncharge?`toggleBillPayment('${entry.id}','${m.name}')`:''}"
              ${!canToggle||isIncharge?'disabled':''}>
              ${isIncharge?'paid (incharge)':paid?'paid ✓':'mark paid'}
            </button></div>`;
        }).join('')}
      </div>`;
    c.appendChild(div);
  });
}

// ── RENT ─────────────────────────────────────────────────────
window.changeRentMonth=function(d){S.rentMonthOffset+=d;renderRent();};
function renderRent(){
  const mk=mKey(S.rentMonthOffset);
  document.getElementById('rent-month-label').textContent=mLbl(mk);
  if(!S.rentData[mk])S.rentData[mk]={payments:{},sentBy:null};
  const rd=S.rentData[mk];
  const paidCount=S.members.filter(m=>rd.payments&&rd.payments[m.name]).length;
  document.getElementById('rent-summary').innerHTML=`
    <div class="rent-stat"><div class="rent-stat-val" style="color:#1D9E75">${paidCount}</div><div class="rent-stat-label">Paid</div></div>
    <div class="rent-stat"><div class="rent-stat-val" style="color:#854F0B">${S.members.length-paidCount}</div><div class="rent-stat-label">Pending</div></div>
    <div class="rent-stat"><div class="rent-stat-val">₹${(paidCount*S.rentPerPerson/1000).toFixed(1)}k</div><div class="rent-stat-label">Collected</div></div>
  `;
  const rl=document.getElementById('rent-list');if(!rl)return;rl.innerHTML='';
  if(!S.members.length){rl.innerHTML='<div class="empty-state">Add housemates in Settings</div>';return;}
  const card=document.createElement('div');card.className='rent-list-card';
  S.members.forEach(m=>{
    const paid=!!(rd.payments&&rd.payments[m.name]);
    const canToggle=m.name===S.yourName||S.isAdmin;
    const row=document.createElement('div');row.className='rent-row';
    row.innerHTML=`<div class="rent-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
      <span class="rent-person-name">${m.name}${m.name===S.yourName?' (you)':''}</span>
      <span class="rent-amount-label">₹${S.rentPerPerson.toLocaleString()}</span>
      <button class="rent-pay-btn ${paid?'paid':'unpaid'}" onclick="${canToggle?`toggleRentPaid('${mk}','${m.name}')`:''}" ${!canToggle?'disabled':''}>
        ${paid?'paid ✓':'mark paid'}
      </button>`;
    card.appendChild(row);
  });
  rl.appendChild(card);
  if(S.isAdmin){
    const chips=document.getElementById('rent-sender-chips');if(chips){chips.innerHTML='';
    S.members.forEach(m=>{const c=document.createElement('span');c.className='chip'+(S.selectedRentSender===m.name?' selected':'');c.textContent=m.name;c.onclick=()=>{S.selectedRentSender=m.name;renderRent();};chips.appendChild(c);});}
    const ss=document.getElementById('rent-sent-status');if(ss)ss.textContent=rd.sentBy?`✅ Sent by ${rd.sentBy}`:'';
  }
}
window.toggleRentPaid=async function(mk,name){
  if(name!==S.yourName&&!S.isAdmin){showToast('You can only mark your own rent');return;}
  if(!S.rentData[mk])S.rentData[mk]={payments:{},sentBy:null};
  const wasPaid=!!(S.rentData[mk].payments&&S.rentData[mk].payments[name]);
  setSyncing();
  await dbUpdate('rent/'+mk,{[`payments.${name}`]:!wasPaid,month:mk});
  if(!wasPaid){
    await addActivity('💳',`${name} paid rent for ${mLbl(mk)}`);
    await addNotif('💳',`${name} paid rent for ${mLbl(mk)}`);
    pushNotif('💳 Rent paid!',`${name} has paid rent for ${mLbl(mk)}`);
  }
  showToast(!wasPaid?`✅ ${name} rent marked paid`:`↩ Unmarked`);
};
window.markRentSent=async function(){
  if(!S.isAdmin){showToast('Only admin can mark rent sent');return;}
  if(!S.selectedRentSender){showToast('Select who sent rent');return;}
  const mk=mKey(S.rentMonthOffset);setSyncing();
  await dbUpdate('rent/'+mk,{sentBy:S.selectedRentSender,month:mk});
  await addActivity('🏠',`${S.selectedRentSender} sent rent to owner for ${mLbl(mk)}`);
  await addNotif('🏠',`Rent for ${mLbl(mk)} sent to owner by ${S.selectedRentSender}`);
  pushNotif('🏠 Rent sent!',`${S.selectedRentSender} sent rent to owner`);
  showToast(`✅ Marked: ${S.selectedRentSender} sent rent`);
};

// ── SWEEP ────────────────────────────────────────────────────
function getDefaultSweeper(dateObj){
  if(!S.members.length)return null;
  const epoch=new Date(2024,0,1);
  const diff=Math.floor((dateObj-epoch)/86400000);
  // one person every 2 days
  return S.members[Math.floor(diff/2)%S.members.length].name;
}
function getTodaySweeper(){return S.sweepSchedule[dKey()]||getDefaultSweeper(today())||'—';}
function getSweeperForDate(d){return S.sweepSchedule[dKey(d)]||getDefaultSweeper(d);}

function initSweepEditor(){if(!S.isAdmin)return;renderSweepEditor();}
function renderSweepEditor(){
  const el=document.getElementById('sweep-week-editor');if(!el)return;el.innerHTML='';
  const mon=getMon();mon.setDate(mon.getDate()+S.washWeekOffset*7);
  // Show every 2nd day
  for(let i=0;i<7;i+=2){
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const dk=dKey(d);const current=S.sweepSchedule[dk]||getDefaultSweeper(d);
    const row=document.createElement('div');row.className='editor-row';
    row.innerHTML=`<span class="editor-day">${DAYS[d.getDay()]} ${d.getDate()}&ndash;${d.getDate()+1}</span>
      <select class="editor-select" data-date="${dk}">
        ${S.members.map(m=>`<option value="${m.name}" ${m.name===current?'selected':''}>${m.name}</option>`).join('')}
      </select>`;
    el.appendChild(row);
  }
}
window.saveSweepSchedule=async function(){
  if(!S.isAdmin){showToast('Only admin can edit');return;}
  setSyncing();
  const selects=document.querySelectorAll('#sweep-week-editor .editor-select');
  const updates={...S.sweepSchedule};
  selects.forEach(s=>{
    updates[s.dataset.date]=s.value;
    // also set next day to same person
    const d=new Date(s.dataset.date);d.setDate(d.getDate()+1);updates[dKey(d)]=s.value;
  });
  await dbSet('schedules/sweep',updates);
  showToast('✅ Sweep schedule saved!');
  await addActivity('🧹','Admin updated sweeping schedule');
};
function renderSweep(){
  const c=document.getElementById('sweep-schedule-list');if(!c)return;c.innerHTML='';
  if(!S.members.length){c.innerHTML='<div class="empty-state">Add housemates in Settings</div>';return;}
  const list=document.createElement('div');list.className='sweep-list';
  for(let i=-2;i<12;i++){
    const d=new Date(today());d.setDate(d.getDate()+i);
    if(i%2!==0&&i!==0)continue; // show every 2 days
    const name=getSweeperForDate(d);
    const dk=dKey(d);const done=!!S.sweepDone[dk];
    const isToday=dk===dKey();const isPast=d<today()&&!isToday;
    const m=S.members.find(x=>x.name===name)||{initials:name?name.slice(0,2).toUpperCase():'?',color:col(0)};
    const row=document.createElement('div');
    row.className='sweep-row'+(done||isPast?' done-row':isToday?' today-row':i===2?' next-row':'');
    let badge=done?'<span class="sweep-badge" style="background:#E1F5EE;color:#085041">done ✓</span>':
              isPast?'<span class="sweep-badge" style="background:#f5f5f3;color:#888">past</span>':
              isToday?'<span class="sweep-badge" style="background:#E1F5EE;color:#085041">today 🧹</span>':
              i===2?'<span class="sweep-badge" style="background:#FAEEDA;color:#854F0B">next</span>':'';
    row.innerHTML=`<span class="sweep-date">${isToday?'Today':fmtD(d)}</span>
      <div class="sched-avatar" style="background:${m.color.bg};color:${m.color.fg};margin-right:8px">${m.initials}</div>
      <span class="sweep-pair">${name||'—'}${name===S.yourName?' (you)':''}</span>${badge}`;
    list.appendChild(row);
  }
  c.appendChild(list);
}
window.markSweepDone=async function(){
  const dk=dKey();setSyncing();
  const updated={...S.sweepDone,[dk]:true};
  await dbSet('sweep_done',updated);
  await addActivity('🧹',`${S.yourName} marked sweep done today`);
  showToast('✅ Sweep marked done!');
};

// ── BATHROOM ─────────────────────────────────────────────────
function getThisSundayCleaner(){
  // Find the upcoming Sunday
  const d=new Date(today());
  const day=d.getDay();
  d.setDate(d.getDate()+(day===0?0:7-day));
  return {date:d,name:S.bathroomSchedule[dKey(d)]||getBathroomDefault(d)};
}
function getBathroomDefault(dateObj){
  if(!S.members.length)return null;
  // Weekly rotation — which Sunday is this?
  const epoch=new Date(2024,0,7); // first Sunday of 2024
  const weeks=Math.floor((dateObj-epoch)/604800000);
  return S.members[((weeks%S.members.length)+S.members.length)%S.members.length].name;
}
function renderBathroom(){
  const c=document.getElementById('bathroom-schedule-list');if(!c)return;c.innerHTML='';
  if(!S.members.length){c.innerHTML='<div class="empty-state">Add housemates in Settings</div>';return;}
  const list=document.createElement('div');list.className='sweep-list';
  // Show next 8 Sundays
  const d=new Date(today());
  const day=d.getDay();
  d.setDate(d.getDate()+(day===0?0:7-day));// go to next/this Sunday
  for(let i=0;i<8;i++){
    const sunday=new Date(d);sunday.setDate(d.getDate()+i*7);
    const dk=dKey(sunday);
    const name=S.bathroomSchedule[dk]||getBathroomDefault(sunday);
    const done=!!S.bathroomDone[dk];
    const isThis=dk===dKey(d);
    const isPast=sunday<today()&&!isThis;
    const m=S.members.find(x=>x.name===name)||{initials:name?name.slice(0,2).toUpperCase():'?',color:col(0)};
    const row=document.createElement('div');
    row.className='sweep-row'+(done||isPast?' done-row':isThis?' today-row':'');
    const badge=done?'<span class="sweep-badge" style="background:#E1F5EE;color:#085041">done ✓</span>':
                isThis?'<span class="sweep-badge" style="background:#E6F1FB;color:#0C447C">this Sunday 🚿</span>':'';
    row.innerHTML=`<span class="sweep-date">${sunday.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
      <div class="sched-avatar" style="background:${m.color.bg};color:${m.color.fg};margin-right:8px">${m.initials}</div>
      <span class="sweep-pair">${name||'—'}${name===S.yourName?' (you)':''}</span>${badge}`;
    list.appendChild(row);
  }
  c.appendChild(list);
}
window.markBathroomDone=async function(){
  const {date}=getThisSundayCleaner();
  const dk=dKey(date);setSyncing();
  const updated={...S.bathroomDone,[dk]:true};
  await dbSet('bathroom_done',updated);
  await addActivity('🚿',`${S.yourName} marked bathroom clean this Sunday`);
  showToast('✅ Bathroom cleaning marked done!');
};

// ── SETTINGS ─────────────────────────────────────────────────
function updateSettingsFields(){
  const n=document.getElementById('set-house-name'),r=document.getElementById('set-rent');
  if(n)n.value=S.houseName;if(r)r.value=S.rentPerPerson;
  document.getElementById('settings-your-name').textContent=S.yourName;
  document.getElementById('settings-your-role').textContent=S.isAdmin?'👑 Admin — full access':'Member — can mark own payments only';
}
function updateInchargeSelects(){
  ['set-water-incharge','set-bill-incharge'].forEach((id,idx)=>{
    const sel=document.getElementById(id);if(!sel)return;
    sel.innerHTML=S.members.map(m=>`<option value="${m.name}" ${m.name===(idx===0?S.waterIncharge:S.billIncharge)?'selected':''}>${m.name}</option>`).join('');
  });
}
window.saveHouseInfo=async function(){
  if(!S.isAdmin){showToast('Only admin can edit');return;}
  setSyncing();
  await dbUpdate('config/'+HOUSE_ID,{houseName:document.getElementById('set-house-name').value.trim()||S.houseName,rentPerPerson:parseInt(document.getElementById('set-rent').value)||S.rentPerPerson});
  showToast('✅ Saved to cloud');
};
window.saveIncharges=async function(){
  if(!S.isAdmin){showToast('Only admin can edit');return;}
  setSyncing();
  const wi=document.getElementById('set-water-incharge')?.value||S.waterIncharge;
  const bi=document.getElementById('set-bill-incharge')?.value||S.billIncharge;
  await dbUpdate('config/'+HOUSE_ID,{waterIncharge:wi,billIncharge:bi});
  showToast(`✅ Water incharge: ${wi} · Bill incharge: ${bi}`);
};
function renderMembersSettings(){
  const el=document.getElementById('members-sortable');if(!el)return;el.innerHTML='';
  S.members.forEach((m,i)=>{
    const div=document.createElement('div');div.className='member-item';
    div.innerHTML=`<div class="member-item-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
      <span class="member-item-name">${m.name}${m.name===S.yourName?' (you)':''}${m.name===ADMIN_NAME?' 👑':''}</span>
      <span class="member-item-day">Day ${i+1}</span>
      ${S.isAdmin&&m.name!==ADMIN_NAME?`<button class="member-item-del" onclick="deleteMember(${i})">×</button>`:''}`;
    el.appendChild(div);
  });
}
window.addMember=async function(){
  if(!S.isAdmin){showToast('Only admin can add members');return;}
  const inp=document.getElementById('new-member-name');const name=inp.value.trim();if(!name)return;
  if(S.members.find(m=>m.name===name)){showToast('Already exists');return;}
  setSyncing();
  await dbUpdate('config/'+HOUSE_ID,{members:[...S.members.map(m=>({name:m.name})),{name}]});
  inp.value='';showToast('✅ '+name+' added');
};
window.deleteMember=function(i){
  if(!S.isAdmin){showToast('Only admin can remove members');return;}
  if(S.members.length<=2){showToast('Need at least 2');return;}
  const name=S.members[i].name;
  showModal('Remove '+name+'?','Removes them from all schedules.',
    [{label:'Remove',cls:'btn-danger',fn:async()=>{
      setSyncing();
      await dbUpdate('config/'+HOUSE_ID,{members:S.members.filter((_,j)=>j!==i).map(m=>({name:m.name}))});
      hideModal();showToast(name+' removed');
    }},{label:'Cancel',cls:'btn-secondary',fn:hideModal}]
  );
};
function renderCloudStatus(){
  const el=document.getElementById('cloud-status-content');if(!el)return;
  el.innerHTML=S.firebaseEnabled?
    `<div class="cloud-status-row"><span>Status</span><span class="badge-tag green">🟢 Firebase connected</span></div>
     <div class="cloud-status-row"><span>Sync</span><span class="badge-tag green">Real-time ☁️</span></div>
     <div class="cloud-status-row"><span>Project</span><span style="font-size:12px;color:#666">bachelor-house-593d6</span></div>`:
    `<div class="info-box">⚠️ Firebase not configured. Data saved locally only. Update js/firebase-config.js and redeploy.</div>`;
}

// ── NOTIFICATIONS ────────────────────────────────────────────
window.toggleNotifications=async function(){
  if(!('Notification' in window)){showToast('Not supported in this browser');return;}
  if(Notification.permission==='granted'){showToast('Already enabled ✅');return;}
  const p=await Notification.requestPermission();
  if(p==='granted'){
    document.getElementById('notif-status-text').textContent='Notifications enabled ✅';
    document.getElementById('notif-toggle-btn').textContent='Enabled ✅';
    showToast('✅ Enabled! You\'ll get reminders at 3:00 PM daily');
    pushNotif('🏠 Welcome!','You\'ll get washing, sweeping & payment reminders!');
  }else showToast('Permission denied — enable in browser settings');
};

function pushNotif(title,body){
  if(Notification.permission==='granted'){
    try{
      const n=new Notification(title,{body,tag:'bh-'+Date.now(),requireInteraction:true,
        icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%231D9E75"/><text y=".9em" x="8" font-size="80">🏠</text></svg>'});
      // Auto close after 8 seconds
      setTimeout(()=>n.close(),8000);
    }catch(e){console.log('Notif error',e);}
  }
}

function scheduleNotifications(){
  // Check every minute for 3:00 PM triggers
  setInterval(async()=>{
    const now=new Date();
    const h=now.getHours(),m=now.getMinutes();
    if(h===15&&m===0){ // 3:00 PM
      const washer=getTodayWasher();
      const prev=getYesterdayWasher();
      const sweeper=getTodaySweeper();
      if(washer){
        pushNotif('🧺 Washing machine!',`Hey ${washer}, it\'s your turn today!`);
        await addNotif('🧺',`3PM reminder: Washing for ${washer}`);
      }
      if(prev){
        pushNotif('👕 Collect your clothes!',`Hey ${prev}, collect your dried clothes!`);
        await addNotif('👕',`3PM reminder: Collect clothes — ${prev}`);
      }
      if(sweeper){
        pushNotif('🧹 Sweeping!',`Hey ${sweeper}, please sweep the house today!`);
        await addNotif('🧹',`3PM reminder: Sweep duty — ${sweeper}`);
      }
      // Saturday 3PM — Sunday bathroom reminder
      if(now.getDay()===6){
        const {name}=getThisSundayCleaner();
        if(name){
          pushNotif('🚿 Bathroom cleaning tomorrow!',`Hey ${name}, please clean the bathroom this Sunday!`);
          await addNotif('🚿',`3PM Sat reminder: Bathroom cleaning — ${name}`);
        }
      }
    }
  },60000);
}

window.sendWashingNotif=async function(){
  const w=getTodayWasher();if(!w)return;
  pushNotif('🧺 Washing machine!',`Hey ${w}, it's your turn today!`);
  await addNotif('🧺',`Washing reminder sent to ${w}`);
  await addActivity('📲',`Washing reminder sent to ${w}`);
  showToast(`📲 Sent to ${w}!`);
};
window.sendCollectNotif=async function(){
  const w=getYesterdayWasher();if(!w)return;
  pushNotif('👕 Collect clothes!',`Hey ${w}, collect dried clothes from rope!`);
  await addNotif('👕',`Collect reminder sent to ${w}`);
  await addActivity('📲',`Collect clothes reminder sent to ${w}`);
  showToast(`📲 Sent to ${w}!`);
};
window.sendSweepNotif=async function(){
  const name=getTodaySweeper();if(!name||name==='—')return;
  pushNotif('🧹 Sweep time!',`Hey ${name}, please sweep the house today!`);
  await addNotif('🧹',`Sweep reminder sent to ${name}`);
  await addActivity('📲',`Sweep reminder sent to ${name}`);
  showToast(`📲 Sent to ${name}!`);
};
window.sendBathroomNotif=async function(){
  const {name,date}=getThisSundayCleaner();if(!name)return;
  pushNotif('🚿 Bathroom cleaning Sunday!',`Hey ${name}, please clean the bathroom this Sunday!`);
  await addNotif('🚿',`Bathroom reminder sent to ${name}`);
  await addActivity('📲',`Bathroom cleaning reminder sent to ${name}`);
  showToast(`📲 Sent to ${name}!`);
};

// ── NOTIF PANEL ───────────────────────────────────────────────
window.showNotifPanel=function(){
  document.getElementById('notif-overlay').classList.remove('hidden');
  document.getElementById('notif-panel').classList.remove('hidden');
  document.getElementById('notif-dot').classList.add('hidden');
  const list=document.getElementById('notif-panel-list');
  if(!S.notifications.length){list.innerHTML='<div class="empty-state" style="padding:24px">No notifications yet</div>';return;}
  list.innerHTML='';
  S.notifications.slice(0,50).forEach(n=>{
    const div=document.createElement('div');div.className='notif-log-item';
    div.innerHTML=`<div class="notif-log-icon">${n.icon}</div><div><div class="notif-log-title">${n.title}</div><div class="notif-log-time">${n.time||''}</div></div>`;
    list.appendChild(div);
  });
};
window.hideNotifPanel=function(){document.getElementById('notif-overlay').classList.add('hidden');document.getElementById('notif-panel').classList.add('hidden');};

// ── MODAL / TOAST ─────────────────────────────────────────────
function showModal(title,body,actions){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').textContent=body;
  const ma=document.getElementById('modal-actions');ma.innerHTML='';
  actions.forEach(a=>{const b=document.createElement('button');b.className=a.cls;b.textContent=a.label;b.onclick=a.fn;ma.appendChild(b);});
  document.getElementById('modal-overlay').classList.remove('hidden');
}
window.hideModal=function(){document.getElementById('modal-overlay').classList.add('hidden');};
document.getElementById('modal-overlay').addEventListener('click',function(e){if(e.target===this)hideModal();});
let _tt;
window.showToast=function(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.add('hidden'),3200);};

// ── RESET ────────────────────────────────────────────────────
window.confirmReset=function(){
  if(!S.isAdmin){showToast('Only admin can reset');return;}
  showModal('Reset ALL data?','Permanently deletes everything from Firebase. Cannot be undone.',
    [{label:'Delete everything',cls:'btn-danger',fn:async()=>{
      const cols=['water_entries','bill_entries','activity','notifications','rent','sweep_done','bathroom_done'];
      for(const col of cols){
        if(S.firebaseEnabled){const snap=await fb.getDocs(fb.collection(db,col));for(const d of snap.docs)await fb.deleteDoc(d.ref);}
        else{const a=lsAll();Object.keys(a).filter(k=>k.startsWith(col+'/')).forEach(k=>lsDel(k));}
      }
      await dbDel('config/'+HOUSE_ID);
      await dbDel('schedules/wash');await dbDel('schedules/sweep');await dbDel('schedules/bathroom');
      await dbDel('sweep_done');await dbDel('bathroom_done');
      localStorage.removeItem('bh_yourName');hideModal();location.reload();
    }},{label:'Cancel',cls:'btn-secondary',fn:hideModal}]
  );
};

// ── SERVICE WORKER ───────────────────────────────────────────
function registerSW(){if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideModal();hideNotifPanel();}});
