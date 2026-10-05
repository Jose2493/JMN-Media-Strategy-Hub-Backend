import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepare,uploadPrepared} from '../scripts/prepare-client-content.mjs';
const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const ready=spawnSync('ffmpeg',['-version']).status===0&&await access(font).then(()=>true,()=>false);
test('real video and image proxies preserve master bytes and upload separately', {skip:!ready},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jmn-content-test-'));
 try{
  for(const ext of ['mp4','png']){
   const file=join(dir,'original.'+ext);
   const args=['-v','error','-y','-f','lavfi','-i','color=c=purple:s=960x1200:d=1:r=10',...(ext==='png'?['-frames:v','1']:['-c:v','libx264','-pix_fmt','yuv420p']),file];
   const r=spawnSync('ffmpeg',args);assert.equal(r.status,0,r.stderr?.toString());
   const original=await readFile(file);const result=await prepare({companyId:'11111111-1111-4111-8111-111111111111',companyName:'Fictional QA Studio',title:'Test',file});
   try{
    assert.deepEqual(await readFile(file),original);assert.equal(result.metadata.original_sha256,createHash('sha256').update(original).digest('hex'));
    const preview=result.files[1][1],probe=JSON.parse(spawnSync('ffprobe',['-v','error','-show_streams','-of','json',preview],{encoding:'utf8'}).stdout);
    assert.equal(probe.streams[0].width,720);assert.notDeepEqual(await readFile(preview),original);
    let registered=false;const objects=[];
    const db={storage:{from(bucket){assert.equal(bucket,'jmn-content');return {async upload(key,bytes,opts){objects.push({key,bytes,opts});return {};}};}},from(table){assert.equal(table,'social_approved_assets');return {async insert(row){registered=true;assert.equal(row.status,'IN_REVIEW');return {};}};}};
    await uploadPrepared(db,result);assert.equal(objects.length,4);assert.ok(registered);assert.deepEqual(objects[0].bytes,original);assert.equal(objects[0].opts.upsert,false);
   }finally{await rm(result.dir,{recursive:true,force:true});}
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
