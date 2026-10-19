import {strategistDb,UUID,httpError,textField} from './strategistStore.js';
import {createCockpitService} from './clientCockpit.js';
const action=(type,title,reason,label)=>({type,title,reason,label});
export function routeRecommendations(text,{design=false,onboarding=false}={}){
 const actions=[];
 if(/review|draft|schedul|publish|instagram|caption|revisar|borrador|publica/i.test(text))actions.push(action('social','Move your content forward','Review content, drafts and account health in Social Center.','Open Social Center'));
 if(/campaign|position|audience|offer|messag|plan|estrateg|campaña|audiencia/i.test(text))actions.push(action('strategy','Refine the plan','Continue planning before making changes.','Continue Strategy Session'));
 if(design&&/design|template|graphic|shirt|diseño|plantilla/i.test(text))actions.push(action('design','Work on your design','Open the templates authorized for your workspace.','Open Design Studio'));
 if(/production|shoot|filming|on.location|video|photograph|producci|rodaje/i.test(text))actions.push(action('production','Bring the idea into production','Prepare a request for JMN to review. No commitment or charge.','Request production'));
 if(onboarding)actions.push(action('onboarding','Finish your workspace welcome','Your active Founding Partner welcome is incomplete.','Continue onboarding'));
 return actions.slice(0,5);
}
export function validateProduction(body){
 const fields={goal:600,location:200,deliverables:600,timeline:200,budget:160};
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['requestKey','mode','conversationId',...Object.keys(fields)].includes(k)))throw httpError(400,'Unexpected request fields.');
 if(!UUID.test(body.requestKey||'')||!['on_location','remote'].includes(body.mode))throw httpError(400,'Invalid production request.');
 if(body.conversationId!=null&&!UUID.test(body.conversationId))throw httpError(400,'Invalid conversation.');
 return Object.fromEntries([['request_key',body.requestKey],['mode',body.mode],['conversation_id',body.conversationId||null],...Object.entries(fields).map(([key,max])=>[key,textField(body[key],max,true)])]);
}
export function createActionService({getDb=strategistDb,cockpit=createCockpitService()}={}){
 const read=async q=>{const r=await q;if(r.error)throw httpError(503,'Actions are temporarily unavailable.');return r.data;};
 async function member(s){if(!UUID.test(s?.companyId||'')||!UUID.test(s?.contactId||''))throw httpError(401,'Reopen Strategist from your portal.');if(!await read(getDb().from('contacts').select('id').eq('id',s.contactId).eq('company_id',s.companyId).maybeSingle()))throw httpError(403,'Workspace unavailable.');}
 async function conversation(s,id){if(!UUID.test(id||''))throw httpError(400,'Invalid conversation.');if(!await read(getDb().from('conversations').select('id').eq('id',id).eq('company_id',s.companyId).eq('channel','portal_ai_strategist').maybeSingle()))throw httpError(404,'Conversation unavailable.');}
 return {
  async load(s,id){
   await member(s);let text='';
   if(id){await conversation(s,id);const rows=await read(getDb().from('messages').select('content').eq('company_id',s.companyId).eq('conversation_id',id).eq('role','assistant').order('created_at',{ascending:false}).limit(1));text=(rows[0]?.content||'').slice(0,20000);}
   const state=await cockpit(s);let onboarding=false;
   try{const row=await read(getDb().from('founding_partner_workspaces').select('workspace_kind,partner_key,project_id,completed_at').eq('company_id',s.companyId).eq('contact_id',s.contactId).eq('active',true).maybeSingle());
    if(row&&!row.completed_at){if(row.workspace_kind==='company'&&row.partner_key==='semper'&&!row.project_id)onboarding=true;else if(row.workspace_kind==='project'&&row.partner_key==='riany'&&UUID.test(row.project_id||''))onboarding=!!await read(getDb().from('projects').select('id').eq('id',row.project_id).eq('company_id',s.companyId).maybeSingle());}
   }catch{/* Optional onboarding has no inferred enrollment. */}
   return {actions:routeRecommendations(text,{design:state.design===true,onboarding})};
  },
  async submit(s,body){
   const input=validateProduction(body);await member(s);if(input.conversation_id)await conversation(s,input.conversation_id);
   const db=getDb();
   // Ignore duplicate retries without overwriting a submitted request.
   await read(db.from('production_requests').upsert({...input,company_id:s.companyId,contact_id:s.contactId},{onConflict:'contact_id,request_key',ignoreDuplicates:true}));
   const saved=await read(db.from('production_requests').select('request_key,status').eq('contact_id',s.contactId).eq('company_id',s.companyId).eq('request_key',input.request_key).maybeSingle());
   if(!saved)throw httpError(503,'Unable to confirm receipt. Retry this request.');
   return {received:true,status:saved.status};
  }
 };
}
