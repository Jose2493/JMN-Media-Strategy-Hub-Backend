import { createClient } from '@supabase/supabase-js';
let db;
export function strategistDb() {
  return db ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function httpError(status, message) { return Object.assign(new Error(message), { status }); }
export function textField(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw httpError(400, 'Invalid text field');
  return value.trim();
}
export function createStrategistStore(getDb = strategistDb) {
  const checked = async (query, operation = 'workspace') => {
    const { data, error } = await query;
    if (error) {
      // Provider messages can contain SQL/data; log only a bounded diagnostic code.
      const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(error.code) ? error.code : 'UNKNOWN';
      console.error('[strategist-db]', { operation, code });
      throw httpError(503, 'Campaign workspace is temporarily unavailable');
    }
    return data;
  };
  return {
    async campaign(companyId, id) {
      if ((typeof id !== 'string' || !UUID.test(id))) throw httpError(400, 'Invalid campaign');
      const data = await checked(getDb().from('strategist_campaigns').select('id,name,objective').eq('company_id', companyId).eq('id', id).maybeSingle());
      if (!data) throw httpError(404, 'Campaign unavailable'); return data;
    },
    async list(companyId) {
      const [campaigns, conversations] = await Promise.all([
        checked(getDb().from('strategist_campaigns').select('id,name,objective,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100), 'list_campaigns'),
        checked(getDb().from('conversations').select('id,created_at:started_at,last_message_at').eq('company_id',companyId).eq('channel','portal_ai_strategist').order('started_at',{ascending:false}).limit(200), 'list_conversations'),
      ]);
      const metadata = conversations.length ? await checked(getDb().from('strategist_threads').select('conversation_id,campaign_id,title').eq('company_id',companyId).in('conversation_id',conversations.map(c=>c.id))) : [];
      const byId = new Map(metadata.map(m => [m.conversation_id,m]));
      return {campaigns, threads: conversations.map(c => ({...c,campaignId:byId.get(c.id)?.campaign_id || null,title:byId.get(c.id)?.title || ('Earlier chat · ' + new Date(c.created_at).toISOString().slice(0,16).replace('T',' ') + ' UTC')})), limited:campaigns.length===100 || conversations.length===200};
    },
    async createCampaign(companyId,contactId,name,objective) {
      return checked(getDb().from('strategist_campaigns').insert({company_id:companyId,created_by:contactId,name,objective}).select('id,name,objective,created_at').single());
    },
    async metadata(companyId,conversationId) {
      const meta = await checked(getDb().from('strategist_threads').select('campaign_id,title,social_context').eq('company_id',companyId).eq('conversation_id',conversationId).maybeSingle());
      if (!meta) return null;
      return {...meta,campaign:meta.campaign_id ? await this.campaign(companyId,meta.campaign_id) : null};
    },
    async createThread(companyId,contactId,{campaignId,title,socialContext}) {
      if(campaignId) await this.campaign(companyId,campaignId);
      const conv = await checked(getDb().from('conversations').insert({company_id:companyId,contact_id:contactId,channel:'portal_ai_strategist'}).select('id').single());
      try {
        await checked(getDb().from('strategist_threads').insert({conversation_id:conv.id,company_id:companyId,campaign_id:campaignId || null,title,social_context:socialContext || null}));
      } catch(error) {
        // This newly-created, empty conversation is never exposed until metadata succeeds.
        await getDb().from('conversations').delete().eq('id',conv.id).eq('company_id',companyId);
        throw error;
      }
      return conv;
    },
    async history(companyId,id,before) {
      if((typeof id !== 'string' || !UUID.test(id))) throw httpError(400,'Invalid conversation');
      const conv=await checked(getDb().from('conversations').select('id').eq('company_id',companyId).eq('channel','portal_ai_strategist').eq('id',id).maybeSingle());
      if(!conv) throw httpError(404,'Conversation unavailable');
      let query=getDb().from('messages').select('id,role,content,created_at').eq('company_id',companyId).eq('conversation_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
      if(before) {
        // Compound cursor keeps messages sharing a timestamp reachable.
        if(typeof before !== 'string' || before.length>100) throw httpError(400,'Invalid cursor');
        const [time,msgId]=before.split('|');
        if(!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|\+00:00)$/.test(time) || !Number.isFinite(Date.parse(time)) || !UUID.test(msgId || '')) throw httpError(400,'Invalid cursor');
        query=query.or(`created_at.lt.${time},and(created_at.eq.${time},id.lt.${msgId})`);
      }
      const rows=await checked(query);const hasMore=rows.length>50;const selected=rows.slice(0,50);const last=selected.at(-1);
      return {messages:selected.reverse(),nextCursor:hasMore?`${last.created_at}|${last.id}`:null,metadata:await this.metadata(companyId,id)};
    },
  };
}
export const strategistStore=createStrategistStore();
