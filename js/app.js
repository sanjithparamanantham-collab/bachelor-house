// ═══════════════════════════════════════════════════════════
//  BACHELOR HOUSE MANAGER — app.js
//  Cloud DB: Firebase Firestore  |  Fallback: localStorage
// ═══════════════════════════════════════════════════════════

// ── CONSTANTS ───────────────────────────────────────────────
const COLORS = [
  {bg:'#E1F5EE',fg:'#085041'},{bg:'#E6F1FB',fg:'#0C447C'},
  {bg:'#FAEEDA',fg:'#633806'},{bg:'#FCEBEB',fg:'#501313'},
  {bg:'#EAF3DE',fg:'#27500A'},{bg:'#FBEAF0',fg:'#72243E'},
  {bg:'#EEEDFE',fg:'#26215C'},{bg:'#FCF4E0',fg:'#5C3D00'},
  {bg:'#E0F4FC',fg:'#0A4A6A'},{bg:'#F4E0FC',fg:'#52066B'},
];
const CAN_PRICE = 40;
const HOUSE_DOC_ID = 'house_config';

// ── STATE ────────────────────────────────────────────────────
let S = {
  firebaseEnabled: false,
  houseName: '',
  yourName: '',
  rentPerPerson: 5000,
  members: [],
  washWeekOffset: 0,
  rentMonthOffset: 0,
  canCount: 2,
  selectedRentSender: null,
  // live data (from cloud listeners)
  waterHistory: [],
  rentData: {},
  activity: [],
  notifications: [],
  sweepDone: {},
};

// ── HELPERS ──────────────────────────────────────────────────
const initials = n => {
  const p = n.trim().split(' ');
  return p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : n.slice(0,2).toUpperCase();
};
const color = i => COLORS[i % COLORS.length];
const today = () => new Date();
const dateKey = (d=today()) => d.toISOString().split('T')[0];
const fmtDate = d => d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
const fmtDateLong = d => d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const monthKey = (off=0) => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+off); return d.toISOString().slice(0,7); };
const monthLabel = k => { const [y,m]=k.split('-'); return new Date(+y,+m-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}); };
const nowStr = () => today().toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const LS_KEY = 'bh_v2';

// ── LOADING STATUS ────────────────────────────────────────────
function setLoading(msg, pct) {
  const s=document.getElementById('loading-status'), b=document.getElementById('loading-bar-fill');
  if(s)s.textContent=msg;
  if(b)b.style.width=pct+'%';
}
function hideLoading() {
  const el=document.getElementById('loading-screen');
  if(el){el.style.opacity='0';el.style.transition='opacity .4s';setTimeout(()=>el.classList.add('hidden'),400);}
}

// ── FIREBASE DB LAYER ─────────────────────────────────────────
// All Firestore calls go through these wrappers so we can
// fall back gracefully to localStorage when Firebase is off.

let db, fbOps;

