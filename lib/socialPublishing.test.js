import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule,assertPublishAccess,ownedAccount,runPublishStep} from './socialPublishing.js';
import {createPublishingClient} from './instagramPublishing.js';
const now=Date.parse('2026-09-24T23:00:00Z');
const account={company_id:'a',external_account_id:'123',status:'active',scopes:['instagram_business_content_publish'],token_expires_at:'2026-12-01T00:00:00Z'};
const schedule={caption:'Test',timezone:'America/New_York',scheduledAt:'2026-09-25T13:00:00Z'};
test('schedule validates future, horizon, caption, timezone and UTC instant',()=>{
 assert.equal(validateSchedule(schedule,now).scheduled_at,'2026-09-25T13:00:00.000Z');
 for(const change of [{scheduledAt:'bad'},{scheduledAt:'2026-09-24T22:00:00Z'},{scheduledAt:'2027-01-01'},{timezone:'Mars/City'},{caption:'x'.repeat(2201)}])assert.throws(()=>validateSchedule({...schedule,...change},now));
 assert.equal(validateSchedule({...schedule,now:true},now).scheduled_at,new Date(now).toISOString());
});
test('publishing requires explicit scope and token valid through due time',()=>{
 assert.doesNotThrow(()=>assertPublishAccess(account,now));
 for(const change of [{scopes:[]},{status:'revoked'},{token_expires_at:new Date(now+1000).toISOString()}])assert.throws(()=>assertPublishAccess({...account,...change},now));
});
test('foreign account fails even when lookup returns a row',async()=>{
 await assert.rejects(ownedAccount({companyId:'b'},'11111111-1111-1111-1111-111111111111',async()=>account),e=>e.status===404);
});
function fixture(overrides={}){
 const job={id:'j',company_id:'a',account_id:'account',status:'processing',lease:'lease',attempts:1,kind:'IMAGE',caption:'text',...overrides};
 const events=[];const repository={claim:async()=>job,save:async(j,p)=>{events.push(p);Object.assign(j,p);},mediaUrl:async()=>'https://storage.example/signed'};
 const client={create:async()=>{events.push('create');return '555';},status:async()=>'FINISHED',publish:async()=>{events.push('publish');return '999';}};
 return {job,events,repository,client,getAccount:async()=>account,decrypt:()=> 'secret',now:()=>now};
}
test('container persists before publication and runs in a separate worker tick',async()=>{
 const f=fixture();await runPublishStep(f);assert.equal(f.job.container_id,'555');assert.equal(f.job.status,'processing');assert.ok(!f.events.includes('publish'));assert.equal(f.job.lease,null);
});
test('publishing intent commits before sending to Instagram',async()=>{
 const f=fixture({container_id:'555'});await runPublishStep(f);assert.equal(f.events[0].status,'publishing');assert.equal(f.events[1],'publish');assert.equal(f.job.status,'published');assert.equal(f.job.media_id,'999');
});
test('ambiguous publish is not retried and requires manual confirmation',async()=>{
 const f=fixture({container_id:'555'});let calls=0;f.client.publish=async()=>{calls++;throw new Error('timeout');};await runPublishStep(f);assert.equal(calls,1);assert.equal(f.job.status,'uncertain');
});
test('lease lost before publishing prevents any external send',async()=>{
 const f=fixture({container_id:'555'});f.repository.save=async()=>{throw new Error('LEASE_LOST');};await runPublishStep(f);assert.ok(!f.events.includes('publish'));
});
test('database failure after provider success preserves publishing intent',async()=>{
 const f=fixture({container_id:'555'});const save=f.repository.save;f.repository.save=async(j,p)=>{if(p.status==='published')throw new Error('DB_DOWN');return save(j,p);};await runPublishStep(f);assert.equal(f.job.status,'publishing');
});
test('in-progress processing yields without publishing; timeout stops',async()=>{
 const f=fixture({container_id:'555'});f.client.status=async()=>'IN_PROGRESS';await runPublishStep(f);assert.equal(f.job.status,'processing');assert.ok(!f.events.includes('publish'));
 const late=fixture({attempts:21});await runPublishStep(late);assert.equal(late.job.status,'failed');
});
test('revoked scope or foreign account never reaches provider',async()=>{
 for(const change of [{scopes:[]},{company_id:'b'}]){const f=fixture();f.getAccount=async()=>({...account,...change});await runPublishStep(f);assert.equal(f.job.status,'failed');assert.ok(!f.events.includes('create'));}
});
test('provider requests keep token out of URL and sanitize failures',async()=>{
 const calls=[];const client=createPublishingClient(async(url,opts)=>{calls.push({url:String(url),opts});return {ok:true,json:async()=>({id:'123'})};});
 await client.create('123','SECRET',{kind:'REELS',caption:'hello'},'https://example.com/video.mp4');
 assert.ok(!calls[0].url.includes('SECRET'));assert.equal(calls[0].opts.body.get('media_type'),'REELS');
 const bad=createPublishingClient(async()=>({ok:false,status:400,json:async()=>({token:'SECRET'})}));
 await assert.rejects(bad.publish('123','SECRET','555'),e=>!e.message.includes('SECRET'));
});
