import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/social/publishing-worker.js';
test('cron rejects absent, incorrect and multibyte bearer values without running worker',async()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='secret';
 try{for(const authorization of ['', 'Bearer wrong!', 'Bearer éééééé']){
  const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
  await handler({method:'GET',headers:{authorization}},res);assert.equal(res.code,401);
 }}finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
