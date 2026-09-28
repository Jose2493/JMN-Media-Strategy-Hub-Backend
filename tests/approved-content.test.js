import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedContent} from '../lib/approvedContent.js';
import {createHandler} from '../api/social/approved-content.js';
const companyId='11111111-1111-4111-8111-111111111111',accountId='22222222-2222-4222-8222-222222222222',assetId='33333333-3333-4333-8333-333333333333',jobId='44444444-4444-4444-8444-444444444444';
const session={companyId,contactId:'55555555-5555-4555-8555-555555555555'};
function fixture(overrides={},options={}){
 const row={id:assetId,company_id:companyId,title:'Approved photo',kind:'IMAGE',original_filename:'original.jpg',original_ext:'jpg',master_path:companyId+'/'+assetId+'/master.jpg',review_path:companyId+'/'+assetId+'/review.jpg',poster_path:companyId+'/'+assetId+'/poster.jpg',publishing_path:companyId+'/'+assetId+'/social.jpg',caption:'Approved caption',status:'APPROVED',approved_at:'2026-09-20T12:00:00Z',...overrides};
 const events=[],storage={
  async createSignedUrl(path,ttl,opts){events.push(['sign',path,ttl,opts]);return {data:{signedUrl:'https://private.example/signed'}};},
  async list(){return {data:[{name:row.publishing_path.split('/').at(-1),metadata:{mimetype:options.mime||'image/jpeg',size:options.size??1024}}]};},
  async copy(from,to){events.push(['copy',from,to]);return {data:{}};},
  async remove(paths){events.push(['remove',paths]);return {};}
 };
 const db={storage:{from(bucket){assert.ok(['social-publishing','jmn-content'].includes(bucket));return storage;}},from(table){
  let filters={},inserted,patch,single=false,count=false;
  const q={select(_fields,opts){count=opts?.head;return q;},eq(k,v){filters[k]=v;return q;},gte(){return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},update(value){patch=value;return q;},insert(value){inserted=value;events.push(['insert',value]);return q;},
   then(resolve,reject){
    let result;
    if(table==='social_approved_assets'){const allowed=Object.entries(filters).every(([k,v])=>row[k]===v);if(allowed&&patch)Object.assign(row,patch);result={data:single?(allowed?{...row}:null):(allowed?[{...row}]:[])};}
    else if(count)result={count:options.count||0};
    else result=options.insertError?{error:{}}:{data:{...inserted,status:'draft'}};
    return Promise.resolve(result).then(resolve,reject);
   }
  };return q;
 }};
 const service=createApprovedContent({getDb:()=>db,newId:()=>jobId,getAccount:async(s,id)=>{assert.equal(s.companyId,companyId);if(id!==accountId)throw Object.assign(new Error('Account unavailable'),{status:404});return {};}});
 return {service,events};
}
test('approved list returns safe fields and short-lived private previews',async()=>{
 const {service,events}=fixture(),data=await service.list(session,accountId);
 assert.equal(data.assets.length,1);assert.equal(data.assets[0].status,'APPROVED');
 assert.equal(data.assets[0].storage_path,undefined);assert.equal(data.assets[0].company_id,undefined);assert.equal(events[0][2],300);
});
test('foreign company and foreign accounts cannot preview or prepare',async()=>{
 const {service,events}=fixture({company_id:accountId});assert.equal((await service.list(session)).assets.length,0);
 for(const method of ['review','approve','download','preview','prepare'])await assert.rejects(service[method](session,accountId,assetId),{status:404});assert.equal(events.length,0);
 const own=fixture();await assert.rejects(own.service.prepare(session,assetId,assetId),{status:404});assert.equal(own.events.length,0);
});
test('arbitrary IDs and storage paths are rejected before signing or copying',async()=>{
 for(const master_path of ['https://external.example/file.jpg',accountId+'/approved/'+assetId+'.jpg',companyId+'/approved/../secret.jpg']){
  const {service,events}=fixture({master_path});await assert.rejects(service.prepare(session,accountId,assetId),{status:404});assert.equal(events.length,0);
 }
 await assert.rejects(fixture().service.preview(session,accountId,'https://example.com'),{status:400});
});
test('prepare copies to the existing company/account draft format without altering source',async()=>{
 const {service,events}=fixture();const {job}=await service.prepare(session,accountId,assetId);
 assert.equal(job.id,jobId);assert.equal(job.status,'draft');assert.equal(job.company_id,companyId);assert.equal(job.account_id,accountId);assert.equal(job.created_by,session.contactId);
 assert.equal(job.storage_path,companyId+'/'+accountId+'/'+jobId+'.jpg');assert.deepEqual(events.map(e=>e[0]),['copy','insert']);assert.notEqual(events[0][1],events[0][2]);
});
test('Reels retain MP4 and REELS through the existing draft handoff',async()=>{
 const {service}=fixture({kind:'REELS',original_ext:'mov',master_path:companyId+'/'+assetId+'/master.mov',review_path:companyId+'/'+assetId+'/review.mp4',publishing_path:companyId+'/'+assetId+'/social.mp4'},{mime:'video/mp4'});
 const {job}=await service.prepare(session,accountId,assetId);assert.equal(job.kind,'REELS');assert.match(job.storage_path,/\.mp4$/);
});
test('media validation and daily limit reject before copy; failed insert cleans copy only',async()=>{
 for(const options of [{mime:'text/html'},{size:0},{size:9*1024*1024},{count:100}]){
  const {service,events}=fixture({},options);await assert.rejects(service.prepare(session,accountId,assetId));assert.equal(events.length,0);
 }
 const {service,events}=fixture({},{insertError:true});await assert.rejects(service.prepare(session,accountId,assetId));
 assert.equal(events.at(-1)[0],'remove');assert.deepEqual(events.at(-1)[1],[companyId+'/'+accountId+'/'+jobId+'.jpg']);
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('approved endpoint uses production session verification and fails closed without auth',async()=>{
 let calls=0;const handler=createHandler({service:{list(){calls++;}}});
 for(const authorization of ['', 'Bearer fake', 'Basic fake']){
  const res=response();await handler({method:'GET',headers:{authorization},query:{account:accountId}},res);assert.equal(res.code,401);assert.equal(res.headers['Cache-Control'],'no-store');
 }assert.equal(calls,0);
});
test('approved endpoint rejects client URLs, company overrides and extra job fields',async()=>{
 let calls=0;const handler=createHandler({verify:()=>session,service:{prepare(){calls++;}}});
 for(const extra of [{url:'https://example.com'},{companyId:accountId},{storage_path:'x'},{id:jobId}]){
  const res=response();await handler({method:'POST',headers:{},body:{command:'prepare',assetId,accountId,...extra}},res);assert.equal(res.code,400);
 }assert.equal(calls,0);
});

test('In Review only signs proxy/poster, and blocks originals and publishing',async()=>{
 const {service,events}=fixture({status:'IN_REVIEW',approved_at:null});
 await service.list(session);await service.review(session,null,assetId);
 assert.ok(events.every(e=>e[1].endsWith('/review.jpg')||e[1].endsWith('/poster.jpg')));
 for(const method of ['download','preview','prepare'])await assert.rejects(service[method](session,accountId,assetId),{status:409});
 assert.equal(events.some(e=>e[0]==='copy'),false);
});
test('approval records authenticated contact and timestamp then enables original download',async()=>{
 const {service,events}=fixture({status:'IN_REVIEW',approved_at:null});
 const first=await service.approve(session,null,assetId);assert.equal(first.asset.status,'APPROVED');assert.ok(first.asset.approvedAt);
 const second=await service.approve(session,null,assetId);assert.equal(first.asset.approvedAt,second.asset.approvedAt);
 await service.download(session,null,assetId);
 assert.deepEqual(events.at(-1),['sign',companyId+'/'+assetId+'/master.jpg',60,{download:'original.jpg'}]);
});
