// Jercle V1. LOCAL PASSWORD IS NOT SECURE. Do not upload private data until real Firebase auth and rules work.
import { firebaseConfig, SHARED_FIREBASE_EMAIL, ALLOWED_UID } from "./firebase-config.js";
const $ = (selector) => document.querySelector(selector);
const app = $('#app');
const login = $('#login-page');
const dialog = $('#event-dialog');
const form = $('#event-form');
const state = { brainstorms: [], events: [], viewedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDate: todayISO(), mode: 'create' };
// Change this for LOCAL TESTING only. This password is visible to anyone who views script.js.
const DEMO_PASSWORD = 'lemmein';
let signedIn = false;
let cloud = null;
let unsubscribe = null;
let unsubscribeBrainstorms = null;
const firebaseReady = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && SHARED_FIREBASE_EMAIL && ALLOWED_UID);
async function setupFirebase() {
  if (!firebaseReady) return;
  const [{ initializeApp }, authMod, dbMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
  ]);
  const fbApp = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(fbApp);
  await authMod.setPersistence(auth, authMod.inMemoryPersistence);
  const db = dbMod.getFirestore(fbApp);
  cloud = {auth,db,authMod,dbMod};
}
function showLogin() { signedIn=false; login.hidden=false;app.hidden=true; if(unsubscribe){unsubscribe();unsubscribe=null;}if(unsubscribeBrainstorms){unsubscribeBrainstorms();unsubscribeBrainstorms=null;}state.events=[];state.brainstorms=[]; }
function startCloudEvents() {
  if (!cloud) return;
  const {db,dbMod}=cloud;
  if (unsubscribe) unsubscribe();
  $('#event-form-message').textContent='';
  unsubscribe=dbMod.onSnapshot(dbMod.collection(db,'events'),snap=>{
    state.events=snap.docs.map(d=>({id:d.id,...d.data()})); renderAll();
  }, err => {console.error(err);alert('Unable to load events. Check Firebase rules and UID configuration.');});
}
function startCloudBrainstorms() {
  if(!cloud) return;
  if(unsubscribeBrainstorms)unsubscribeBrainstorms();
  const {db,dbMod}=cloud;
  unsubscribeBrainstorms=dbMod.onSnapshot(dbMod.collection(db,'brainstorms'),snap=>{
    state.brainstorms=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderBrainstorms();
  },err=>{
    console.error(err);
    $('#brainstorm-message').textContent='Could not load ideas. Check the brainstorms Firestore rules.';
  });
}
function enterApp(){ signedIn=true;login.hidden=true;app.hidden=false;showPage(location.hash.slice(1)||'home');renderAll();if(cloud){startCloudEvents();startCloudBrainstorms();} }


