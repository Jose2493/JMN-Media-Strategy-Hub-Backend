import { strategistDb } from './strategistStore.js';
import { listInstagramAccountsForCompany } from './socialAccounts.js';

// Read-only aggregation: exact counts, never truncated asset/job lists or signed media URLs.
export function createCockpitService({getDb = strategistDb, accounts = listInstagramAccountsForCompany, now = Date.now} = {}) {
  return async session => {
    const db = getDb(), company = session.companyId;
    const count = async (table, status) => {
      const result = await db.from(table).select('id', {count:'exact', head:true}).eq('company_id', company).eq('status', status);
      if (result.error || !Number.isSafeInteger(result.count)) throw Error('Unavailable');
      return result.count;
    };
    const read = async query => { const result = await query; if (result.error) throw Error('Unavailable'); return result.data; };
    const tasks = {
      company: () => read(db.from('companies').select('business_name').eq('id', company).maybeSingle()),
      review: () => count('social_approved_assets', 'IN_REVIEW'),
      approved: () => count('social_approved_assets', 'APPROVED'),
      drafts: () => count('social_publish_jobs', 'draft'),
      scheduled: () => count('social_publish_jobs', 'scheduled'),
      published: () => count('social_publish_jobs', 'published'),
      instagram: async () => {
        const rows = await accounts(company);
        const healthy = row => row.status === 'active' && Date.parse(row.tokenExpiresAt) > now();
        return {connected: rows.filter(healthy).length, attention: rows.filter(row => !healthy(row)).length, total: rows.length};
      },
      design: async () => {
        // The existing editor supports this template only. Match its authorization contract.
        const template = await read(db.from('design_templates').select('id').eq('slug','semper-athlete-shirt-01').eq('is_active',true).maybeSingle());
        if (!template) return false;
        return Boolean(await read(db.from('design_template_access').select('id').eq('company_id',company).eq('design_template_id',template.id).maybeSingle()));
      }
    };
    const entries = await Promise.all(Object.entries(tasks).map(async ([key,run]) => {
      try { return [key, await run()]; } catch { return [key,null]; }
    }));
    return Object.fromEntries(entries);
  };
}
