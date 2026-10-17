import {verifySocialSessionAuthorizationHeader} from './socialSession.js';
import {createDesignService, DESIGN_ASSET_KEYS} from './designTemplates.js';
import {DESIGN_TEMPLATE_SLUG,editorCss,editorMarkup,mountDesignStudio} from './designStudioEditor.js';
const unavailable={error:'Design Studio is not available for this workspace'};
export function createDesignHandler(kind,{verify=verifySocialSessionAuthorizationHeader,service=createDesignService()}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    const method=kind==='export'?'POST':'GET';
    if(req.method!==method){res.setHeader('Allow',method);return res.status(405).json(unavailable);}
    let session;try{session=verify(req.headers.authorization||'');}catch{return res.status(401).json(unavailable);}
    const query=req.query||{},body=req.body||{};
    const allowedQuery=kind==='asset'?['slug','asset']:kind==='template'?['slug']:[];
    if(Object.keys(query).some(key=>!allowedQuery.includes(key))||(kind==='export'&&(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['slug','mode','png'].includes(key)))))return res.status(400).json(unavailable);
    const slug=(kind==='export'?body.slug:query.slug)??DESIGN_TEMPLATE_SLUG;
    if(typeof slug!=='string'||slug.length>100)return res.status(404).json(unavailable);
    try{
      const template=await service.authorize(session,slug);
      if(!template)return res.status(404).json(unavailable);
      if(kind==='template'){
        const assets=Object.fromEntries(DESIGN_ASSET_KEYS.map(key=>[key,`/api/design-asset?slug=${encodeURIComponent(template.slug)}&asset=${key}`]));
        return res.status(200).json({template:{id:template.id,name:template.name,slug:template.slug,assets,editor:{css:editorCss,html:editorMarkup,script:mountDesignStudio.toString()}}});
      }
      if(kind==='asset'){
        if(typeof query.asset!=='string'||!DESIGN_ASSET_KEYS.includes(query.asset))return res.status(404).json(unavailable);
        const asset=await service.asset(template,query.asset);
        res.setHeader('Content-Type',asset.type);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
        return res.status(200).send(asset.bytes);
      }
      // Every export rechecks the contact, active template and exact grant.
      if(!['artwork','mockup'].includes(body.mode)||typeof body.png!=='string'||body.png.length>4*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.png))return res.status(400).json(unavailable);
      const bytes=Buffer.from(body.png.slice('data:image/png;base64,'.length),'base64');
      if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return res.status(400).json(unavailable);
      res.setHeader('Content-Type','image/png');
      res.setHeader('Content-Disposition',`attachment; filename="${DESIGN_TEMPLATE_SLUG}-${body.mode==='artwork'?'artwork-12in-300dpi':'mockup'}.png"`);
      return res.status(200).send(bytes);
    }catch{return res.status(503).json(unavailable);}
  };
}