function todayISO() { // Dubai's calendar date, not the browser's UTC date
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dateFromISO(iso) { const [y,m,d] = iso.split('-').map(Number); return new Date(y,m-1,d,12); }
function isoFromDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function formatDate(iso,opts={month:'short',day:'numeric',year:'numeric'}) { return dateFromISO(iso).toLocaleDateString('en-US', opts); }
function el(tag,className,text) { const e=document.createElement(tag); if(className)e.className=className; if(text!==undefined)e.textContent=text; return e; }
function showPage(name='home') {
  if(!signedIn)return;
  if(!['home','hangouts','memories','brainstorm'].includes(name))name='home';
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==`${name}-page`);
  document.querySelectorAll('.site-nav a').forEach(a=>a.setAttribute('aria-current',a.dataset.page===name?'page':'false'));
  if(location.hash!==`#${name}`)history.replaceState(null,'',`${location.pathname}${location.search}#${name}`);
  if(name==='hangouts')renderAll();if(name==='brainstorm')renderBrainstorms();
}
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const password=$('#password').value;
  const message=$('#login-message');message.classList.remove('error');
  if(password!==DEMO_PASSWORD){message.textContent='Incorrect password.';message.classList.add('error');return;}
  $('#login-button').disabled=true;message.textContent='Opening Jercle…';
  try {
    if(firebaseReady){
      if(!cloud)await setupFirebase();
      const creds=await cloud.authMod.signInWithEmailAndPassword(cloud.auth, SHARED_FIREBASE_EMAIL, password);
      if(creds.user.uid!==ALLOWED_UID){await cloud.authMod.signOut(cloud.auth);throw new Error('Account UID does not match.');}
    }
    $('#password').value='';message.textContent='';enterApp();
  } catch(err){console.error(err);message.textContent='Firebase sign-in failed. Check the shared account password, email, and config.';message.classList.add('error');}
  finally{$('#login-button').disabled=false;}
});
$('#logout-button').addEventListener('click',async()=>{
  if(cloud)await cloud.authMod.signOut(cloud.auth);
  showLogin();history.replaceState(null,'',location.pathname);
});
document.querySelectorAll('[data-page]').forEach(a=>a.addEventListener('click',e=>{if(!signedIn)return;e.preventDefault();showPage(a.dataset.page);}));
window.addEventListener('hashchange',()=>{if(signedIn)showPage(location.hash.slice(1)||'home');});
function activeEvents(){return state.events.filter(e=>!e.deletedAt).sort((a,b)=>a.startDate.localeCompare(b.startDate));}
function upcomingEvents(){const today=todayISO();return activeEvents().filter(e=>e.endDate>=today);}
function makeEventButton(event){
  const btn=el('button','event-card');btn.type='button';
  const date=el('div','event-card-date',formatDate(event.startDate,{month:'short',day:'numeric'}));
  const body=el('div');body.append(el('h3','',event.title),el('p','',`${event.startDate===event.endDate?'':formatDate(event.endDate)+' · '}${event.location}`));
  if(event.description)body.append(el('p','',event.description.length>130?`${event.description.slice(0,130)}…`:event.description));
  btn.append(date,body);btn.addEventListener('click',()=>showEventDetails(event.id));return btn;
}
function renderUpcoming(){const box=$('#upcoming-events');box.replaceChildren();const events=upcomingEvents();if(!events.length)box.append(el('p','empty-state',"No upcoming plans."));else events.forEach(e=>box.append(makeEventButton(e)));}
function renderCalendar(){
  const month=state.viewedMonth,year=month.getFullYear(),index=month.getMonth();
  $('#calendar-month').textContent=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const cal=$('#calendar');cal.replaceChildren();
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>cal.append(el('div','weekday',d)));
  const offset=(new Date(year,index,1).getDay()+6)%7;
  for(let i=0;i<offset;i++)cal.append(el('div','calendar-cell blank'));
  const count=new Date(year,index+1,0).getDate();
  for(let day=1;day<=count;day++){
    const iso=isoFromDate(new Date(year,index,day));const has=activeEvents().some(e=>e.startDate<=iso&&e.endDate>=iso);
    const btn=el('button','calendar-cell',String(day));btn.type='button';btn.setAttribute('aria-label',formatDate(iso,{weekday:'long',month:'long',day:'numeric',year:'numeric'}));
    if(iso===todayISO())btn.classList.add('today');if(iso===state.selectedDate)btn.classList.add('selected');
    if(has){btn.classList.add('has-event');btn.append(el('span','calendar-dot'));}
    btn.setAttribute('aria-pressed',String(iso===state.selectedDate));
    btn.addEventListener('click',()=>{state.selectedDate=iso;renderCalendar();renderSelectedDay();});cal.append(btn);
  }
}
function renderSelectedDay(){
  const panel=$('#selected-date-events');panel.replaceChildren(el('h3','',formatDate(state.selectedDate,{weekday:'long',month:'long',day:'numeric',year:'numeric'})));
  const matching=activeEvents().filter(e=>e.startDate<=state.selectedDate&&e.endDate>=state.selectedDate);
  if(!matching.length)panel.append(el('p','', 'No plans for this date yet.'));
  matching.forEach(event=>{const b=el('button','day-event',event.title);b.type='button';b.addEventListener('click',()=>showEventDetails(event.id));panel.append(b);});
}
function renderAll(){renderUpcoming();renderCalendar();renderSelectedDay();}
$('#previous-month').addEventListener('click',()=>{state.viewedMonth=new Date(state.viewedMonth.getFullYear(),state.viewedMonth.getMonth()-1,1);renderCalendar();});
$('#next-month').addEventListener('click',()=>{state.viewedMonth=new Date(state.viewedMonth.getFullYear(),state.viewedMonth.getMonth()+1,1);renderCalendar();});
function openEventForm(event=null){
  if(!signedIn)return;
  state.mode=event?'edit':'create';form.reset();$('#event-id').value=event?.id||'';
  $('#event-dialog-title').textContent=event?'Edit Event':'Add Upcoming Event';$('#save-event').textContent=event?'Save Changes':'Create Event';
  $('#event-start').value=event?.startDate||state.selectedDate;$('#event-end').value=event?.endDate||state.selectedDate;
  $('#event-title').value=event?.title||'';$('#event-time').value=event?.startTime||'';$('#event-location').value=event?.location||'';$('#event-description').value=event?.description||'';
  $('#event-form-message').textContent=cloud?'Saved to Firebase':'Local demo: events disappear on refresh.';$('#event-form-message').classList.remove('error');
  if(!dialog.open)dialog.showModal();
}
$('#add-event-button').addEventListener('click',()=>openEventForm());
$('#close-event-dialog').addEventListener('click',()=>dialog.close());$('#cancel-event').addEventListener('click',()=>dialog.close());
$('#event-start').addEventListener('change',()=>{if($('#event-end').value<$('#event-start').value)$('#event-end').value=$('#event-start').value;});
form.addEventListener('submit',async e=>{
  e.preventDefault();if(!signedIn)return;
  const title=$('#event-title').value.trim(),locationName=$('#event-location').value.trim(),startDate=$('#event-start').value,endDate=$('#event-end').value;
  if(!title||!locationName||!startDate||!endDate||endDate<startDate){$('#event-form-message').textContent='Please enter a title, location, and valid date range.';$('#event-form-message').classList.add('error');return;}
  const payload={title,location:locationName,startDate,endDate,startTime:$('#event-time').value,description:$('#event-description').value.trim()};
  const id=$('#event-id').value;
  const saveBtn=$('#save-event');saveBtn.disabled=true;
  try{
    if(cloud){
      const {db,dbMod}=cloud;
      if(state.mode==='edit'){
        await dbMod.updateDoc(dbMod.doc(db,'events',id),{...payload,updatedAt:dbMod.serverTimestamp()});
      } else {
        await dbMod.addDoc(dbMod.collection(db,'events'),{...payload,timezone:'Asia/Dubai',deletedAt:null,createdAt:dbMod.serverTimestamp(),updatedAt:dbMod.serverTimestamp()});
      }
    }else{
      if(state.mode==='edit'){const existing=state.events.find(item=>item.id===id);if(existing)Object.assign(existing,payload);}else state.events.push({id:crypto.randomUUID(),...payload,deletedAt:null});
    }
    dialog.close();renderAll();
  }catch(err){console.error(err);$('#event-form-message').textContent='Could not save event. Check Firestore permissions.';$('#event-form-message').classList.add('error');}
  finally{saveBtn.disabled=false;}
});
function showEventDetails(id){
  const event=state.events.find(e=>e.id===id);if(!event||event.deletedAt)return;
  form.hidden=true;const previous=dialog.querySelector('.event-details');if(previous)previous.remove();
  const details=el('div','event-details');details.append(el('h2','',event.title),el('p','',`${formatDate(event.startDate)}${event.endDate!==event.startDate?' – '+formatDate(event.endDate):''}${event.startTime?' · '+event.startTime:''}`),el('p','',event.location),el('p','',event.description||'No description added.'));
  const actions=el('div','dialog-actions');const del=el('button','button button-danger','Delete');const edit=el('button','button button-primary','Edit');const close=el('button','button button-quiet','Close');
  [del,edit,close].forEach(b=>b.type='button');
  del.addEventListener('click',async()=>{if(!confirm(`Delete "${event.title}"?`))return;
    try { if(cloud){await cloud.dbMod.updateDoc(cloud.dbMod.doc(cloud.db,'events',event.id),{deletedAt:cloud.dbMod.serverTimestamp(),updatedAt:cloud.dbMod.serverTimestamp()});}
      else event.deletedAt=new Date().toISOString();dialog.close();renderAll(); }
    catch(err){console.error(err);alert('Could not delete event.');}
  });
  edit.addEventListener('click',()=>{dialog.close();form.hidden=false;openEventForm(event);});
  close.addEventListener('click',()=>dialog.close());actions.append(del,edit,close);details.append(actions);dialog.append(details);dialog.showModal();
  dialog.addEventListener('close',()=>{details.remove();form.hidden=false;},{once:true});
}
// Ready. With no Firebase config, use local-only demo. Firebase configured => Firestore and Auth are required.
showLogin();

