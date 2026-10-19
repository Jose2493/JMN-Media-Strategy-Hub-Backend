import {strategistDb, UUID, httpError} from './strategistStore.js';
import {createCockpitService} from './clientCockpit.js';
import {listInstagramAccountsForCompany} from './socialAccounts.js';

export function createFoundingService({getDb=strategistDb,cockpit=createCockpitService(),accounts=listInstagramAccountsForCompany,now=Date.now}={}) {
  const read=async query=>{const r=await query;if(r.error)throw httpError(503,'Onboarding is temporarily unavailable.');return r.data;};
  async function member(session) {
    if(!UUID.test(session?.companyId)||!UUID.test(session?.contactId))throw httpError(401,'Reopen Home from your portal.');
    const db=getDb();
    const contact=await read(db.from('contacts').select('id').eq('id',session.contactId).eq('company_id',session.companyId).maybeSingle());
    if(!contact)throw httpError(403,'Workspace unavailable.');
    const row=await read(db.from('founding_partner_workspaces').select('partner_key,workspace_kind,project_id,display_name,category,strategy_focus,media_available,completed_at').eq('contact_id',session.contactId).eq('company_id',session.companyId).eq('active',true).maybeSingle());
    if(!row)return null;
    if(row.workspace_kind==='project') {
      if(row.partner_key!=='riany'||!UUID.test(row.project_id))return null;
      const project=await read(db.from('projects').select('id').eq('id',row.project_id).eq('company_id',session.companyId).maybeSingle());
      if(!project)return null;
    } else if(row.workspace_kind!=='company'||row.partner_key!=='semper'||row.project_id)return null;
    return row;
  }
  return {
    async load(session) {
      const row=await member(session);if(!row)return {eligible:false};
      const [data,ig,company]=await Promise.all([cockpit(session),accounts(session.companyId).catch(()=>null),
        read(getDb().from('companies').select('business_name,industry').eq('id',session.companyId).maybeSingle())]);
      const connected=ig?.filter(a=>a.status==='active'&&Date.parse(a.tokenExpiresAt)>now());
      return {eligible:true,completed:Boolean(row.completed_at),workspace:{kind:row.workspace_kind,name:row.workspace_kind==='company'?(company?.business_name||row.display_name):row.display_name,category:row.workspace_kind==='company'?(company?.industry||row.category):row.category,focus:row.strategy_focus},
        instagram:ig===null?null:{connected:connected.length,handles:connected.map(a=>a.username).slice(0,3),attention:ig.length-connected.length},
        // Counts and social accounts are company scoped in the existing architecture.
        activityScope:'company',activity:{review:data.review,approved:data.approved,drafts:data.drafts,scheduled:data.scheduled,published:data.published},
        areas:{strategy:true,social:true,design:data.design===true,media:row.media_available===true},
        terms:{complimentaryMonths:2,monthlyUsdAfter:20,privateBeta:true}};
    },
    async save(session,body) {
      const row=await member(session);if(!row)throw httpError(403,'Workspace unavailable.');
      const db=getDb(),owner={contact_id:session.contactId,company_id:session.companyId};
      if(body.action==='complete') {
        // Replays do not reset the first completion timestamp or any commercial clock.
        if(!row.completed_at)await read(db.from('founding_partner_workspaces').update({completed_at:new Date(now()).toISOString()}).eq('contact_id',session.contactId).eq('company_id',session.companyId).eq('active',true).is('completed_at',null));
      } else {
        await read(db.from('founding_partner_feedback').upsert({...owner,rating:body.rating??null,kind:body.kind,note:body.note||'',updated_at:new Date(now()).toISOString()},{onConflict:'contact_id'}));
      }
      return {saved:true};
    }
  };
}
export function validateFoundingBody(body) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw httpError(400,'Invalid request.');
  const keys=body.action==='complete'?['action']:['action','rating','note','kind'];
  if(Object.keys(body).some(k=>!keys.includes(k)))throw httpError(400,'Unexpected fields.');
  if(body.action==='complete')return body;
  if(body.action!=='feedback'||!['feedback','issue'].includes(body.kind)||
    (body.rating!=null&&(!Number.isInteger(body.rating)||body.rating<1||body.rating>5))||
    (body.note!==undefined&&(typeof body.note!=='string'||body.note.length>500))||
    (body.rating==null&&!body.note?.trim()))throw httpError(400,'Choose a rating or add a short note.');
  return {...body,note:body.note?.trim()||''};
}
