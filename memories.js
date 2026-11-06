// Jercle Memories v1 — Firebase authenticated, photos are retrieved privately from Google Drive.
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
let client=null,active=false,loading=false;
const $=id=>document.getElementById(id);
const status=(message,error=false)=>{const e=$('memory-status');e.textContent=message;e.classList.toggle('error',error);};
function readableDate(iso,options){return new Intl.DateTimeFormat('en-AE',{timeZone:'Asia/Dubai',...options}).format(new Date(iso));}
function imageCard(item){
  const card=document.createElement('figure');card.className='memory-card';
  const img=document.createElement('img');img.alt='Jercle memory uploaded on '+readableDate(item.createdTime,{day:'numeric',month:'long',year:'numeric'});img.loading='lazy';img.setAttribute('data-loading','');
  const cap=document.createElement('figcaption');
  const date=document.createElement('span');date.className='memory-date';date.textContent=readableDate(item.createdTime,{day:'numeric',month:'long',year:'numeric'});
  const time=document.createElement('time');time.className='memory-time';time.dateTime=item.createdTime;time.textContent='Uploaded at '+readableDate(item.createdTime,{hour:'numeric',minute:'2-digit',hour12:true})+' · Dubai time';
  cap.append(date,time);card.append(img,cap);
  const load=async()=>{
    if(!active||!client)return;
    try{const res=await client.image({id:item.id});if(!active)return;img.src='data:image/jpeg;base64,'+res.data.base64;img.removeAttribute('data-loading');}
    catch(err){console.error('Could not retrieve memory photo',err);img.alt='Could not load this photo';img.removeAttribute('data-loading');}
  };
  // Only fetch images as their cards become visible; do not publish public Drive URLs.
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load();}},{rootMargin:'200px'});
    observer.observe(img); // Disconnect if the card is removed before loading.
  }else void load();
  return card;
}
export function setupMemories(firebaseApp){
  if(client)return;
  const functions=getFunctions(firebaseApp,'asia-southeast1');
  client={upload:httpsCallable(functions,'uploadMemory',{timeout:120000}),list:httpsCallable(functions,'listMemories'),image:httpsCallable(functions,'getMemoryImage')};
  $('memory-upload-button').addEventListener('click',()=>{if(active&&!loading)$('memory-upload-input').click();});
  $('memory-upload-input').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file||!active||loading)return;
    if(!file.type.startsWith('image/')){status('Please choose a picture.',true);return;}
    if(file.size>3*1024*1024){status('Choose an image smaller than 3 MB for this test.',true);return;}
    loading=true;$('memory-upload-button').disabled=true;status('Preparing and uploading your picture…');
    try{
      const base64=await compressPhoto(file);
      await client.upload({base64});
      status('Picture uploaded to Google Drive successfully.');
      await loadMemories();
    }catch(err){console.error('Memory upload failed',err);status(err?.code==='functions/not-found'?'Google Drive backend is not deployed yet. See MEMORIES-SETUP.md.':'Upload failed. '+(err?.message||'Check Google Drive setup and try again.'),true);}
    finally{loading=false;$('memory-upload-button').disabled=false;}
  });
}
export function stopMemories(){active=false;const feed=$('memories-feed');if(feed)feed.replaceChildren();status('Sign in to view memories.');}
export async function loadMemories(){
  if(!client)return;
  active=true;status('Loading photos from Google Drive…');
  try{
    const res=await client.list({});
    if(!active)return;
    const items=Array.isArray(res.data?.items)?res.data.items:[];
    const feed=$('memories-feed');feed.replaceChildren();
    if(!items.length){const empty=document.createElement('p');empty.className='memories-empty';empty.textContent='No memories uploaded yet. Start with a test photo.';feed.append(empty);}
    else items.forEach(item=>{if(typeof item.id==='string'&&typeof item.createdTime==='string')feed.append(imageCard(item));});
    status(items.length?items.length+' '+(items.length===1?'memory':'memories')+' · newest first':'Ready for your first memory.');
  }catch(err){console.error('Unable to list memories',err);status(err?.code==='functions/not-found'?'Google Drive connection not configured yet. See MEMORIES-SETUP.md.':'Cannot connect to Google Drive yet. Complete backend setup to enable uploads.',true);}
}
async function compressPhoto(file){
  const objectURL=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=objectURL;await img.decode();
    const scale=Math.min(1,1440/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const context=canvas.getContext('2d');context.drawImage(img,0,0,canvas.width,canvas.height);
    const encoded=canvas.toDataURL('image/jpeg',.78).split(',')[1];
    if(encoded.length>2*1024*1024)throw new Error('This image is still too large after compression. Please choose a smaller one.');
    return encoded;
  }finally{URL.revokeObjectURL(objectURL);}
}