// Brainstorm: separate Firebase collection. Local-only fallback for offline prototyping.
const brainstormDialog=$('#brainstorm-dialog');
const brainstormForm=$('#brainstorm-form');
$('#add-brainstorm-button').addEventListener('click',()=>{
  if(!signedIn)return;
  brainstormForm.reset();
  $('#brainstorm-form-message').textContent='';
  brainstormDialog.showModal();
  $('#brainstorm-name').focus();
});
$('#close-brainstorm-dialog').addEventListener('click',()=>brainstormDialog.close());
$('#cancel-brainstorm').addEventListener('click',()=>brainstormDialog.close());
brainstormForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!signedIn)return;
  const name=$('#brainstorm-name').value.trim();
  const description=$('#brainstorm-description').value.trim();
  const message=$('#brainstorm-form-message');
  message.classList.remove('error');
  if(!name||!description||name.length>100||description.length>2000){
    message.textContent='Enter a name and description.';message.classList.add('error');return;
  }
  const save=$('#save-brainstorm');save.disabled=true;
  try{
    if(cloud){
      await cloud.dbMod.addDoc(cloud.dbMod.collection(cloud.db,'brainstorms'),{
        name,description,createdAt:cloud.dbMod.serverTimestamp()
      });
    }else{
      state.brainstorms.unshift({id:crypto.randomUUID(),name,description,createdAt:{seconds:Math.floor(Date.now()/1000)}});
      renderBrainstorms();
    }
    brainstormDialog.close();
  }catch(err){
    console.error(err);message.textContent='Could not post idea. Check Firebase permissions.';message.classList.add('error');
  }finally{save.disabled=false;}
});
function renderBrainstorms(){
  const list=$('#brainstorm-list');
  list.replaceChildren();
  const items=[...state.brainstorms].sort((a,b)=>{
    const at=a.createdAt?.seconds??0,bt=b.createdAt?.seconds??0;
    return bt-at;
  });
  if(!items.length){list.append(el('p','empty-state','No ideas yet.'));return;}
  for(const item of items){
    const card=el('article','brainstorm-note');
    const heading=el('h3','',item.name);
    const body=el('p','',item.description);
    card.append(heading,body);
    list.append(card);
  }
}
