/* Jercle Music: consent-based Spotify PKCE, shared Firestore Blends and Premium playback. */
import { getApps } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const TOKEN_KEY = 'jercle-spotify-session-v1';
const CLIENT_KEY = 'jercle-spotify-client-id-v1';
const VERIFIER_KEY = 'jercle-spotify-verifier';
const STATE_KEY = 'jercle-spotify-state';
const SCOPES = 'user-read-private user-top-read streaming user-read-playback-state user-modify-playback-state playlist-modify-private';
const redirectUri = new URL('./index.html', window.location.href).href;
const page = $('music-page');
const music = { profile:null, tops:[], members:[], blendId:null, stop:null, generated:[], queue:[], current:0, shuffle:false, repeat:false, player:null, deviceId:null, paused:true, duration:0, position:0, initPromise:null };
const strip = value => String(value || '').slice(0,180);
const secureId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
const idOK = x => /^[A-F0-9]{10}$/.test(x);
const clientId = () => (localStorage.getItem(CLIENT_KEY)||'').trim();
const ss = () => { try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); } catch { return null; } };
const time = ms => { const s=Math.max(0,Math.floor((Number(ms)||0)/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
const cover = url => /^https:\/\//.test(url || '') ? url : null;
const dataURL = uri => /^spotify:track:[A-Za-z0-9]+$/.test(uri || '');
const spotifyLink = uri => dataURL(uri) ? 'https://open.spotify.com/track/'+encodeURIComponent(uri.split(':')[2]) : 'https://open.spotify.com/';
function notice(message, error=false) { const n=$('music-notice'); n.hidden=!message;n.textContent=message||'';n.dataset.error=String(error); }
function fail(error, context='Something went wrong') {
  console.error('Jercle Music:', error);
  const s=String(error?.message||error||'');
  notice(context + ': ' + s.slice(0,220), true);
}
function appDB() {
  if ($('app').hidden) throw new Error('Log in to Jercle first.');
  const app = getApps()[0];
  if (!app || !getAuth(app).currentUser) throw new Error('Jercle Firebase sign-in is required.');
  return getFirestore(app);
}
function setToken(data) {
  const previous=ss()||{};
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token:data.access_token,
    refresh_token:data.refresh_token||previous.refresh_token,
    expires_at:Date.now() + (Number(data.expires_in)||3600)*1000-60000
  }));
}
async function refreshToken() {
  const saved=ss();
  if (!saved?.refresh_token) throw new Error('Please reconnect your Spotify account.');
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refresh_token,client_id:clientId()});
  const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const json=await response.json();
  if(!response.ok) throw new Error(json.error_description||json.error||'Spotify token refresh failed');
  setToken(json);
  return json.access_token;
}
async function token() {
  const saved=ss();
  if (!saved?.access_token) throw new Error('Connect Spotify to continue.');
  return saved.expires_at>Date.now() ? saved.access_token : refreshToken();
}
async function api(path,method='GET',body) {
  const headers={Authorization:'Bearer '+await token()};
  if (body!==undefined) headers['Content-Type']='application/json';
  const response=await fetch('https://api.spotify.com/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if (response.status===204) return {};
  const result=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(result?.error?.message||'Spotify request failed ('+response.status+'). Check your account, permissions, and developer allowlist.');
  return result;
}
async function pkce() {
  if(!clientId()) {$('music-redirect-hint').textContent=redirectUri;$('music-setup-dialog').showModal();return;}
  const raw=crypto.getRandomValues(new Uint8Array(64));
  const verifier=Array.from(raw,n=>'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[n%66]).join('');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const state=secureId()+secureId();
  sessionStorage.setItem(VERIFIER_KEY,verifier);
  sessionStorage.setItem(STATE_KEY,state);
  const pending=cleanCode(new URLSearchParams(location.search).get('blend'));
  if(idOK(pending))sessionStorage.setItem('jercle-pending-blend',pending);
  const url=new URL('https://accounts.spotify.com/authorize');
  url.search=new URLSearchParams({client_id:clientId(),response_type:'code',redirect_uri:redirectUri,scope:SCOPES,code_challenge_method:'S256',code_challenge:challenge,state}).toString();
  window.location.assign(url.toString());
}
async function oauthReturn() {
  const url=new URL(location.href);
  if(!url.searchParams.has('code')&&!url.searchParams.has('error'))return;
  const code=url.searchParams.get('code'), received=url.searchParams.get('state');
  const authError=url.searchParams.get('error');
  url.searchParams.delete('code');url.searchParams.delete('state');url.searchParams.delete('error');
  url.hash='music';
  history.replaceState(null,'',url.toString());
  // Updating history alone does not notify Jercle's single-page router.
  if(!$('app').hidden)window.dispatchEvent(new Event('hashchange'));
  if(authError){notice('Spotify authorization was cancelled or denied.',true);return;}
  const verifier=sessionStorage.getItem(VERIFIER_KEY);
  const expected=sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(STATE_KEY);
  if(!verifier||!received||received!==expected){notice('Spotify sign-in validation failed. Please connect again.',true);return;}
  try{
    const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId(),grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error_description||result.error||'Spotify authorization failed');
    setToken(result);
    await fetchProfile();
    notice('Connected to Spotify. You can now create or join a Blend.');
  }catch(error){fail(error,'Spotify connection failed');}
}
async function fetchProfile() {
  music.profile=await api('/me');
  renderAccount();
  await getTopTracks();
  const invited=cleanCode(new URLSearchParams(location.search).get('blend')||sessionStorage.getItem('jercle-pending-blend'));
  if(idOK(invited)&&!$('app').hidden) await joinBlend(invited);
}
async function getTopTracks(){
  try{
    const data=await api('/me/top/tracks?time_range=medium_term&limit=30');
    music.tops=(data.items||[]).filter(track=>dataURL(track.uri)).slice(0,30).map((track,index)=>({
      uri:track.uri,title:strip(track.name),artist:strip((track.artists||[]).map(a=>a.name).join(', ')),
      artistIds:(track.artists||[]).map(a=>a.id).filter(Boolean).slice(0,3),
      image:cover(track.album?.images?.[0]?.url)||'',duration:Number(track.duration_ms)||0,rank:index
    }));
    if(!music.tops.length) notice('Spotify returned no top tracks for this account yet. Try listening on Spotify and reconnecting.');
  }catch(error){fail(error,'Could not read your listening preferences');}
}
function renderAccount(){
  const linked=!!music.profile;
  $('music-connection-label').textContent=linked?'Connected as '+strip(music.profile.display_name||music.profile.id):'Spotify not connected';
  $('music-connect').textContent=linked?'Switch Spotify ↗':clientId()?'Connect Spotify ↗':'Set up Spotify ↗';
  $('music-disconnect').hidden=!linked;
}
function memberData(){
  if(!music.profile)throw new Error('Connect Spotify to add your taste.');
  if(!music.tops.length)throw new Error('Your Spotify top tracks are unavailable. Reconnect and try again.');
  return {id:strip(music.profile.id),name:strip(music.profile.display_name||music.profile.id),image:cover(music.profile.images?.[0]?.url)||'',tracks:music.tops,updatedAt:serverTimestamp()};
}
function cleanCode(code){return String(code||'').trim().toUpperCase().replace(/[^A-F0-9]/g,'');}
async function createBlend(){
  try{
    if(!music.profile){notice('Connect Spotify before creating a Blend.',true);await pkce();return;}
    const db=appDB(),code=secureId();
    await setDoc(doc(db,'musicBlends',code),{title:'Jercle Music Blend',createdBy:strip(music.profile.id),createdAt:serverTimestamp()});
    await joinBlend(code);
    notice('Blend created! Share the invite so friends can contribute their music.');
  }catch(error){fail(error,'Could not create Blend. Firestore musicBlends permissions may need setup');}
}
async function joinBlend(code){
  code=cleanCode(code);
  if(!idOK(code)){notice('Enter a valid 10-character Blend code.',true);return;}
  if(!music.profile){notice('Connect Spotify first, then join this Blend.',true);return;}
  try{
    const db=appDB(),room=doc(db,'musicBlends',code);
    if(!(await getDoc(room)).exists())throw new Error('Blend not found. Check the invite code.');
    if(music.stop){music.stop();music.stop=null;}
    music.blendId=code;
    const u=music.profile.id;
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(u))throw new Error('Spotify user ID is not supported.');
    await setDoc(doc(db,'musicBlends',code,'members',u),memberData());
    music.stop=onSnapshot(collection(db,'musicBlends',code,'members'),snapshot=>{
      if(music.blendId!==code)return;
      music.members=snapshot.docs.map(d=>d.data()).filter(x=>Array.isArray(x.tracks)).slice(0,10);
      buildBlend();notice('');
    },error=>fail(error,'Live Blend sync failed. Check Firestore rules'));
    sessionStorage.setItem('jercle-active-blend',code);
    sessionStorage.removeItem('jercle-pending-blend');
    const url=new URL(location.href);
    url.searchParams.set('blend',code);url.hash='music';history.replaceState(null,'',url.toString());
    renderBlend();
  }catch(error){fail(error,'Could not join Blend. Check invite and Firebase permissions');}
}
function buildBlend(){
  const members=music.members;
  const unique=new Map();
  for(const member of members){
    (member.tracks||[]).slice(0,30).forEach((track,index)=>{
      if(!dataURL(track.uri))return;
      const existing=unique.get(track.uri)||{...track,names:[],score:0};
      if(!existing.names.includes(member.name))existing.names.push(strip(member.name));
      existing.score+=Math.max(1,30-index);
      unique.set(track.uri,existing);
    });
  }
  const overlaps=[...unique.values()].filter(t=>t.names.length>1).sort((a,b)=>b.names.length-a.names.length||b.score-a.score).slice(0,9);
  const result=[...overlaps], used=new Set(result.map(t=>t.uri));
  for(let rank=0;rank<30&&result.length<50;rank++){
    for(const member of members){
      const track=(member.tracks||[])[rank];
      if(!track||used.has(track.uri))continue;
      const item=unique.get(track.uri);
      if(item){used.add(track.uri);result.push(item);}
      if(result.length>=50)break;
    }
  }
  music.generated=result;
  music.queue=music.shuffle?shuffled(result):[...result];
  music.current=Math.max(0,Math.min(music.current,music.queue.length-1));
  renderBlend();renderPlayer();
}
function shuffled(items){let arr=[...items];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function displayTrack(row,track,i){
  row.className='music-song-row';row.tabIndex=0;row.setAttribute('role','button');
  row.setAttribute('aria-label','Play '+strip(track.title)+' by '+strip(track.artist));
  row.dataset.active=String(i===music.current);
  const identity=document.createElement('div');identity.className='music-song-ident';
  if(cover(track.image)){const img=document.createElement('img');img.src=track.image;img.alt='';img.loading='lazy';identity.append(img);}else{const icon=document.createElement('span');icon.className='music-song-thumb';icon.textContent='♪';identity.append(icon);}
  const copy=document.createElement('span'),title=document.createElement('strong'),by=document.createElement('small');
  title.textContent=strip(track.title);by.textContent=strip(track.artist);
  copy.append(title,by);identity.append(copy);
  const owner=document.createElement('span');owner.className='music-song-owner';owner.textContent=track.names?.slice(0,2).join(' + ')||'Blend';
  const duration=document.createElement('span');duration.className='music-song-length';duration.textContent=time(track.duration);
  row.append(identity,owner,duration);
  row.addEventListener('click',()=>{music.current=i;playSelection().catch(error=>fail(error,'Playback unavailable'));});
  row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();row.click();}});
}
function renderBlend(){
  $('music-track-count').textContent=music.generated.length+' tracks';
  $('music-export').disabled=!music.profile||!music.generated.length;
  $('music-copy-invite').hidden=!music.blendId;
  $('music-leave-blend').hidden=!music.blendId;
  $('music-blend-code').textContent=music.blendId?'BLEND CODE · '+music.blendId:'NO ACTIVE BLEND';
  $('music-friends-count').textContent=String(music.members.length);
  const meta=$('music-blend-meta');meta.replaceChildren();
  const mark=document.createElement('span');mark.className='music-empty-avatar';mark.textContent='✳';
  const detail=document.createElement('span');
  detail.textContent=music.blendId?music.members.length+' friend'+(music.members.length===1?'':'s')+' in this Blend · '+music.generated.length+' shared picks':'Start or join a Blend to build a playlist from everyone’s top tracks.';
  meta.append(mark,detail);
  const list=$('music-song-list');list.replaceChildren();
  if(!music.queue.length){const empty=document.createElement('div');empty.className='music-empty-state';empty.innerHTML='<span class="music-empty-icon">♫</span><h3>Nothing on the queue yet.</h3><p>Connect Spotify, invite friends and let the music find you.</p>';list.append(empty);}
  else music.queue.forEach((track,i)=>{const row=document.createElement('div');displayTrack(row,track,i);list.append(row);});
  const friends=$('music-friends-list');friends.replaceChildren();
  if(!music.members.length){const empty=document.createElement('div');empty.className='music-friends-empty';empty.textContent='Your friends will appear here once they join your Blend.';friends.append(empty);}
  music.members.forEach(member=>{
    const row=document.createElement('div');row.className='music-friend';
    const avatar=document.createElement('span');avatar.className='music-friend-avatar';
    if(cover(member.image)){const img=document.createElement('img');img.src=member.image;img.alt='';avatar.append(img);}
    else avatar.textContent=strip(member.name).slice(0,1).toUpperCase();
    const info=document.createElement('span'),name=document.createElement('strong'),desc=document.createElement('small');
    name.textContent=strip(member.name);desc.textContent=(member.tracks||[]).length+' top songs contributed';
    info.append(name,desc);const check=document.createElement('span');check.className='music-friend-check';check.textContent='✓';row.append(avatar,info,check);friends.append(row);
  });
  const shared=music.generated.filter(t=>t.names.length>=2);
  $('music-discovery-text').textContent=shared.length?'Your group shares '+shared.length+' favourite song'+(shared.length===1?'':'s')+'. First match: '+shared[0].title+' by '+shared[0].artist+'.':music.members.length>1?'Different favourites, one playlist. Explore each other’s picks!':'Invite another friend to discover your musical overlap.';
}
function renderPlayer(){
  const track=music.queue[music.current];
  const coverEl=$('music-cover');coverEl.replaceChildren();
  if(track&&cover(track.image)){const img=document.createElement('img');img.alt='Album art for '+strip(track.title);img.src=track.image;coverEl.append(img);}
  else {const symbol=document.createElement('span');symbol.textContent='♪';coverEl.append(symbol);}
  $('music-track-title').textContent=track?strip(track.title):'Your next favourite';
  $('music-track-artist').textContent=track?strip(track.artist):'Create a Blend to get started';
  $('music-open-track').hidden=!track;
  $('music-open-track').href=track?spotifyLink(track.uri):'https://open.spotify.com/';
  $('music-duration').textContent=time(track?track.duration:0);
  $('music-elapsed').textContent=time(music.position);
  $('music-seek').disabled=!music.deviceId||!track;
  $('music-seek').value=String(track?.duration?Math.min(100,Math.round(music.position/track.duration*100)):0);
  $('music-play').textContent=music.paused?'▶':'Ⅱ';$('music-play').setAttribute('aria-label',music.paused?'Play':'Pause');
  $('music-shuffle').setAttribute('aria-pressed',String(music.shuffle));
  $('music-repeat').setAttribute('aria-pressed',String(music.repeat));
  document.querySelectorAll('.music-song-row').forEach((row,i)=>{row.dataset.active=String(i===music.current);});
}
async function loadPlayerSDK(){
  if(music.deviceId)return;
  if(music.initPromise)return music.initPromise;
  if(!music.profile)throw new Error('Connect Spotify first.');
  music.initPromise=new Promise((resolve,reject)=>{
    let finished=false;
    const done=(error)=>{if(finished)return;finished=true;error?reject(error):resolve();};
    const start=()=>{
      try{
        const player=new Spotify.Player({name:'Jercle Music Room',getOAuthToken:callback=>{token().then(callback).catch(error=>fail(error,'Spotify session expired'));},volume:0.7});
        music.player=player;
        player.addListener('ready',({device_id})=>{music.deviceId=device_id;$('music-player-status').textContent='Jercle player ready · Spotify Premium';done();});
        player.addListener('not_ready',()=>{music.deviceId=null;});
        player.addListener('initialization_error',({message})=>done(new Error(message)));
        player.addListener('authentication_error',({message})=>done(new Error(message)));
        player.addListener('account_error',({message})=>done(new Error('Spotify Premium is required. '+message)));
        player.addListener('player_state_changed',state=>{
          if(!state)return;
          music.paused=state.paused;music.position=state.position||0;music.duration=state.duration||0;
          const uri=state.track_window?.current_track?.uri;
          const index=music.queue.findIndex(t=>t.uri===uri);
          if(index>=0)music.current=index;
          renderPlayer();
        });
        player.connect().then(connected=>{if(!connected)done(new Error('Spotify Web Playback SDK could not connect.'));}).catch(done);
      }catch(error){done(error);}
    };
    if(window.Spotify?.Player){start();return;}
    window.onSpotifyWebPlaybackSDKReady=start;
    if(!document.getElementById('music-spotify-sdk')){
      const script=document.createElement('script');script.id='music-spotify-sdk';script.src='https://sdk.scdn.co/spotify-player.js';script.onerror=()=>done(new Error('Could not load Spotify playback library.'));document.head.append(script);
    }
  }).catch(error=>{music.initPromise=null;throw error;});
  return music.initPromise;
}
async function playSelection(){
  if(!music.queue.length){notice('Create or join a Blend to play music.',true);return;}
  $('music-player-status').textContent='Connecting to Spotify playback…';
  await loadPlayerSDK();
  const uris=music.queue.map(t=>t.uri).filter(dataURL);
  if(!uris.length)throw new Error('No playable songs in this Blend.');
  await api('/me/player','PUT',{device_ids:[music.deviceId],play:false});
  await api('/me/player/play?device_id='+encodeURIComponent(music.deviceId),'PUT',{uris,offset:{position:music.current},position_ms:0});
  music.paused=false;music.position=0;renderPlayer();
}
async function togglePlayback(){
  if(!music.queue.length){notice('There is no track to play yet. Start or join a Blend.',true);return;}
  if(!music.deviceId||!music.player){await playSelection();return;}
  if(music.paused){
    const state=await music.player.getCurrentState();
    if(!state){await playSelection();return;}
    await music.player.resume();
  } else await music.player.pause();
  music.paused=!music.paused;renderPlayer();
}
async function leaveBlend(){
  const code=music.blendId;
  if(!code)return;
  try{if(music.profile){const db=appDB();await deleteDoc(doc(db,'musicBlends',code,'members',music.profile.id));}}
  catch(error){fail(error,'Could not remove your shared songs');return;}
  if(music.stop){music.stop();music.stop=null;}
  music.blendId=null;music.members=[];music.generated=[];music.queue=[];music.current=0;music.position=0;music.paused=true;
  sessionStorage.removeItem('jercle-active-blend');
  sessionStorage.removeItem('jercle-pending-blend');
  const url=new URL(location.href);url.searchParams.delete('blend');history.replaceState(null,'',url.toString());
  if(music.player)await music.player.pause().catch(()=>{});
  renderBlend();renderPlayer();notice('You left the Blend. Your shared songs were removed.');
}
async function exportPlaylist(){
  if(!music.generated.length)return;
  try{
    $('music-export').disabled=true;notice('Creating your playlist on Spotify…');
    const playlist=await api('/me/playlists','POST',{name:'Jercle Blend · '+(music.blendId||'Our favourites'),description:'A shared soundtrack from the Jercle Music Room.',public:false,collaborative:false});
    if(!playlist.id)throw new Error('Spotify did not return a playlist ID.');
    const uris=music.generated.map(t=>t.uri).filter(dataURL);
    for(let i=0;i<uris.length;i+=100)await api('/playlists/'+encodeURIComponent(playlist.id)+'/items','POST',{uris:uris.slice(i,i+100)});
    notice('Playlist saved in your Spotify account!');
    const url=playlist.external_urls?.spotify||'https://open.spotify.com/playlist/'+encodeURIComponent(playlist.id);
    if(window.confirm('Jercle Blend saved! Open it in Spotify?'))window.open(url,'_blank','noopener,noreferrer');
  }catch(error){fail(error,'Could not save playlist');}
  finally{$('music-export').disabled=!music.profile||!music.generated.length;}
}
async function copyInvite(){
  if(!music.blendId)return;
  const url=new URL('./index.html',location.href);url.searchParams.set('blend',music.blendId);url.hash='music';
  try{await navigator.clipboard.writeText(url.toString());notice('Invite link copied! Share it with your friends.');}
  catch{window.prompt('Copy this Blend invitation:',url.toString());}
}
function disconnect(){
  if(music.player){music.player.disconnect();music.player=null;music.deviceId=null;music.initPromise=null;}
  sessionStorage.removeItem(TOKEN_KEY);music.profile=null;music.tops=[];
  if(music.stop){music.stop();music.stop=null;}
  music.blendId=null;music.members=[];music.generated=[];music.queue=[];music.paused=true;music.position=0;
  sessionStorage.removeItem('jercle-active-blend');
  renderAccount();renderBlend();renderPlayer();
}
function openSpotifyBlendInvite(){
  const raw=$('music-spotify-blend-link').value.trim();
  let url;
  try { url=new URL(raw); } catch { notice('Paste a valid Spotify Blend invite link.',true); return; }
  if(url.protocol!=='https:' || url.hostname!=='open.spotify.com' || !/^\\/blend\\/taste-match\\/[a-zA-Z0-9]+\\/?$/.test(url.pathname)) {
    notice('This is not a Spotify Blend invitation. Paste a link starting with https://open.spotify.com/blend/taste-match/',true);
    return;
  }
  const clean=new URL(url.pathname,url.origin);
  const si=url.searchParams.get('si');
  if(si)clean.searchParams.set('si',si);
  notice('Opening your Spotify Blend invitation. Accept it in Spotify to join.');
  window.open(clean.href,'_blank','noopener,noreferrer');
}
function bindUI(){
  $('music-open-spotify-blend').addEventListener('click',openSpotifyBlendInvite);
  $('music-spotify-blend-link').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();openSpotifyBlendInvite();}});
  $('music-connect').addEventListener('click',()=>pkce().catch(error=>fail(error,'Could not start Spotify sign-in')));
  $('music-disconnect').addEventListener('click',()=>{disconnect();notice('Spotify disconnected from this browser.');});
  $('music-create-blend').addEventListener('click',()=>createBlend());
  $('music-join-blend').addEventListener('click',()=>{$('music-join-dialog').showModal();});
  $('music-join-form').addEventListener('submit',event=>{event.preventDefault();$('music-join-dialog').close();joinBlend($('music-invite-code').value);});
  $('music-setup-form').addEventListener('submit',event=>{
    event.preventDefault();const id=$('music-client-id').value.trim();
    if(!/^[a-fA-F0-9]{32}$/.test(id)){notice('Enter the 32-character Spotify Client ID, not your Client Secret.',true);return;}
    localStorage.setItem(CLIENT_KEY,id);$('music-setup-dialog').close();renderAccount();
    pkce().catch(error=>fail(error,'Spotify authorization error'));
  });
  document.querySelectorAll('[data-music-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.musicClose).close()));
  $('music-copy-invite').addEventListener('click',copyInvite);
  $('music-leave-blend').addEventListener('click',leaveBlend);
  $('music-export').addEventListener('click',exportPlaylist);
  $('music-play').addEventListener('click',()=>togglePlayback().catch(error=>fail(error,'Could not control Spotify player')));
  $('music-previous').addEventListener('click',()=>{if(!music.queue.length)return;music.current=(music.current-1+music.queue.length)%music.queue.length;playSelection().catch(error=>fail(error,'Playback error'));});
  $('music-next').addEventListener('click',()=>{if(!music.queue.length)return;music.current=(music.current+1)%music.queue.length;playSelection().catch(error=>fail(error,'Playback error'));});
  $('music-shuffle').addEventListener('click',()=>{music.shuffle=!music.shuffle;const playing=music.queue[music.current]?.uri;music.queue=music.shuffle?shuffled(music.generated):[...music.generated];music.current=Math.max(0,music.queue.findIndex(t=>t.uri===playing));renderBlend();renderPlayer();});
  $('music-repeat').addEventListener('click',()=>{
    music.repeat=!music.repeat;renderPlayer();
    if(music.deviceId)api('/me/player/repeat?state='+(music.repeat?'track':'off')+'&device_id='+encodeURIComponent(music.deviceId),'PUT').catch(error=>fail(error,'Could not change repeat'));
  });
  const seek=$('music-seek');
  seek.addEventListener('change',()=>{if(music.player&&music.queue[music.current]){const ms=Number(seek.value)/100*music.queue[music.current].duration;music.player.seek(ms).catch(error=>fail(error,'Could not seek'));}});
  setInterval(async()=>{if(music.player&&!music.paused&&music.deviceId){
    try{const state=await music.player.getCurrentState();if(state){music.position=state.position||0;const track=music.queue[music.current];if(track){seek.value=String(Math.min(100,Math.round(music.position/track.duration*100)||0));$('music-elapsed').textContent=time(music.position);}}}catch{}
  }},1000);
  window.addEventListener('jercle:logout',()=>{disconnect();notice('');});
  window.addEventListener('jercle:music',async()=>{
    renderAccount();renderBlend();renderPlayer();
    if(ss()?.access_token&&!music.profile){try{await fetchProfile();}catch(error){fail(error,'Could not restore Spotify connection');}}
    const code=cleanCode(new URLSearchParams(location.search).get('blend')||sessionStorage.getItem('jercle-pending-blend')||sessionStorage.getItem('jercle-active-blend'));
    if(code&&idOK(code)&&music.profile&&music.blendId!==code)await joinBlend(code);
  });
}
if(page){
  $('music-redirect-hint').textContent=redirectUri;
  bindUI();renderAccount();renderBlend();renderPlayer();
  void oauthReturn();
  if(ss()?.access_token&&!new URLSearchParams(location.search).has('code'))void fetchProfile().catch(error=>fail(error,'Could not restore Spotify account'));
  if(!$('app').hidden && location.hash==='#music') queueMicrotask(()=>window.dispatchEvent(new Event('jercle:music')));
}
