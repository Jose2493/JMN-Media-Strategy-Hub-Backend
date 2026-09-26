import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/qa/social-publishing.js';
function request(env, {method='GET',url='/api/qa/social-publishing',headers={}}={}) {
 const old=process.env.VERCEL_ENV,oldTarget=process.env.VERCEL_TARGET_ENV;
 if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;
 delete process.env.VERCEL_TARGET_ENV;
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},send(body){this.body=body;return this;}};
 try{return handler({method,url,headers},res);}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;if(oldTarget===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=oldTarget;}
}
test('QA fails closed outside Preview regardless of request override',()=>{
 for(const env of [undefined,'production','development','Preview','']){const res=request(env,{url:'/api/qa/social-publishing?preview=true',headers:{'x-vercel-env':'preview'}});assert.equal(res.code,404);assert.equal(res.body,'Not found');assert.match(res.headers['Cache-Control'],/no-store/);}
});
test('QA rejects credentials, query strings and mutations',()=>{
 for(const opts of [{headers:{authorization:'Bearer fake'}},{url:'/api/qa/social-publishing?token=fake'},{method:'POST'},{method:'PUT'},{method:'DELETE'}])assert.equal(request('preview',opts).code,400);
});
test('Preview serves only fixtures with network and framing disabled',()=>{
 const res=request('preview');assert.equal(res.code,200);assert.match(res.body,/demo_studio/);assert.match(res.body,/social-publishing.js/);
 assert.doesNotMatch(res.body,/src="\/social-command-center.js|session-exchange|supabase|localStorage|sessionStorage|fetch\(/);
 const csp=res.headers['Content-Security-Policy'];assert.match(csp,/connect-src 'none'/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/form-action 'none'/);
 const nonce=csp.match(/nonce-([^']+)/)[1];assert.equal((res.body.match(new RegExp('nonce="'+nonce.replace(/[+]/g,'\\+')+'"','g'))||[]).length,2);
 assert.notEqual(request('preview').headers['Content-Security-Policy'],csp);
});

test('fixture adapter rejects every mutation without retaining changes',async()=>{
 const {default:vm}=await import('node:vm');
 const page=request('preview').body;
 const script=page.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
 let options,change;const root={replaceChildren(){}},feedback={textContent:''},scenario={value:'populated',addEventListener(_event,fn){change=fn;}};
 const context={location:{hash:''},document:{getElementById(id){return {'qa-publishing':root,'qa-feedback':feedback,'qa-scenario':scenario}[id];}},window:{JmnPublishing:{mount(_root,opts){options=opts;return {close(){}};}}}};
 vm.runInNewContext(script,context);
 const original=await options.request();assert.equal(original.jobs.length,6);
 for(const command of ['upload','save','schedule','cancel','anything'])await assert.rejects(options.request({command,id:'qa-draft'}),/Visual QA only/);
 assert.match((await options.request({command:'preview',id:'qa-draft'})).url,/^data:image\/svg\+xml/);
 original.jobs[0].caption='mutated';assert.notEqual((await options.request()).jobs[0].caption,'mutated');
 options.connect();assert.match(feedback.textContent,/disabled/);
 scenario.value='empty';change();assert.equal((await options.request()).jobs.length,0);
 scenario.value='inactive';change();assert.equal((await options.request()).ready,false);
 scenario.value='scope';change();assert.equal(options.account.scopes.length,0);
});
