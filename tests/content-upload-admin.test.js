import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startUploadServer,validateMetadata} from '../scripts/content-upload-server.mjs';
import qa from '../api/qa/content-upload.js';
const companyId='11111111-1111-4111-8111-111111111111';
test('staff uploader rejects client tokens, cross origins, unsafe metadata and unknown companies',async()=>{
 let processed=0;const db={from(){return {select(){return this},order(){return this},limit(){return Promise.resolve({data:[{id:companyId,business_name:'Test Studio'}]})},eq(k,id){this.id=id;return this},single(){return Promise.resolve({data:this.id===companyId?{id:companyId,business_name:'Test Studio'}:null})}}},storage:{getBucket:async()=>({data:{public:false,file_size_limit:5000000}})}};
 const app=await startUploadServer({db,processUpload:async(c)=>{processed++;assert.equal(c.companyId,companyId);assert.equal(c.companyName,'Test Studio');assert.equal((await readFile(c.file)).toString(),'source bytes');return {assetId:'new-asset'}}});
 try{
  assert.equal((await fetch(app.origin+'/companies')).status,401);
  assert.equal((await fetch(app.origin+'/companies',{headers:{Authorization:'Bearer normal.client.jwt'}})).status,401);
  const auth={Authorization:'Bearer '+app.token};
  assert.equal((await fetch(app.origin+'/companies',{headers:{...auth,Origin:'https://evil.example'}})).status,403);
  const meta={companyId,title:'New story',filename:'master.mp4'};
  const headers={...auth,Origin:app.origin,'Content-Type':'application/octet-stream','X-JMN-Metadata':encodeURIComponent(JSON.stringify(meta))};
  assert.equal((await fetch(app.origin+'/upload',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'source bytes'})).status,403);
  assert.equal((await fetch(app.origin+'/upload',{method:'POST',headers:{...headers,'X-JMN-Metadata':encodeURIComponent(JSON.stringify({...meta,companyId:'22222222-2222-4222-8222-222222222222'}))},body:'source bytes'})).status,400);
  const response=await fetch(app.origin+'/upload',{method:'POST',headers,body:'source bytes'});assert.equal(response.status,200);assert.equal((await response.json()).status,'IN_REVIEW');assert.equal(processed,1);
  for(const filename of ['../master.mp4','C:\\master.mp4','x.txt','x\n.mp4'])assert.throws(()=>validateMetadata({...meta,filename}));
  assert.throws(()=>validateMetadata({...meta,status:'APPROVED'}));assert.throws(()=>validateMetadata({...meta,master_path:'elsewhere'}));
 }finally{await new Promise(r=>app.server.close(r));}
});
test('admin demo stays Preview-only and has no real upload capability',()=>{
 const old=process.env.VERCEL_ENV;const target=process.env.VERCEL_TARGET_ENV;
 try{for(const env of ['production','preview']){process.env.VERCEL_ENV=env;delete process.env.VERCEL_TARGET_ENV;const res={headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},send(v){this.body=v;return this}};qa({method:'GET',headers:{},url:'/api/qa/content-upload'},res);assert.equal(res.code,env==='preview'?200:404);if(env==='preview'){assert.match(res.body,/const demo=true/);assert.match(res.body,/if\(demo\)\{status.textContent='Visual QA only/);assert.match(res.headers['Content-Security-Policy'],/connect-src 'none'/);}}}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;if(target===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=target;}
});
