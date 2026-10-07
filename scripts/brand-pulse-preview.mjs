// Local-only QA: fictional company, memory-backed state, no database/provider calls.
// Not a deployment entry point. State resets when this process exits.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createPulseService,fallbackPulse} from '../lib/brandPulse.js';
import {createBrandPulseHandler} from '../api/brand-pulse.js';

const rows=new Map(),companyId='11111111-1111-4111-8111-111111111111',contactId='22222222-2222-4222-8222-222222222222';
const repository={
  async read(company,date){return structuredClone(rows.get(company+date)||null);},
  async memory(){return null;},async recent(){return [];},
  async insert(company,date,payload){const key=company+date;if(!rows.has(key))rows.set(key,{pulse_date:date,payload,created_at:new Date().toISOString(),answer_id:null,answered_at:null});return this.read(company,date);},
  async answer(company,contact,date,answerId,at){const row=rows.get(company+date);if(row&&!row.answer_id)Object.assign(row,{answer_id:answerId,answered_at:at});return this.read(company,date);},
};
const token='e30.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fictional';
const handler=createBrandPulseHandler({verify:auth=>{if(auth!=='Bearer '+token)throw Error();return {companyId,contactId};},service:createPulseService({repository,generate:async()=>fallbackPulse()})});
const files=new Set(['client-home.js','brand-pulse.js','portal-embed.js','client-home.css','portal-shell.css']);
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/preview-init.js'){
    res.setHeader('Content-Type','text/javascript');return res.end("history.replaceState(null,'',location.pathname+'#token=FICTIONAL_LOCAL_QA');");
  }
  if(url.pathname==='/api/session-exchange'){
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({sessionToken:token,expiresInSeconds:3600}));
  }
  if(url.pathname==='/api/brand-pulse'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2048){res.statusCode=413;return res.end();}}
    let parsed;try{parsed=body?JSON.parse(body):undefined;}catch{res.statusCode=400;return res.end();}
    const adapter={setHeader:(...args)=>res.setHeader(...args),status(code){res.statusCode=code;return this;},json(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return this;}};
    return handler({method:req.method,headers:req.headers,body:parsed,query:Object.fromEntries(url.searchParams)},adapter);
  }
  if(url.pathname==='/'||url.pathname==='/client-home.html'){
    res.setHeader('Content-Type','text/html');let html=readFileSync(new URL('../public/client-home.html',import.meta.url),'utf8');
    html=html.replace('<head>','<head><script src="/preview-init.js"></script>');
    return res.end(html);
  }
  const name=url.pathname.slice(1);
  if(files.has(name)){res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');return res.end(readFileSync(new URL('../public/'+name,import.meta.url)));}
  res.statusCode=404;res.end('Local Brand Pulse QA only');
});
server.listen(4178,'127.0.0.1',()=>console.log('Fictional Brand Pulse QA at http://127.0.0.1:4178'));
