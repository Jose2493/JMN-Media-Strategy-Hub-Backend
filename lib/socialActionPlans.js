import { randomUUID } from 'node:crypto';
import { strategistDb, UUID, httpError, textField } from './strategistStore.js';

const recipes = {
 inquiries: [
  ['Answer the question before the first message', 'Create a short post answering one question a prospective customer asks before contacting you. End with a clear invitation to message you.', 'A useful answer can make the first conversation easier.', 'Record relevant inquiries manually for 7 days. Note which people mention this post.'],
  ['Make the next step easy to understand', 'Explain who your service is for, what happens after someone contacts you, and one way to get in touch.', 'A clear next step gives interested people a practical way to respond.', 'Record relevant inquiries for 7 days and the questions people still ask.'],
  ['Show how you solve one real problem', 'Share an approved example of your process, the problem it addresses, and an invitation to discuss a similar need.', 'A specific example helps people judge whether your service fits.', 'Track inquiries that mention this example for 7 days. Do not infer sales from likes.']
 ],
 bookings: [
  ['Show what the first visit feels like', 'Create a short walkthrough of the first visit or consultation. Explain who it is for and how to request a booking.', 'Knowing what to expect may reduce uncertainty before booking.', 'Record booking requests manually for 7 days; ask how each person found you.'],
  ['Answer one reason people hesitate', 'Address a genuine question about attending or booking. Include the actual booking process without invented availability or offers.', 'A direct answer gives someone a clearer basis for deciding.', 'Track booking requests and recurring questions for 7 days.'],
  ['Invite people to one specific experience', 'Describe an actual service or session, who it suits, and the next step to reserve it. Confirm all details before publishing.', 'A specific invitation is easier to act on than a general promotion.', 'Record requests and confirmed bookings separately for 7 days.']
 ],
 awareness: [
  ['Make your difference visible', 'Show one recognizable part of your work and explain why it matters to the people you want to reach.', 'A concrete example can make your brand easier to understand.', 'After 7 days, review available post counts and record audience questions. Account reach is not post reach.'],
  ['Introduce the people behind the work', 'Share an approved behind-the-scenes story centered on one useful detail about your team or process.', 'Specific human details give people something to remember.', 'Review available reactions after 7 days and note comments about the story.'],
  ['Teach one useful thing', 'Create a focused tip your audience can use, with a real example from your expertise.', 'A useful takeaway gives people a reason to pay attention.', 'Review available likes and comments after 7 days. Record saves only if you can verify them separately.']
 ],
 custom: [
  ['Turn your goal into one clear invitation', 'Prepare one focused post for your stated audience and goal. Confirm the offer, next step, and success measure with Strategist before publishing.', 'A small, defined experiment is easier to review than several changes at once.', 'Agree on one observable measure before publishing, then record the result after 7 days.'],
  ['Address one obstacle to your goal', 'Choose one question or hesitation relevant to your goal. Answer it with a concrete example and a clear next step.', 'Addressing a specific obstacle makes the experiment easier to interpret.', 'Define one measure with Strategist and record it after 7 days.'],
  ['Make the outcome tangible', 'Use a real, approved example to explain the value you offer. Invite one action that supports your confirmed goal.', 'A concrete example makes an abstract benefit easier to assess.', 'Record the agreed measure after 7 days; distinguish observed outcomes from assumptions.']
 ]
};
const fail = error => {
 if (!error) return;
 if(error.code==='40001') throw httpError(409,'This plan changed in another window. Reload it before continuing.');
 if(error.code==='P0002') throw httpError(404,'Account unavailable');
 throw httpError(503,'Your action plan is temporarily unavailable. Please retry.');
};
export function createPlanRepository(getDb=strategistDb) {
 return {
  async read(companyId,accountId) {
   const account=await getDb().from('social_accounts').select('id').eq('company_id',companyId).eq('id',accountId).eq('platform','instagram').maybeSingle();
   fail(account.error);if(!account.data)throw httpError(404,'Account unavailable');
   const result=await getDb().from('social_action_plans').select('version,state').eq('company_id',companyId).eq('account_id',accountId).maybeSingle();
   fail(result.error);return result.data || {version:0,state:null};
  },
  async save(companyId,accountId,contactId,version,state,conversationId=null,context=null) {
   const result=await getDb().rpc('save_social_action_plan',{p_company:companyId,p_account:accountId,p_contact:contactId,p_version:version,p_state:state,p_conversation:conversationId,p_context:context});
   fail(result.error);return result.data;
  }
 };
}
function propose(goal,sequence,now) {
 const r=recipes[goal.kind][sequence%recipes[goal.kind].length];
 return {id:randomUUID(),sequence,title:r[0],task:r[1],why:r[2],measure:r[3],status:'proposed',createdAt:now};
}
export function createPlanService({repository=createPlanRepository(),now=()=>new Date().toISOString()}={}) {
 return async ({session,accountId,body,snapshot,authorization})=>{
  if(typeof accountId!=='string'||!UUID.test(accountId))throw httpError(400,'Invalid account');
  const current=await repository.read(session.companyId,accountId);
  if(!body)return current;
  if(!Number.isSafeInteger(body.version)||body.version<0)throw httpError(400,'Invalid plan version');
  if(body.version!==current.version)throw httpError(409,'This plan changed in another window. Reload it before continuing.');
  const state=structuredClone(current.state || {history:[]});
  const at=now();let conversationId=null,context=null;
  const archive=reason=>{if(state.move)state.history.push({goal:state.goal,...state.move,archivedAt:at,archiveReason:reason});};
  if(body.command==='goal') {
   if(!Object.hasOwn(recipes,body.kind))throw httpError(400,'Choose a valid goal');
   const goal={kind:body.kind,objective:textField(body.objective,1000,true),audience:textField(body.audience||'',500),confirmedAt:at};
   archive('Goal changed');state.goal=goal;state.move=propose(goal,0,at);
  } else {
   if(!state.move)throw httpError(409,'Confirm a goal first.');
   const move=state.move;
   switch(body.command) {
    case 'alternative': {
     if(move.status!=='proposed')throw httpError(409,'Finish or review your current action before choosing another.');
     const reason=textField(body.reason,500,true);archive(reason);state.move=propose(state.goal,move.sequence+1,at);state.move.adjustment=reason;break;
    }
    case 'prepare':
     if(!['proposed','in_progress'].includes(move.status))throw httpError(409,'This action is already published.');
     if(move.conversationId)return current;
     conversationId=randomUUID();move.conversationId=conversationId;move.status='in_progress';move.startedAt=at;
     context={kind:'social_action',accountId,goal:state.goal,action:{title:move.title,task:move.task,why:move.why,measure:move.measure,adjustment:move.adjustment||null},capturedAt:at};break;
    case 'published':
     if(move.status!=='in_progress')throw httpError(409,'Prepare this action first.');
     if(typeof body.mediaId!=='string'||!/^\d{1,40}$/.test(body.mediaId))throw httpError(400,'Select a post from this account.');
     move.post=await snapshot(authorization,accountId,body.mediaId);move.status='published';move.linkedAt=at;break;
    case 'review':
     if(move.status!=='published')throw httpError(409,'Link your published post first.');
     move.review={note:textField(body.note,2000,true),recordedAt:at,source:'client-reported'};move.status='reviewed';break;
    case 'next':
     if(move.status!=='reviewed')throw httpError(409,'Record what you learned before starting another action.');
     archive('Reviewed');state.move=propose(state.goal,move.sequence+1,at);break;
    default:throw httpError(400,'Invalid plan command');
   }
  }
  return repository.save(session.companyId,accountId,session.contactId,current.version,state,conversationId,context);
 };
}
export const socialActionPlans=createPlanService();
