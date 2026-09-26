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
