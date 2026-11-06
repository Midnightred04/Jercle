// Secure server-side bridge between Firebase Authentication and the group's Google Drive.
// Never put OAuth tokens, refresh tokens, or Drive credentials into the GitHub Pages frontend.
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret,defineString}=require('firebase-functions/params');
const {google}=require('googleapis');
const {Readable}=require('node:stream');
const {randomUUID}=require('node:crypto');

const credentials=defineSecret('JERCLE_DRIVE_OAUTH_JSON');
const folderId=defineString('DRIVE_FOLDER_ID');
const ALLOWED_UID='inlVdly6IueupNJs2bOQnodL24N2';
const MAX_BYTES=1500000;
const options={region:'asia-southeast1',secrets:[credentials],memory:'512MiB',maxInstances:4};

function requireMember(request){
  if(!request.auth||request.auth.uid!==ALLOWED_UID)throw new HttpsError('permission-denied','Jercle login is required.');
}
function getDrive(){
  let config;
  try{config=JSON.parse(credentials.value());}catch(e){throw new HttpsError('failed-precondition','Drive OAuth credentials have not been configured.');}
  if(!config.client_id||!config.client_secret||!config.refresh_token)throw new HttpsError('failed-precondition','Missing OAuth credential fields.');
  const oauth=new google.auth.OAuth2(config.client_id,config.client_secret);
  oauth.setCredentials({refresh_token:config.refresh_token});
  return google.drive({version:'v3',auth:oauth});
}
function getFolder(){
  const id=folderId.value();
  if(!id||!/^[a-zA-Z0-9_-]{10,}$/.test(id))throw new HttpsError('failed-precondition','Set DRIVE_FOLDER_ID before deploying.');
  return id;
}
function asDriveError(error){
  console.error('Jercle Drive API error',error?.response?.status||error?.code||'unknown',error?.message);
  throw new HttpsError('unavailable','Google Drive request failed. Check OAuth credentials, Drive API access, and folder permissions.');
}
exports.uploadMemory=onCall({...options,timeoutSeconds:90},async request=>{
  requireMember(request);
  const base64=request.data?.base64;
  if(typeof base64!=='string'||base64.length>2000000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new HttpsError('invalid-argument','Expected a small JPEG image.');
  const image=Buffer.from(base64,'base64');
  if(image.length<4||image.length>MAX_BYTES||image[0]!==0xff||image[1]!==0xd8||image[2]!==0xff)throw new HttpsError('invalid-argument','Only JPEG files up to 1.5 MB are accepted.');
  const drive=getDrive(),parent=getFolder();
  try{
    const uploaded=await drive.files.create({
      requestBody:{name:'jercle-memory-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.jpg',mimeType:'image/jpeg',parents:[parent]},
      media:{mimeType:'image/jpeg',body:Readable.from(image)},
      fields:'id,createdTime'
    });
    return {id:uploaded.data.id,createdTime:uploaded.data.createdTime};
  }catch(e){asDriveError(e);}
});
exports.listMemories=onCall(options,async request=>{
  requireMember(request);
  const drive=getDrive(),parent=getFolder();
  try{
    const response=await drive.files.list({
      q:"'"+parent+"' in parents and mimeType = 'image/jpeg' and trashed = false",
      orderBy:'createdTime desc',pageSize:24,fields:'files(id,createdTime),nextPageToken'
    });
    return {items:(response.data.files||[]).map(f=>({id:f.id,createdTime:f.createdTime}))};
  }catch(e){asDriveError(e);}
});
exports.getMemoryImage=onCall({...options,timeoutSeconds:60},async request=>{
  requireMember(request);
  const id=request.data?.id;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{10,100}$/.test(id))throw new HttpsError('invalid-argument','Invalid photo ID.');
  const drive=getDrive(),parent=getFolder();
  try{
    // Verify the requested ID belongs to the designated memories folder.
    const meta=await drive.files.get({fileId:id,fields:'id,mimeType,parents,size,trashed'});
    const f=meta.data;
    if(f.trashed||f.mimeType!=='image/jpeg'||!f.parents?.includes(parent)||Number(f.size)>MAX_BYTES)throw new HttpsError('permission-denied','Photo unavailable.');
    const media=await drive.files.get({fileId:id,alt:'media'},{responseType:'arraybuffer'});
    const bytes=Buffer.from(media.data);
    if(bytes.length>MAX_BYTES)throw new HttpsError('resource-exhausted','Photo too large.');
    return {base64:bytes.toString('base64')};
  }catch(e){if(e instanceof HttpsError)throw e;asDriveError(e);}
});
