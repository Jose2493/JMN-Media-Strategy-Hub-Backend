import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {publishingPreviewPage} from '../../lib/publishingPreviewPage.js';
import {editorCss,editorMarkup} from '../../lib/designStudioEditor.js';

// Isolated fictional renderer. Never loads real auth, chat or integration clients.
const views=['home','strategy','social','design','onboarding'];
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Referrer-Policy','no-referrer');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_TARGET_ENV==='production')return res.status(404).send('Not found');
 if(req.method!=='GET'||req.headers.authorization||Object.keys(req.query||{}).some(k=>k!=='view')||(req.query?.view&&!views.includes(req.query.view)))return res.status(400).send('Invalid fictional fixture request');
 const nonce=randomBytes(24).toString('base64'),view=req.query?.view;
 res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src data: blob:; media-src blob:; frame-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const css='<link rel="stylesheet" href="/portal-language.css">';
 const surface='<script type="module" src="/portal-surface.js"></script>';
 if(view==='social')return res.status(200).send(publishingPreviewPage(nonce).replace('</head>',css+'<link rel="stylesheet" href="/portal-social.css"></head>').replace('<body>','<body data-jmn-workspace="social">').replace('<main class="shell dashboard-shell">','<main class="shell dashboard-shell" data-jmn-surface>').replace('</body>',surface+'</body>'));
 if(view==='strategy'){
  const html=readFileSync(new URL('../../public/strategist.html',import.meta.url),'utf8');
  return res.status(200).send(html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace('src="/strategist.js"','src="/portal-cohesion-qa.js"').replace('id="gate" role="status"','id="gate" role="status" hidden').replace('data-jmn-surface hidden','data-jmn-surface'));
 }
 const content=view==='home'?'<main id="cockpit" class="cockpit" data-jmn-surface></main>':view==='onboarding'?'<aside class="fp-qa"><label>Scenario <select id="scenario"><option>Semper / Company</option><option>Riany / Project</option><option>Unauthorized</option><option>Missing context</option><option>Save error</option></select></label></aside><main id="cockpit" class="cockpit" data-jmn-surface></main>':view==='design'?'<label class="cohesion-tools">Fictional access <select id="design-scenario"><option>Authorized</option><option>Unauthorized</option></select></label><div id="studio-status" role="status" hidden></div><div id="studio" data-jmn-surface></div>':`<div class="cohesion-tools"><strong>Fictional portal QA · no authentication or external requests</strong><label>Workspace <select id="qa-workspace">${views.map(v=>'<option>'+v+'</option>').join('')}</select></label><label>Width <select id="qa-width"><option value="100%">Available width</option><option value="390px">390px</option><option value="320px">320px</option></select></label></div><div class="cohesion-shell"><aside>JMN Media Partner<br><small>Fictional portal shell</small></aside><section id="qa-canvas">${views.map(v=>`<div class="cbe-block-iframe-wrapper" ${v==='home'?'':'hidden'}><iframe data-qa-view="${v}" data-jmn-workspace="${['home','onboarding'].includes(v)?'cockpit':v}" title="${v} fictional workspace" src="/api/qa/portal-cohesion?view=${v}" scrolling="no"></iframe></div>`).join('')}</section></div>`;
 const designStyle=view==='design'?`<style>${editorCss}</style><link rel="stylesheet" href="/design-studio.css">`:'';
 const fixture=view==='design'?`<template id="qa-design-markup">${editorMarkup.replace('value="TORRES"','value="ALEX"').replace('Cargando países...','Prepared flag')}</template>`:'';
 return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JMN Portal Cohesion · Fictional QA</title>${css}<link rel="stylesheet" href="/client-cockpit.css"><link rel="stylesheet" href="/founding-partner.css"><link rel="stylesheet" href="/portal-cohesion-qa.css">${designStyle}<script type="module" src="/${view==='onboarding'?'founding-partner-qa':'portal-cohesion-qa'}.js"></script>${view?'':'<link rel="stylesheet" href="/portal-embed.css"><script src="/portal-embed.js" defer></script>'}</head><body ${view?`data-jmn-workspace="${view==='home'||view==='onboarding'?'cockpit':view}"`:''}>${content}${fixture}${view?surface:''}</body></html>`);
}