async function dbGet(path) {
  if (!S.firebaseEnabled) return lsGet(path);
  const ref = pathToRef(path);
  const snap = await fbOps.getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
async function dbSet(path, data) {
  if (!S.firebaseEnabled) { lsSet(path, data); return; }
  await fbOps.setDoc(pathToRef(path), data, { merge: true });
  setSyncStatus('synced');
}
async function dbUpdate(path, data) {
  if (!S.firebaseEnabled) {
    const cur = lsGet(path) || {};
    lsSet(path, { ...cur, ...data });
    return;
  }
  try { await fbOps.updateDoc(pathToRef(path), data); setSyncStatus('synced'); }
  catch(e) { await fbOps.setDoc(pathToRef(path), data, {merge:true}); setSyncStatus('synced'); }
}
async function dbAdd(colPath, data) {
  if (!S.firebaseEnabled) { lsAddToArray(colPath, data); return data.id||Date.now(); }
  const ref = await fbOps.addDoc(fbOps.collection(db, colPath), { ...data, _ts: fbOps.serverTimestamp() });
  setSyncStatus('synced');
  return ref.id;
}
async function dbDelete(path) {
  if (!S.firebaseEnabled) { lsDelete(path); return; }
  await fbOps.deleteDoc(pathToRef(path));
}

// Real-time listeners
function dbListen(colPath, cb, opts={}) {
  if (!S.firebaseEnabled) {
    // Fake listener — just call cb once with localStorage data
    cb(lsGetArray(colPath));
    return () => {};
  }
  let q = fbOps.collection(db, colPath);
  if (opts.orderBy) q = fbOps.query(q, fbOps.orderBy(opts.orderBy, opts.dir||'desc'));
  return fbOps.onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
function dbListenDoc(path, cb) {
  if (!S.firebaseEnabled) { cb(lsGet(path)); return ()=>{}; }
  return fbOps.onSnapshot(pathToRef(path), snap => cb(snap.exists() ? snap.data() : null));
}

function pathToRef(path) {
  const parts = path.split('/');
  return parts.length % 2 === 0
    ? fbOps.doc(db, ...parts)
    : fbOps.doc(db, path); // shouldn't happen but safe
}

// ── LOCALSTORAGE FALLBACK ─────────────────────────────────────
function lsAll() { try { return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); } catch { return {}; } }
function lsSave(data) { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
function lsGet(path) { return lsAll()[path] || null; }
function lsSet(path, data) { const a=lsAll(); a[path]=data; lsSave(a); }
function lsDelete(path) { const a=lsAll(); delete a[path]; lsSave(a); }
function lsGetArray(col) { const a=lsAll(); return Object.entries(a).filter(([k])=>k.startsWith(col+'/')).map(([k,v])=>v).reverse(); }
function lsAddToArray(col, data) { const id=data.id||(Date.now()+''); lsSet(col+'/'+id, {...data,id}); }

// ── SYNC STATUS BAR ───────────────────────────────────────────
let syncTimer;
function setSyncStatus(state, msg) {
  const bar=document.getElementById('sync-bar');
  const icon=document.getElementById('sync-icon');
  const text=document.getElementById('sync-text');
  if(!bar)return;
  bar.className='sync-bar';
  clearTimeout(syncTimer);
  if(state==='syncing'){bar.classList.add('syncing');icon.textContent='🔄';text.textContent=msg||'Syncing...';}
  else if(state==='error'){bar.classList.add('error');icon.textContent='⚠️';text.textContent=msg||'Sync error';}
  else if(state==='offline'){bar.classList.add('offline');icon.textContent='📴';text.textContent='Offline — changes saved locally';}
  else{icon.textContent='☁️';text.textContent=S.firebaseEnabled?'Synced to Firebase cloud':'Local mode (no Firebase config)';}
}

// ── STARTUP ───────────────────────────────────────────────────
window.startApp = async function(firebaseReady) {
  S.firebaseEnabled = firebaseReady;
  if (firebaseReady) {
    db = window._fb.db;
    fbOps = window._fb;
  }

  setLoading('Checking house setup...', 85);

  // Try to load house config
  let cfg = await dbGet('config/'+HOUSE_DOC_ID);

  // Also check localStorage for yourName (device-specific)
  const deviceName = localStorage.getItem('bh_yourName');

  setLoading('Ready!', 100);
  setTimeout(hideLoading, 300);

  if (!cfg) {
    // No house set up yet — show setup screen
    document.getElementById('setup-screen').classList.remove('hidden');
    setupListeners();
    return;
  }

  // House exists — apply config
  applyConfig(cfg);

  if (!deviceName || !S.members.find(m=>m.name===deviceName)) {
    // This device hasn't chosen who they are yet
    showJoinScreen(cfg);
    return;
  }

  S.yourName = deviceName;
  launchMainApp();
};

function applyConfig(cfg) {
  S.houseName      = cfg.houseName || 'Bachelor House';
  S.rentPerPerson  = cfg.rentPerPerson || 5000;
  S.members        = (cfg.members || []).map((m,i) => ({
    name: m.name,
    initials: initials(m.name),
    color: color(i)
  }));
}

// ── SETUP SCREEN ──────────────────────────────────────────────
const setupMembers = [];
function setupListeners() {
  document.getElementById('setup-member-input').addEventListener('keydown', e => { if(e.key==='Enter') setupAddMember(); });
}
window.setupAddMember = function() {
  const inp=document.getElementById('setup-member-input');
  const name=inp.value.trim();
  if(!name)return;
  if(setupMembers.includes(name)){showToast('Already added!');return;}
  setupMembers.push(name);
  inp.value=''; inp.focus();
  renderSetupChips();
};
window.removeSetupMember = function(i) { setupMembers.splice(i,1); renderSetupChips(); };
function renderSetupChips() {
  const el=document.getElementById('setup-members-list');
  el.innerHTML='';
  setupMembers.forEach((n,i)=>{
    const c=document.createElement('span'); c.className='setup-chip';
    c.innerHTML=n+' <span onclick="removeSetupMember('+i+')" style="opacity:.6;font-size:16px;cursor:pointer">×</span>';
    el.appendChild(c);
  });
  document.getElementById('setup-member-count').textContent=
    setupMembers.length>0?setupMembers.length+' housemate'+(setupMembers.length!==1?'s':'')+' added':'';
  document.getElementById('setup-go-btn').disabled = setupMembers.length < 2;
}
window.finishSetup = async function() {
  const yourName=document.getElementById('setup-your-name').value.trim();
  const houseName=document.getElementById('setup-house-name').value.trim();
  const rent=parseInt(document.getElementById('setup-rent').value)||5000;
  if(!yourName){showToast('Please enter your name');return;}
  if(setupMembers.length<2){showToast('Add at least 2 housemates');return;}
  const btn=document.getElementById('setup-go-btn');
  btn.disabled=true; btn.textContent='Creating house...';
  setSyncStatus('syncing','Saving to cloud...');
  const cfg = {
    houseName: houseName||'Bachelor House',
    rentPerPerson: rent,
    members: setupMembers.map(n=>({name:n})),
    createdAt: new Date().toISOString(),
    createdBy: yourName,
  };
  await dbSet('config/'+HOUSE_DOC_ID, cfg);
  localStorage.setItem('bh_yourName', yourName);
  applyConfig(cfg);
  S.yourName = yourName;
  document.getElementById('setup-screen').classList.add('hidden');
  launchMainApp();
};

// ── JOIN SCREEN ───────────────────────────────────────────────
let joinSelected = null;
function showJoinScreen(cfg) {
  document.getElementById('join-house-title').textContent='Join '+cfg.houseName;
  const chips=document.getElementById('join-members-chips');
  chips.innerHTML='';
  (cfg.members||[]).forEach(m=>{
    const c=document.createElement('span');
    c.className='setup-chip selectable';
    c.textContent=m.name;
    c.onclick=()=>{
      joinSelected=m.name;
      document.querySelectorAll('#join-members-chips .setup-chip').forEach(x=>x.classList.remove('selected-join'));
      c.classList.add('selected-join');
      document.getElementById('join-go-btn').disabled=false;
      document.getElementById('join-status').textContent='Joining as '+m.name;
    };
    chips.appendChild(c);
  });
  document.getElementById('join-screen').classList.remove('hidden');
}
window.joinAsNewMember = function() {
  if(!joinSelected){showToast('Select who you are');return;}
  localStorage.setItem('bh_yourName', joinSelected);
  S.yourName = joinSelected;
  document.getElementById('join-screen').classList.add('hidden');
  launchMainApp();
};

// ── MAIN APP ──────────────────────────────────────────────────
const unsubscribers = [];
function launchMainApp() {
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('topbar-house-name').textContent=S.houseName;
  document.getElementById('topbar-date').textContent=fmtDateLong(today());
  setSyncStatus('synced');
  updateSettingsFields();
  renderWashing();
  renderSweep();
  updateWaterCounter();

  // Set up real-time listeners
  unsubscribers.push(
    dbListenDoc('config/'+HOUSE_DOC_ID, cfg => {
      if(!cfg)return;
      applyConfig(cfg);
      document.getElementById('topbar-house-name').textContent=S.houseName;
      updateSettingsFields();
      renderWashing();
      renderSweep();
      renderHome();
      renderMembersSettings();
    }),
    dbListen('water_entries', entries => {
      S.waterHistory = entries;
      renderWater();
      renderHome();
    }, {orderBy:'_ts', dir:'desc'}),
    dbListen('activity', acts => {
      S.activity = acts;
      renderHome();
    }, {orderBy:'_ts', dir:'desc'}),
    dbListen('notifications', notifs => {
      S.notifications = notifs;
      if(notifs.length>0) document.getElementById('notif-dot').classList.remove('hidden');
    }, {orderBy:'_ts', dir:'desc'}),
    dbListen('rent', rentDocs => {
      S.rentData = {};
      rentDocs.forEach(r => { S.rentData[r.id] = r; });
      renderRent();
      renderHome();
    }),
    dbListen('sweep_done', done => {
      S.sweepDone = {};
      done.forEach(d => { S.sweepDone[d.id] = true; });
      renderSweep();
    })
  );

  renderHome();
  renderMembersSettings();
  renderCloudStatus();
  scheduleAutoNotifications();
  registerServiceWorker();
}

// ── TAB ROUTING ───────────────────────────────────────────────
const ALL_TABS = ['home','washing','water','rent','sweep','settings'];
window.showTab = function(name) {
  ALL_TABS.forEach(t=>{
    document.getElementById('pane-'+t).classList.toggle('active',t===name);
    const nav=document.getElementById('nav-'+t);
    if(nav)nav.classList.toggle('active',t===name);
  });
  if(name==='water') updateWaterCounter();
  if(name==='rent') renderRent();
  if(name==='sweep') renderSweep();
  if(name==='settings'){renderMembersSettings();updateSettingsFields();renderCloudStatus();}
};

// ── WASHING SCHEDULE ──────────────────────────────────────────
function getWasherOffset(dayOffset=0) {
  if(!S.members.length)return null;
  const epoch=new Date(2024,0,1);
  const d=new Date(today()); d.setDate(d.getDate()+dayOffset);
  const diff=Math.floor((d-epoch)/86400000);
  return S.members[((diff%S.members.length)+S.members.length)%S.members.length];
}
const getTodayWasher = () => getWasherOffset(0);
const getYesterdayWasher = () => getWasherOffset(-1);

let washWeekOffset=0;
window.changeWeek = function(d){washWeekOffset+=d;renderWashing();};
function renderWashing() {
  const ws=document.getElementById('wash-schedule');
  if(!ws)return;
  ws.innerHTML='';
  const epoch=new Date(2024,0,1);
  const todayDiff=Math.floor((today()-epoch)/86400000);
  const startOffset=washWeekOffset*7;
  for(let i=0;i<7;i++){
    const offset=startOffset+i;
    const d=new Date(today()); d.setDate(d.getDate()+offset);
    const diff=todayDiff+offset;
    const m=S.members[((diff%S.members.length)+S.members.length)%S.members.length];
    if(!m)continue;
    const isToday=offset===0;
    const c=m.color;
    const row=document.createElement('div');
    row.className='schedule-row'+(isToday?' today-row':'');
    let badge='';
    if(offset<0) badge='<span class="sched-badge" style="background:#f5f5f3;color:#888">done</span>';
    else if(isToday) badge='<span class="sched-badge" style="background:#E1F5EE;color:#085041">today 📍</span>';
    else badge='<span class="sched-badge" style="background:#f5f5f3;color:#888">upcoming</span>';
    row.innerHTML=`<span class="sched-day">${isToday?'Today':fmtDate(d)}</span>
      <div class="sched-avatar" style="background:${c.bg};color:${c.fg}">${m.initials}</div>
      <span class="sched-name">${m.name}${m.name===S.yourName?' (you)':''}</span>${badge}`;
    ws.appendChild(row);
  }
  const off=washWeekOffset;
  document.getElementById('wash-week-label').textContent=
    off===0?'This week':off===1?'Next week':off===-1?'Last week':off>0?`+${off} weeks`:`${off} weeks`;
}

// ── HOME ──────────────────────────────────────────────────────
function renderHome() {
  const washer=getTodayWasher();
  if(washer){
    document.getElementById('home-washer-name').textContent=washer.name+(washer.name===S.yourName?' (you)':'');
    const epoch=new Date(2024,0,1);
    const diff=Math.floor((today()-epoch)/86400000);
    const dayNum=(((diff%S.members.length)+S.members.length)%S.members.length)+1;
    document.getElementById('home-washer-badge').textContent='Day '+dayNum+'/'+S.members.length;
    document.getElementById('home-washer-sub').textContent=washer.name===S.yourName?"It's YOUR turn today!":"Send a reminder if they haven't started yet";
  }
  // Quick stats
  const mk=monthKey(0);
  const rd=S.rentData[mk]||{payments:{}};
  const paidRent=S.members.filter(m=>rd.payments&&rd.payments[m.name]).length;
  const myPendingWater=S.waterHistory.filter(w=>w.payments&&!w.payments[S.yourName]&&w.addedBy!==S.yourName).length;
  document.getElementById('home-quick-stats').innerHTML=`
    <div class="stat-box"><div class="stat-val" style="color:${myPendingWater>0?'#854F0B':'#1D9E75'}">${myPendingWater}</div><div class="stat-label">Your pending water dues</div></div>
    <div class="stat-box"><div class="stat-val">${paidRent}/${S.members.length}</div><div class="stat-label">Rent paid this month</div></div>
  `;
  // Activity
  const al=document.getElementById('home-activity');
  if(!al)return;
  if(S.activity.length===0){al.innerHTML='<div class="empty-state">No activity yet. Start by adding water cans or marking rent!</div>';return;}
  al.innerHTML='';
  S.activity.slice(0,12).forEach(a=>{
    const div=document.createElement('div'); div.className='activity-item';
    div.innerHTML=`<div class="activity-icon-wrap">${a.icon}</div><div class="activity-text"><div class="activity-title">${a.title}</div><div class="activity-time">${a.time||''}</div></div>`;
    al.appendChild(div);
  });
}

async function addActivity(icon, title) {
  setSyncStatus('syncing');
  await dbAdd('activity', { icon, title, time: nowStr() });
}
async function addNotification(icon, title) {
  await dbAdd('notifications', { icon, title, time: nowStr() });
  document.getElementById('notif-dot').classList.remove('hidden');
}

// ── WATER ─────────────────────────────────────────────────────
let canCount=2;
window.changeCans = function(d) {
  canCount=Math.max(1,canCount+d);
  updateWaterCounter();
};
function updateWaterCounter() {
  const total=canCount*CAN_PRICE;
  const per=S.members.length>0?Math.ceil(total/S.members.length):total;
  document.getElementById('can-count-disp').textContent=canCount;
  document.getElementById('water-total-disp').textContent='₹'+total;
  document.getElementById('water-share-disp').textContent='₹'+per;
  document.getElementById('water-split-count').textContent=S.members.length||7;
}
window.logWaterCans = async function() {
  if(S.members.length===0){showToast('Add housemates first in Settings');return;}
  const btn=document.getElementById('log-water-btn');
  btn.disabled=true; btn.textContent='Saving to cloud...';
  setSyncStatus('syncing','Saving water entry...');
  const total=canCount*CAN_PRICE;
  const perPerson=Math.ceil(total/S.members.length);
  const payments={};
  payments[S.yourName]=true; // you already paid (you bought them)
  const entry={
    id: Date.now()+'',
    date: dateKey(),
    displayDate: fmtDate(today()),
    cans: canCount,
    total,
    perPerson,
    addedBy: S.yourName,
    payments,
  };
  await dbAdd('water_entries', entry);
  await addActivity('💧',`${S.yourName} added ${canCount} water can${canCount>1?'s':''} — ₹${perPerson} each`);
  await addNotification('💧',`Water cans added by ${S.yourName}! Please pay ₹${perPerson}`);
  sendBrowserNotif('💧 Water cans added!',`Pay ₹${perPerson} to ${S.yourName}`);
  btn.disabled=false; btn.textContent='💧 Log cans & notify all housemates';
  showToast(`✅ Logged & cloud saved! Notifying all housemates — pay ₹${perPerson}`);
};
window.toggleWaterPayment = async function(entryId, memberName) {
  if(memberName===S.yourName||!entryId)return; // incharge always pre-paid
  const entry=S.waterHistory.find(e=>e.id===entryId);
  if(!entry)return;
  const wasPaid=!!(entry.payments&&entry.payments[memberName]);
  const newPaid=!wasPaid;
  setSyncStatus('syncing');
  // Update in DB
  const update={[`payments.${memberName}`]:newPaid};
  await dbUpdate('water_entries/'+entryId, update);
  if(newPaid) await addActivity('✅',`${memberName} paid water share — ₹${entry.perPerson}`);
  showToast(newPaid?`✅ ${memberName} marked as paid`:`↩ ${memberName} marked unpaid`);
};
window.toggleWaterEntry = function(header) {
  const body=header.nextElementSibling;
  body.style.display=body.style.display==='none'?'block':'none';
};
function renderWater() {
  updateWaterCounter();
  const container=document.getElementById('water-history-list');
  if(!container)return;
  if(S.waterHistory.length===0){container.innerHTML='<div class="empty-state">No water can entries yet. Log your first cans above!</div>';return;}
  // Calculate my pending amount
  let myOwed=0;
  S.waterHistory.forEach(e=>{
    if(e.payments&&!e.payments[S.yourName]&&e.addedBy!==S.yourName) myOwed+=e.perPerson;
  });
  const owedEl=document.getElementById('water-total-owed');
  if(owedEl) owedEl.textContent=myOwed>0?`· You owe ₹${myOwed}`:'';
  container.innerHTML='';
  S.waterHistory.forEach(entry=>{
    const paidCount=S.members.filter(m=>entry.payments&&entry.payments[m.name]).length;
    const allPaid=paidCount===S.members.length;
    const div=document.createElement('div'); div.className='water-entry';
    div.innerHTML=`
      <div class="water-entry-header" onclick="toggleWaterEntry(this)">
        <div>
          <div class="water-entry-title">${entry.cans} can${entry.cans>1?'s':''} · ${entry.displayDate||entry.date}</div>
          <div class="water-entry-meta">₹${entry.total} total · ₹${entry.perPerson}/person · by ${entry.addedBy||'?'}</div>
        </div>
        <span style="font-size:12px;padding:4px 10px;border-radius:20px;font-weight:500;background:${allPaid?'#E1F5EE':'#FAEEDA'};color:${allPaid?'#085041':'#854F0B'}">${paidCount}/${S.members.length} paid</span>
      </div>
      <div class="water-entry-body" style="display:none">
        ${S.members.map(m=>{
          const paid=!!(entry.payments&&entry.payments[m.name]);
          const isIncharge=m.name===entry.addedBy;
          const isYou=m.name===S.yourName;
          return `<div class="payment-row">
            <div class="payment-person">
              <div class="pay-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
              <div>
                <div class="pay-name">${m.name}${isYou?' (you)':''}</div>
                <div class="pay-amount">₹${entry.perPerson}</div>
              </div>
            </div>
            <button class="pay-btn ${paid?'paid':'unpaid'}${isIncharge?' mine-paid':''}"
              onclick="${isIncharge?'':(`toggleWaterPayment('${entry.id}','${m.name}')`)}"
              ${isIncharge?'disabled':''}>
              ${isIncharge?'paid (incharge)':paid?'paid ✓':'mark paid'}
            </button>
          </div>`;
        }).join('')}
      </div>`;
    container.appendChild(div);
  });
}

// ── RENT ──────────────────────────────────────────────────────
window.changeRentMonth = function(d) { S.rentMonthOffset+=d; renderRent(); };
async function renderRent() {
  const mk=monthKey(S.rentMonthOffset);
  document.getElementById('rent-month-label').textContent=monthLabel(mk);
  // Ensure this month's doc exists in memory
  if(!S.rentData[mk]) S.rentData[mk]={payments:{},sentBy:null};
  const rd=S.rentData[mk];
  const paidCount=S.members.filter(m=>rd.payments&&rd.payments[m.name]).length;
  // Summary
  document.getElementById('rent-summary').innerHTML=`
    <div class="rent-stat"><div class="rent-stat-val" style="color:#1D9E75">${paidCount}</div><div class="rent-stat-label">Paid</div></div>
    <div class="rent-stat"><div class="rent-stat-val" style="color:#854F0B">${S.members.length-paidCount}</div><div class="rent-stat-label">Pending</div></div>
    <div class="rent-stat"><div class="rent-stat-val">₹${(paidCount*S.rentPerPerson/1000).toFixed(1)}k</div><div class="rent-stat-label">Collected</div></div>
  `;
  // List
  const rl=document.getElementById('rent-list');
  if(!rl)return;
  rl.innerHTML='';
  if(S.members.length===0){rl.innerHTML='<div class="empty-state">Add housemates in Settings</div>';return;}
  const card=document.createElement('div'); card.className='rent-list-card';
  S.members.forEach(m=>{
    const paid=!!(rd.payments&&rd.payments[m.name]);
    const row=document.createElement('div'); row.className='rent-row';
    row.innerHTML=`
      <div class="rent-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
      <span class="rent-person-name">${m.name}${m.name===S.yourName?' (you)':''}</span>
      <span class="rent-amount-label">₹${S.rentPerPerson.toLocaleString()}</span>
      <button class="rent-pay-btn ${paid?'paid':'unpaid'}" onclick="toggleRentPaid('${mk}','${m.name}')">${paid?'paid ✓':'mark paid'}</button>
    `;
    card.appendChild(row);
  });
  rl.appendChild(card);
  // Sender chips
  const chips=document.getElementById('rent-sender-chips');
  chips.innerHTML='';
  S.members.forEach(m=>{
    const c=document.createElement('span');
    c.className='chip'+(S.selectedRentSender===m.name?' selected':'');
    c.textContent=m.name+(m.name===S.yourName?' (you)':'');
    c.onclick=()=>{S.selectedRentSender=m.name;renderRent();};
    chips.appendChild(c);
  });
  const ss=document.getElementById('rent-sent-status');
  if(ss) ss.textContent=rd.sentBy?`✅ Rent sent by ${rd.sentBy} this month`:'';
}
window.toggleRentPaid = async function(mk, memberName) {
  if(!S.rentData[mk])S.rentData[mk]={payments:{},sentBy:null};
  const wasPaid=!!(S.rentData[mk].payments&&S.rentData[mk].payments[memberName]);
  const newPaid=!wasPaid;
  setSyncStatus('syncing');
  await dbUpdate('rent/'+mk, {[`payments.${memberName}`]:newPaid, month:mk});
  if(newPaid) await addActivity('💳',`${memberName} paid rent for ${monthLabel(mk)}`);
  showToast(newPaid?`✅ ${memberName} marked rent paid`:`↩ ${memberName} rent unmarked`);
};
window.markRentSent = async function() {
  if(!S.selectedRentSender){showToast('Select who sent rent to the owner');return;}
  const mk=monthKey(S.rentMonthOffset);
  setSyncStatus('syncing');
  await dbUpdate('rent/'+mk, {sentBy:S.selectedRentSender, month:mk});
  await addActivity('🏠',`${S.selectedRentSender} sent rent to owner for ${monthLabel(mk)}`);
  await addNotification('🏠',`Rent for ${monthLabel(mk)} sent to owner by ${S.selectedRentSender}`);
  sendBrowserNotif('🏠 Rent sent!',`${S.selectedRentSender} sent rent for ${monthLabel(mk)}`);
  showToast(`✅ Marked & saved to cloud: ${S.selectedRentSender} sent rent`);
};

// ── SWEEP ─────────────────────────────────────────────────────
function getSweepPair(idx) {
  if(S.members.length<2)return null;
  const n=S.members.length;
  const pairsPerCycle=Math.floor(n/2);
  const pi=Math.floor(idx/2)%pairsPerCycle;
  return [S.members[pi*2%n], S.members[(pi*2+1)%n]];
}
function renderSweep() {
  const container=document.getElementById('sweep-schedule-list');
  if(!container)return;
  container.innerHTML='';
  if(S.members.length<2){container.innerHTML='<div class="empty-state">Add at least 2 housemates in Settings.</div>';return;}
  const list=document.createElement('div'); list.className='sweep-list';
  const epoch=new Date(2024,0,1);
  const todayDiff=Math.floor((today()-epoch)/86400000);
  const sweepIdx=Math.floor(todayDiff/2);
  for(let i=-1;i<14;i++){
    const sdi=sweepIdx+i;
    const d=new Date(today()); d.setDate(d.getDate()+(i*2)-todayDiff%2);
    const pair=getSweepPair(sdi);
    if(!pair)continue;
    const dKey=dateKey(d);
    const done=!!S.sweepDone[dKey];
    const isToday=i===0||(i===-1&&todayDiff%2!==0);
    const isNext=(i===1&&todayDiff%2===0)||(i===0&&todayDiff%2!==0);
    const isPast=i<-1||(i===-1&&todayDiff%2===0);
    const row=document.createElement('div');
    row.className='sweep-row'+(done||isPast?' done-row':isToday?' today-row':isNext?' next-row':'');
    let badge='';
    if(done)badge='<span class="sweep-badge" style="background:#E1F5EE;color:#085041">done ✓</span>';
    else if(isPast)badge='<span class="sweep-badge" style="background:#f5f5f3;color:#888">past</span>';
    else if(isToday)badge='<span class="sweep-badge" style="background:#E1F5EE;color:#085041">today 🧹</span>';
    else if(isNext)badge='<span class="sweep-badge" style="background:#FAEEDA;color:#854F0B">next</span>';
    row.innerHTML=`<span class="sweep-date">${isToday?'Today':isNext?fmtDate(d):fmtDate(d)}</span><span class="sweep-pair">${pair[0].name} &amp; ${pair[1].name}</span>${badge}`;
    list.appendChild(row);
  }
  container.appendChild(list);
}
window.markSweepDone = async function() {
  const dKey=dateKey();
  setSyncStatus('syncing');
  await dbSet('sweep_done/'+dKey,{id:dKey,date:dKey,by:S.yourName});
  await addActivity('🧹',`${S.yourName} marked sweep done for today`);
  showToast('✅ Sweep marked done for today!');
};

// ── SETTINGS ──────────────────────────────────────────────────
function updateSettingsFields() {
  const n=document.getElementById('set-house-name'), r=document.getElementById('set-rent'), y=document.getElementById('set-your-name');
  if(n)n.value=S.houseName;
  if(r)r.value=S.rentPerPerson;
  if(y)y.value=S.yourName;
}
window.saveHouseInfo = async function() {
  const name=document.getElementById('set-house-name').value.trim()||S.houseName;
  const rent=parseInt(document.getElementById('set-rent').value)||S.rentPerPerson;
  setSyncStatus('syncing','Saving...');
  await dbUpdate('config/'+HOUSE_DOC_ID, {houseName:name, rentPerPerson:rent});
  showToast('✅ Settings saved to cloud');
};
function renderMembersSettings() {
  const el=document.getElementById('members-sortable');
  if(!el)return;
  el.innerHTML='';
  S.members.forEach((m,i)=>{
    const div=document.createElement('div'); div.className='member-item';
    div.innerHTML=`<div class="member-item-avatar" style="background:${m.color.bg};color:${m.color.fg}">${m.initials}</div>
      <span class="member-item-name">${m.name}${m.name===S.yourName?' (you)':''}</span>
      <span class="member-item-day">Day ${i+1}</span>
      <button class="member-item-del" onclick="deleteMember(${i})" title="Remove">×</button>`;
    el.appendChild(div);
  });
}
window.addMember = async function() {
  const inp=document.getElementById('new-member-name');
  const name=inp.value.trim();
  if(!name)return;
  if(S.members.find(m=>m.name===name)){showToast('Already in the list!');return;}
  setSyncStatus('syncing');
  const newMembers=[...S.members.map(m=>({name:m.name})),{name}];
  await dbUpdate('config/'+HOUSE_DOC_ID,{members:newMembers});
  inp.value='';
  showToast('✅ '+name+' added & synced');
};
window.deleteMember = function(i) {
  if(S.members.length<=2){showToast('Need at least 2 housemates');return;}
  const name=S.members[i].name;
  showModal('Remove '+name+'?','This removes them from the washing and sweeping schedule for everyone.',
    [{label:'Remove',cls:'btn-danger',fn:async()=>{
      setSyncStatus('syncing');
      const newMembers=S.members.filter((_,j)=>j!==i).map(m=>({name:m.name}));
      await dbUpdate('config/'+HOUSE_DOC_ID,{members:newMembers});
      hideModal(); showToast(name+' removed');
    }},{label:'Cancel',cls:'btn-secondary',fn:hideModal}]
  );
};
function renderCloudStatus() {
  const el=document.getElementById('cloud-status-content');
  if(!el)return;
  if(S.firebaseEnabled){
    el.innerHTML=`
      <div class="cloud-status-row"><span>Status</span><span class="badge-green-sm">🟢 Connected to Firebase</span></div>
      <div class="cloud-status-row"><span>Sync</span><span class="badge-green-sm">Real-time across all phones</span></div>
      <div class="cloud-status-row"><span>Storage</span><span class="badge-green-sm">Firebase Firestore ☁️</span></div>
      <div class="cloud-status-row"><span>Data safety</span><span class="badge-green-sm">Permanent cloud storage</span></div>
    `;
  } else {
    el.innerHTML=`
      <div class="info-box" style="margin-bottom:10px">⚠️ Firebase not configured yet. Data is saved locally on this device only. To sync across all 7 phones, add your Firebase credentials to <code>js/firebase-config.js</code>.</div>
      <div class="cloud-status-row"><span>Status</span><span class="badge-red-sm">⚠️ Local only (no Firebase)</span></div>
      <div class="cloud-status-row"><span>Data</span><span class="badge-red-sm">Not shared between phones</span></div>
      <div class="deploy-steps" style="margin-top:10px;list-style:none;padding:0">
        <strong style="font-size:13px">Quick setup:</strong><br>
        1. Go to <a href="https://console.firebase.google.com" target="_blank" style="color:var(--green)">console.firebase.google.com</a><br>
        2. Create free project → Enable Firestore + Auth (Anonymous)<br>
        3. Paste config into <code>js/firebase-config.js</code><br>
        4. Re-deploy to GitHub Pages
      </div>
    `;
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
window.toggleNotifications = async function() {
  if(!('Notification' in window)){showToast('Not supported in this browser');return;}
  if(Notification.permission==='granted'){showToast('Already enabled ✅');return;}
  const p=await Notification.requestPermission();
  if(p==='granted'){
    document.getElementById('notif-status-text').textContent='Notifications enabled ✅';
    document.getElementById('notif-toggle-btn').textContent='Enabled ✅';
    showToast('✅ Notifications enabled!');
    sendBrowserNotif('🏠 All set!','You\'ll get daily washing, water, sweep & rent reminders.');
  } else showToast('Permission denied. Enable in browser settings.');
};
function sendBrowserNotif(title,body){
  if(Notification.permission==='granted'){
    try{new Notification(title,{body,tag:'bh'});}catch(e){}
  }
}
function scheduleAutoNotifications(){
  setInterval(async()=>{
    const now=new Date();
    const [h,m]=[now.getHours(),now.getMinutes()];
    const washer=getTodayWasher();
    const prev=getYesterdayWasher();
    if(h===7&&m===0&&washer){
      sendBrowserNotif('🧺 Washing machine!',`Hey ${washer.name}, it's your turn today!`);
      await addNotification('🧺',`Auto-reminder: washing machine turn for ${washer.name}`);
    }
    if(h===8&&m===0&&prev){
      sendBrowserNotif('👕 Collect your clothes!',`Hey ${prev.name}, please collect your dried clothes!`);
      await addNotification('👕',`Auto-reminder: collect clothes sent to ${prev.name}`);
    }
    if(h===19&&m===0){
      const epoch=new Date(2024,0,1);
      const diff=Math.floor((now-epoch)/86400000);
      if(diff%2===0){
        const pair=getSweepPair(Math.floor(diff/2)+1);
        if(pair){
          sendBrowserNotif('🧹 Sweep tomorrow!',`${pair[0].name} & ${pair[1].name} — sweep duty tomorrow!`);
          await addNotification('🧹',`Auto-reminder: sweep duty for ${pair[0].name} & ${pair[1].name}`);
        }
      }
    }
    if(now.getDate()===1&&h===9&&m===0){
      sendBrowserNotif('💳 Rent due!','Please pay rent for this month.');
      await addNotification('💳','Monthly rent reminder sent to all');
    }
  },60000);
}
window.sendWashingNotif = async function() {
  const w=getTodayWasher(); if(!w)return;
  sendBrowserNotif('🧺 Washing machine!',`Hey ${w.name}, it's your turn today!`);
  await addNotification('🧺',`Washing reminder sent to ${w.name}`);
  await addActivity('📲',`Washing reminder sent to ${w.name}`);
  showToast(`📲 Reminder sent to ${w.name}!`);
};
window.sendCollectNotif = async function() {
  const w=getYesterdayWasher(); if(!w)return;
  sendBrowserNotif('👕 Collect clothes!',`Hey ${w.name}, collect your dried clothes from the rope!`);
  await addNotification('👕',`Collect clothes reminder sent to ${w.name}`);
  await addActivity('📲',`Clothes pickup reminder sent to ${w.name}`);
  showToast(`📲 Reminder sent to ${w.name}!`);
};
window.sendSweepNotif = async function() {
  const epoch=new Date(2024,0,1);
  const diff=Math.floor((today()-epoch)/86400000);
  const pair=getSweepPair(Math.floor(diff/2)+1);
  if(!pair)return;
  sendBrowserNotif('🧹 Sweep time!',`${pair[0].name} & ${pair[1].name} — sweep the house today!`);
  await addNotification('🧹',`Sweep reminder sent to ${pair[0].name} & ${pair[1].name}`);
  await addActivity('📲',`Sweep reminder sent to ${pair[0].name} & ${pair[1].name}`);
  showToast(`📲 Reminder sent to ${pair[0].name} & ${pair[1].name}!`);
};

// ── NOTIF PANEL ───────────────────────────────────────────────
window.showNotifPanel = function() {
  document.getElementById('notif-overlay').classList.remove('hidden');
  document.getElementById('notif-panel').classList.remove('hidden');
  document.getElementById('notif-dot').classList.add('hidden');
  const list=document.getElementById('notif-panel-list');
  if(S.notifications.length===0){list.innerHTML='<div class="empty-state" style="padding:24px">No notifications yet</div>';return;}
  list.innerHTML='';
  S.notifications.slice(0,50).forEach(n=>{
    const div=document.createElement('div'); div.className='notif-log-item';
    div.innerHTML=`<div class="notif-log-icon">${n.icon}</div><div><div class="notif-log-title">${n.title}</div><div class="notif-log-time">${n.time||''}</div></div>`;
    list.appendChild(div);
  });
};
window.hideNotifPanel = function() {
  document.getElementById('notif-overlay').classList.add('hidden');
  document.getElementById('notif-panel').classList.add('hidden');
};

// ── MODAL ─────────────────────────────────────────────────────
function showModal(title,body,actions) {
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').textContent=body;
  const ma=document.getElementById('modal-actions');
  ma.innerHTML='';
  actions.forEach(a=>{const b=document.createElement('button');b.className=a.cls;b.textContent=a.label;b.onclick=a.fn;ma.appendChild(b);});
  document.getElementById('modal-overlay').classList.remove('hidden');
}
window.hideModal = function(){document.getElementById('modal-overlay').classList.add('hidden');};
document.getElementById('modal-overlay').addEventListener('click',function(e){if(e.target===this)hideModal();});

// ── TOAST ─────────────────────────────────────────────────────
let toastT;
window.showToast = function(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.add('hidden'),3200);
};

// ── RESET ─────────────────────────────────────────────────────
window.confirmReset = function() {
  showModal('Reset ALL house data?',
    'This permanently deletes all water history, rent records, and activity from the cloud. All 7 housemates will lose everything. This cannot be undone.',
    [{label:'Delete everything',cls:'btn-danger',fn:async()=>{
      setSyncStatus('syncing','Deleting...');
      // Delete all docs
      const cols=['water_entries','activity','notifications','rent','sweep_done'];
      for(const col of cols){
        if(S.firebaseEnabled){
          const snap=await fbOps.getDocs(fbOps.collection(db,col));
          for(const d of snap.docs) await fbOps.deleteDoc(d.ref);
        } else {
          const all=lsAll();
          Object.keys(all).filter(k=>k.startsWith(col+'/')).forEach(k=>lsDelete(k));
        }
      }
      await dbDelete('config/'+HOUSE_DOC_ID);
      localStorage.removeItem('bh_yourName');
      hideModal();
      location.reload();
    }},{label:'Cancel',cls:'btn-secondary',fn:hideModal}]
  );
};

// ── SERVICE WORKER ────────────────────────────────────────────
function registerServiceWorker() {
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js')
      .then(()=>console.log('SW registered'))
      .catch(e=>console.log('SW failed',e));
  }
}

// ── KEYBOARD ─────────────────────────────────────────────────
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideModal();hideNotifPanel();}});
