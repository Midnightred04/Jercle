// Jercle Free Classrooms: timetable-based, not live occupancy.
const fcPage = document.getElementById('free-classrooms-page');
const fc = id => document.getElementById(id);
const FC_FIRST = '2026-09-21', FC_LAST = '2026-12-06';
let fcData = null, fcPromise = null, fcTab = 'free';

function fcNow() {
  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date());
  const p = Object.fromEntries(pieces.filter(x => x.type !== 'literal').map(x => [x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};
}
const fcMinute = s => { const a=s.split(':').map(Number); return a[0]*60+a[1]; };
function fcClock(m) {
  const h=Math.floor(m/60)%24, n=m%60;
  return ((h%12)||12)+':'+String(n).padStart(2,'0')+(h>=12?' PM':' AM');
}
const fcDay = d => new Date(d+'T12:00:00Z').getUTCDay();
const fcWeek = d => 1+Math.floor((Date.parse(d+'T00:00:00Z')-Date.parse(FC_FIRST+'T00:00:00Z'))/(7*86400000));
const fcSafe = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function fcSessionApplies(s,date,week,day) {
  if(s[1]!==day) return false;
  if(s[5]) return s[5].split(';').some(d=>d.trim()===date);
  const w=String(s[4]||'').toLowerCase();
  if(w.includes('even weeks')) return week%2===0;
  if(w.includes('odd weeks')) return week%2===1;
  const starts=w.match(/starts\s+week\s+(\d+)/);
  if(starts) return week>=Number(starts[1]);
  const exact=w.match(/^week\s+(\d+)$/);
  if(exact) return week===Number(exact[1]);
  return true;
}
function fcCategory(location) {
  const s=location.toLowerCase();
  if(s.includes('lecture theatre')) return 'theatre';
  if(/classroom|tutorial|seminar|block 19/.test(s)) return 'classroom';
  return 'lab';
}
function fcFeedback(message,warning) {
  const target=fc('fc-feedback');target.textContent=message;
  target.dataset.warning=warning?'true':'false';target.hidden=!message;
}
function fcView(tab) {
  fcTab=tab;
  fcPage.querySelectorAll('[data-fc-view]').forEach(b=>{
    const yes=b.dataset.fcView===tab;
    b.classList.toggle('is-active',yes);b.setAttribute('aria-pressed',String(yes));
  });
  fcRender();
}
function fcRender() {
  if(!fcData||fcPage.hidden) return;
  const date=fc('fc-date').value, time=fc('fc-time').value;
  if(!date||!time) return;
  const valid=date>=FC_FIRST&&date<=FC_LAST;
  const week=fcWeek(date), minute=fcMinute(time), day=fcDay(date);
  const duration=Number(fc('fc-duration').value);
  fc('fc-week').textContent=valid?'Teaching week '+week+' of 11':'Outside Autumn 2026 teaching period';
  fc('fc-duration-text').textContent=duration?
    'Free for '+duration+'+ minutes from '+fcClock(minute):'Availability at '+fcClock(minute);
  if(!valid) {
    for(const id of ['fc-stat-free','fc-stat-busy','fc-stat-check']) fc(id).textContent='—';
    fc('fc-result-heading').textContent='No timetable coverage';
    fc('fc-result-count').textContent='Select a teaching-week date';
    fc('fc-room-list').innerHTML='<div class="fc-empty">This data covers 21 September – 6 December 2026. Select a day within that teaching period.</div>';
    fcFeedback('No out-of-term availability can be inferred from this timetable.',true);
    return;
  }
  const byRoom=new Map();
  for(const s of fcData.slots) {
    if(!fcSessionApplies(s,date,week,day)) continue;
    if(!byRoom.has(s[0])) byRoom.set(s[0],[]);
    byRoom.get(s[0]).push(s);
  }
  const floor=fc('fc-floor').value,category=fc('fc-category').value;
  const text=fc('fc-search').value.trim().toLowerCase();
  const rooms=Object.entries(fcData.rooms).filter(([id,description])=>
    (floor==='all'||id.split('.')[0]===floor) &&
    (category==='all'||fcCategory(description)===category) &&
    (!text||(id+' '+description).toLowerCase().includes(text))
  ).map(([id,description])=>{
    const items=(byRoom.get(id)||[]).sort((a,b)=>a[2]-b[2]);
    const active=items.filter(s=>s[2]<=minute&&minute<s[3]);
    const busy=active.some(s=>!s[7]),check=!busy&&active.some(s=>s[7]);
    const upcoming=items.filter(s=>s[2]>minute);
    const next=upcoming.length?upcoming[0]:null;
    const clear= !busy&&!check&&(!next||next[2]>=minute+duration);
    let occupiedUntil=minute;
    if(busy) {
      for(const s of items.filter(s=>!s[7])) {
        if(s[2]>occupiedUntil) break;
        if(s[3]>occupiedUntil) occupiedUntil=s[3];
      }
    }
    return {id,description,items,busy,check,clear,next,occupiedUntil};
  });
  const free=rooms.filter(r=>r.clear),busy=rooms.filter(r=>r.busy),check=rooms.filter(r=>r.check);
  fc('fc-stat-free').textContent=free.length;
  fc('fc-stat-busy').textContent=busy.length;
  fc('fc-stat-check').textContent=check.length;
  const shown=rooms.filter(r=>fcTab==='all'||(fcTab==='free'&&r.clear)||(fcTab==='busy'&&r.busy)||(fcTab==='check'&&r.check))
    .sort((a,b)=>{
      const rank=r=>r.clear?0:r.check?1:r.busy?3:2;
      return rank(a)-rank(b) || ((a.next?a.next[2]:9999)-(b.next?b.next[2]:9999)) || a.id.localeCompare(b.id,undefined,{numeric:true});
    });
  const titles={free:'Scheduled free rooms',busy:'Rooms in use',check:'Rooms to check',all:'All teaching spaces'};
  fc('fc-result-heading').textContent=titles[fcTab];
  fc('fc-result-count').textContent=shown.length+' of '+rooms.length+' matching rooms';
  fcFeedback(minute<480||minute>=1350?
    'Outside most class hours. A timetable gap does not imply that the building or a room is accessible.':
    'Based on the uploaded timetable, not live occupancy. Unscheduled events, room changes and closures may not be reflected.',
    minute<480||minute>=1350);
  const list=fc('fc-room-list');
  if(!shown.length) {
    list.innerHTML='<div class="fc-empty">No rooms match your filters. Try another floor, a shorter free-time requirement, or All rooms.</div>';
    return;
  }
  list.innerHTML=shown.map(r=>{
    const state=r.busy?'busy':r.check?'check':r.clear?'free':'soon';
    const words={busy:'Scheduled class',check:'Check room',free:'Scheduled free',soon:'Class soon'};
    const description=r.description.startsWith(r.id+'-')?r.description.slice(r.id.length+1):r.description;
    const where=fcCategory(r.description);
    const roomType=where==='theatre'?'Lecture theatre':where==='classroom'?'Classroom':'Lab / teaching space';
    const nextText=r.busy?'In class until '+fcClock(r.occupiedUntil):
      r.check?'Possible booking right now':
      r.next?(r.next[7]?'Possible booking at ':'Next class at ')+fcClock(r.next[2]):
      'No later class listed today';
    const agenda=r.items.length?r.items.map(s=>{
      const extra=(s[7]?' · possible room':'')+(s[4]?' · '+s[4]:'');
      return '<li><span class="fc-event-dot'+(s[7]?' is-possible':'')+'"></span><span><strong>'+
        fcSafe(fcClock(s[2])+' – '+fcClock(s[3]))+'</strong><small>'+
        fcSafe(s[6]+extra)+'</small></span></li>';
    }).join(''):'<li class="fc-no-sessions">No scheduled class listed for this date.</li>';
    return '<details class="fc-room-card is-'+state+'"><summary>'+
      '<span class="fc-room-leading"><span class="fc-room-icon" aria-hidden="true">▦</span>'+
      '<span><strong class="fc-room-name">Room '+fcSafe(r.id)+'</strong><small>'+fcSafe(description)+'</small></span></span>'+
      '<span class="fc-room-trailing"><span class="fc-status fc-status-'+state+'">'+words[state]+'</span>'+
      '<span class="fc-room-next">'+fcSafe(nextText)+'</span></span><span class="fc-chevron" aria-hidden="true">⌄</span></summary>'+
      '<div class="fc-room-expanded"><div class="fc-room-meta"><span>Floor '+fcSafe(r.id.split('.')[0])+'</span><span>'+roomType+'</span></div>'+
      '<h3>Classes scheduled on this date</h3><ul class="fc-room-events">'+agenda+'</ul></div></details>';
  }).join('');
}
function fcSetNow() {
  const now=fcNow();fc('fc-date').value=now.date;fc('fc-time').value=now.time;fcRender();
}
async function fcLoad() {
  if(fcData) return fcRender();
  if(!fcPromise) fcPromise=fetch('./free-classrooms-data.json?v=1',{cache:'no-cache'})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(data=>{
      if(!data.rooms||!Array.isArray(data.slots)||data.slots.length<1000) throw new Error('Incomplete timetable');
      fcData=data;
      fc('fc-data-count').textContent=data.subjectCount+' subjects · '+data.sourceRows.toLocaleString()+' sessions · '+Object.keys(data.rooms).length+' room IDs';
      fc('fc-data-detail').textContent=data.unmappedRows+' entries have no room listed. '+data.ambiguousRows+' entries have multiple possible rooms and are marked for checking.';
      fcRender();
    }).catch(e=>{
      console.error('Free Classrooms:',e);
      fcFeedback('Unable to load the timetable. Refresh this page and try again.',true);
      fc('fc-room-list').innerHTML='<div class="fc-empty">Room availability is unavailable while the data cannot be loaded.</div>';
      fcPromise=null;
    });
  await fcPromise;
}
if(fcPage) {
  const now=fcNow();
  fc('fc-date').value=now.date;fc('fc-time').value=now.time;
  for(const id of ['fc-date','fc-time','fc-floor','fc-category','fc-duration','fc-search'])
    fc(id).addEventListener(id==='fc-search'?'input':'change',fcRender);
  fc('fc-now').addEventListener('click',fcSetNow);
  fcPage.querySelectorAll('[data-fc-view]').forEach(b=>b.addEventListener('click',()=>fcView(b.dataset.fcView)));
  fcView('free');
  fc('fc-live-clock').textContent=fcClock(fcMinute(now.time))+' Dubai';
  setInterval(()=>{if(!fcPage.hidden){const n=fcNow();fc('fc-live-clock').textContent=fcClock(fcMinute(n.time))+' Dubai';}},30000);
  window.addEventListener('jercle:free-classrooms',()=>{void fcLoad();});
}
