import {workerData,parentPort} from 'node:worker_threads';
import {rm} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {prepare,uploadPrepared} from './prepare-client-content.mjs';
let prepared;
try{
 prepared=await prepare(workerData.config);
 const c=workerData.credentials,db=createClient(c.supabaseUrl,c.supabaseSecretKey,{auth:{persistSession:false,autoRefreshToken:false}});
 await uploadPrepared(db,prepared);
 console.log('Delivered asset '+prepared.metadata.id+' as IN_REVIEW');
 parentPort.postMessage({ok:true,assetId:prepared.metadata.id});
}catch{
 console.error('Delivery unconfirmed'+(prepared?' for asset '+prepared.metadata.id:' during preparation')+'. Check storage/registry before retrying.');
 parentPort.postMessage({ok:false,error:'Delivery could not be confirmed.'});
}finally{if(prepared)await rm(prepared.dir,{recursive:true,force:true});}
