// Fictional, read-only visual fixture. No portal/session/integration scripts loaded.
export function publishingPreviewPage(nonce) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JMN Publishing · Preview QA</title>
<link rel="stylesheet" href="/social-command-center.css">
<link rel="stylesheet" href="/social-action-plans.css">
<link rel="stylesheet" href="/social-publishing.css">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f2f2f5;background:#111214}.qa-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #34343a;font-size:12px;color:#c5c5cf}.qa-tools label{display:flex;align-items:center;gap:8px}.qa-tools select{font:inherit;color:inherit;background:#202126;border:1px solid #484851;border-radius:8px;padding:8px}.qa-tools p{margin:0}.qa-tools strong{color:#c4b2ff;font-weight:500}.shell{max-width:1200px}.header h1{margin:0}.header p{margin:8px 0}.platform h2{margin:0}.account-name{font-weight:600}.account-identity{display:flex;gap:12px;align-items:center}.account{display:flex;padding:16px 0}.qa-feedback{color:#efbf88;font-size:13px}.qa-feedback:empty{display:none}.btn{cursor:pointer}.btn:disabled{opacity:.45;cursor:not-allowed}
</style></head><body>
<aside class="qa-tools" aria-label="Preview QA controls"><strong>Preview QA · fictional data</strong>
<label>Scenario <select id="qa-scenario"><option value="populated">Sample posts</option><option value="empty">Empty account</option><option value="inactive">Publishing inactive</option><option value="scope">Publishing permission missing</option></select></label>
<p>No uploads, saves, connections or publishing. Files stay on this device.</p></aside>
<main class="shell dashboard-shell">
<header class="header"><div><h1>Social Command Center</h1><p>Manage your channels, content and performance.</p></div></header>
<section aria-label="Instagram account">
<div class="account"><div class="account-identity"><span class="account-avatar" aria-hidden="true">DS</span><div><div class="account-channel">Instagram</div><div class="account-name">@demo_studio<span class="account-status">Connected</span></div><div class="account-meta">Fictional creator account</div></div></div></div>
<p id="qa-feedback" class="qa-feedback" role="status"></p><div id="qa-publishing"></div></section></main>
<script nonce="${nonce}" src="/social-publishing.js"></script>
<script nonce="${nonce}">
(() => {
 'use strict';
 // Fragment tokens are neither parsed nor exchanged; remove them before mounting.
 if (location.hash) { history.replaceState(null, '', location.pathname); }
 const poster='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#202127"/><circle cx="810" cy="300" r="320" fill="#805ce6"/><path d="M0 850L1080 450V1080H0Z" fill="#383344"/><text x="80" y="630" fill="white" font-family="sans-serif" font-size="90">Make room</text><text x="80" y="735" fill="white" font-family="sans-serif" font-size="90">for good ideas.</text><text x="80" y="960" fill="#c8bddf" font-family="sans-serif" font-size="30">DEMO STUDIO · FICTIONAL QA ARTWORK</text></svg>');
 const fixtures=[
  {id:'qa-draft',status:'draft',kind:'IMAGE',caption:'A new perspective starts with a little space. What are you creating this week?'},
  {id:'qa-scheduled',status:'scheduled',kind:'IMAGE',caption:'A closer look at the details. Join us behind the scenes.',scheduled_at:'2027-01-15T18:00:00Z',timezone:'America/New_York'},
  {id:'qa-published',status:'published',kind:'IMAGE',caption:'Small ideas. Thoughtfully made.'},
  {id:'qa-processing',status:'processing',kind:'REELS',caption:'Our next chapter, in motion.'},
  {id:'qa-failed',status:'failed',kind:'IMAGE',caption:'An example that needs attention.',error_code:'PREPARATION_FAILED'},
  {id:'qa-uncertain',status:'uncertain',kind:'IMAGE',caption:'An example awaiting confirmation.',error_code:'CONFIRMATION_REQUIRED'}
 ];
 const root=document.getElementById('qa-publishing'),feedback=document.getElementById('qa-feedback');let view;
 function mount(){
  view?.close();root.replaceChildren();feedback.textContent='';
  const scenario=document.getElementById('qa-scenario').value;
  view=window.JmnPublishing.mount(root,{
   account:{username:'demo_studio',scopes:scenario==='scope'?[]:['instagram_business_content_publish']},
   request:async payload=>{
    if(!payload)return {jobs:scenario==='empty'?[]:fixtures.map(job=>({...job})),ready:scenario!=='inactive'};
    if(payload.command==='preview'&&fixtures.some(job=>job.id===payload.id))return {url:poster};
    throw new Error('Visual QA only — uploads, saving, scheduling and publishing are disabled.');
   },
   connect:()=>{feedback.textContent='Visual QA only — Instagram connection is disabled.';}
  });
 }
 document.getElementById('qa-scenario').addEventListener('change',mount);mount();
})();
</script></body></html>`;
}
