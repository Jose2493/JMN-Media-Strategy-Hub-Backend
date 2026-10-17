import {strategistDb, UUID} from './strategistStore.js';
import {DESIGN_TEMPLATE_SLUG} from './designStudioEditor.js';
export const DESIGN_ASSET_KEYS=Object.freeze(['shirtMockup','semperMark','semperCrossfitUsa','neckLabel']);
const safePath=value=>typeof value==='string'&&value.length<=300&&/^[a-zA-Z0-9_./-]+$/.test(value)&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
export function createDesignService(getDb=strategistDb) {
  return {
    async authorize(session,slug=DESIGN_TEMPLATE_SLUG) {
      if(!session||!UUID.test(session.companyId)||!UUID.test(session.contactId)||slug!==DESIGN_TEMPLATE_SLUG)return null;
      const db=getDb();
      // A signed session must still belong to this existing contact/company.
      const contact=await db.from('contacts').select('id').eq('id',session.contactId).eq('company_id',session.companyId).maybeSingle();
      if(contact.error||!contact.data)return null;
      const template=await db.from('design_templates').select('id').eq('slug',slug).eq('is_active',true).maybeSingle();
      if(template.error||!template.data)return null;
      const grant=await db.from('design_template_access').select('id').eq('company_id',session.companyId).eq('design_template_id',template.data.id).maybeSingle();
      if(grant.error||!grant.data)return null;
      const full=await db.from('design_templates').select('id,name,slug,template_config').eq('id',template.data.id).eq('is_active',true).maybeSingle();
      return full.error||!full.data?null:full.data;
    },
    async asset(template,key) {
      if(!DESIGN_ASSET_KEYS.includes(key))throw Error('Unavailable');
      const {assetPath,assets}=template.template_config||{};
      if(!safePath(assetPath)||!safePath(assets?.[key]))throw Error('Unavailable');
      const db=getDb(),bucket=await db.storage.getBucket('design-assets');
      if(bucket.error||bucket.data?.public!==false)throw Error('Unavailable');
      const result=await db.storage.from('design-assets').download(`${assetPath}/${assets[key]}`);
      if(result.error||!result.data||!['image/png','image/jpeg','image/webp'].includes(result.data.type))throw Error('Unavailable');
      return {bytes:Buffer.from(await result.data.arrayBuffer()),type:result.data.type};
    }
  };
}
