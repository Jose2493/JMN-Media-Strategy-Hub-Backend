// Loopback-only staff application. Never deploy this process as a public web service.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdtemp,open,rm,readFile} from 'node:fs/promises';
import {tmpdir,homedir,platform} from 'node:os';
import {join,basename,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {createClient} from '@supabase/supabase-js';
import {adminUploadPage} from '../lib/adminUploadPage.js';
import {UUID} from '../lib/strategistStore.js';
const LIMIT=500*1024*1024;
export function validateMetadata(value){
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['companyId','title','projectLabel','filename'].includes(k))||!UUID.test(value.companyId||'')||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||typeof value.filename!=='string'||value.filename.length>180||basename(value.filename)!==value.filename||/[\\/\x00-\x1f]/.test(value.filename)||!/^\.(jpg|jpeg|png|mp4|mov)$/i.test(extname(value.filename))||typeof(value.projectLabel??'')!=='string'||(value.projectLabel||'').length>160)throw Error('Invalid client, title or filename.');
 return {...value,title:value.title.trim()};
}
function processFile(config,credentials){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./content-upload-worker.mjs',import.meta.url),{workerData:{config,credentials}});worker.once('message',m=>m.ok?resolve(m):reject(Error(m.error)));worker.once('error',()=>reject(Error('Media preparation failed. Check FFmpeg and your source file.')));worker.once('exit',code=>{if(code)reject(Error('Media processing stopped. Check your workstation.'))});});}
export async function startUploadServer({db,credentials,processUpload=processFile,openBrowser=false}={}){
 const token=randomBytes(32).toString('hex'),expires=Date.now()+3600000;let origin, busy=false;
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const nonce=randomBytes(24).toString('base64');res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(!origin||req.headers.host!==new URL(origin).host||req.socket.remoteAddress!=='127.0.0.1')return send(403,{error:'Local workstation access only.'});
  if(req.url==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(adminUploadPage(nonce));}
  const candidate=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(Date.now()>expires||candidate.length!==expected.length||!timingSafeEqual(candidate,expected))return send(401,{error:'Open JMN Upload from its desktop launcher.'});
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Invalid origin.'});
  if(req.method==='GET'&&req.url==='/companies'){
   try{const {data,error}=await db.from('companies').select('id,business_name').order('business_name').limit(500);if(error)throw Error();return send(200,{companies:data});}catch{return send(503,{error:'Unable to load clients. Check staff configuration.'});}
  }
  if(req.method!=='POST'||req.url!=='/upload')return send(404,{error:'Not found.'});
  if(req.headers.origin!==origin)return send(403,{error:'Invalid origin.'});
  if(busy)return send(409,{error:'An upload is already running on this workstation.'});
  let meta;try{if((req.headers['x-jmn-metadata']||'').length>4096)throw Error();meta=validateMetadata(JSON.parse(decodeURIComponent(req.headers['x-jmn-metadata']||'')));}catch{return send(400,{error:'Invalid client, title or filename.'});}
  const length=Number(req.headers['content-length']);if(req.headers['content-type']!=='application/octet-stream'||!Number.isSafeInteger(length)||length<=0||length>LIMIT)return send(400,{error:'Choose a supported file up to 500 MiB.'});
  busy=true;let dir;
  try{
   // Staff authority comes from the trusted process credential, never a client JWT.
   const company=await db.from('companies').select('id,business_name').eq('id',meta.companyId).single();
   if(company.error||!company.data) return send(400,{error:'Client is unavailable.'});
   const bucket=await db.storage.getBucket('jmn-content');if(bucket.error||bucket.data?.public!==false)return send(503,{error:'Private content storage is not ready. Complete the migration first.'});
   if(bucket.data.file_size_limit&&length>Number(bucket.data.file_size_limit))return send(400,{error:'This file exceeds the configured storage limit.'});
   dir=await mkdtemp(join(tmpdir(),'jmn-upload-'));const file=join(dir,meta.filename),handle=await open(file,'wx',0o600);let size=0;
   try{for await(const chunk of req){size+=chunk.length;if(size>LIMIT||size>length)throw Error('Upload size mismatch.');await handle.writeFile(chunk);}}finally{await handle.close();}
   if(size!==length)throw Error('Upload interrupted.');
   const result=await processUpload({companyId:company.data.id,companyName:company.data.business_name,title:meta.title,projectLabel:meta.projectLabel||'',file,fontFile:credentials?.fontFile},credentials);
   return send(200,{assetId:result.assetId,status:'IN_REVIEW'});
  }catch{return send(503,{error:'Delivery could not be confirmed. Check the staff upload log before retrying; a registered asset may already exist.'});}
  finally{busy=false;if(dir)await rm(dir,{recursive:true,force:true});}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const url=origin+'/#'+token;
 if(openBrowser){const command=platform()==='win32'?'rundll32':platform()==='darwin'?'open':'xdg-open';const args=platform()==='win32'?['url.dll,FileProtocolHandler',url]:[url];spawn(command,args,{stdio:'ignore'}).on('error',()=>console.error('Could not open browser. Restart using the desktop launcher.'));}
 return {server,origin,token};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const path=join(homedir(),'.jmn-content-upload.json');
  const config=JSON.parse(await readFile(path,'utf8'));
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl||'')||typeof config.supabaseSecretKey!=='string'||!config.supabaseSecretKey)throw Error('Invalid staff configuration.');
  const db=createClient(config.supabaseUrl,config.supabaseSecretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  await startUploadServer({db,credentials:config,openBrowser:true});console.log('JMN Upload is open in your browser. Close this window when finished.');
 }catch{console.error('JMN Upload could not start. Complete the one-time workstation setup in docs/content-review-bridge.md.');process.exitCode=1;}
}
