// Part 3a: profile button (initial) -> Settings hub; every page shows its controls; back; name save; layout sweep; tab icons
import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={}; const bad=[];
await p.setViewportSize({width:390,height:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
R.profileBtn=await q(()=>{const b=document.querySelector('#profileToggle');const r=b.getBoundingClientRect();return {text:b.innerText.trim(),size:Math.round(r.width)+'x'+Math.round(r.height),label:b.getAttribute('aria-label')}});
if(!/^[A-Z?]$/.test(R.profileBtn.text)||R.profileBtn.size!=='44x44')bad.push('profile button '+JSON.stringify(R.profileBtn));
await q(()=>document.querySelector('#profileToggle').click());await W(800);
R.hub=await q(()=>({title:document.querySelector('#pageTitle')?.innerText,identity:document.querySelector('.settingsHubIdentity')?.innerText.replace(/\n/g,' | '),tiles:[...document.querySelectorAll('.settingsHubTile')].map(t=>t.innerText.replace(/\n/g,': ')),rows:[...document.querySelectorAll('.settingsHubRow')].map(r=>r.querySelector('strong').innerText),about:document.querySelector('.settingsHub .settingsAbout')?.innerText,logout:!!document.querySelector('#planlySettingsHubSignOut'),visibleCards:[...document.querySelectorAll('.settingsCard')].filter(c=>c.offsetParent).length}));
if(R.hub.rows.length!==7||R.hub.tiles.length!==2||!R.hub.logout||R.hub.visibleCards!==0)bad.push('hub '+JSON.stringify(R.hub));
const expect={appearance:['themeSetting','taskRowDensity'],planning:['defaultCat','defaultDuration','planningStart','planningEnd'],intelligence:['intelligenceSuggestions','intelligenceChoreBalance','intelligenceNightRest'],calendars:['autoCalendarTimed'],household:['planlyDisplayName'],account:[],data:['exportBtn','importBtn','clearBtn']};
const sweep=()=>q(()=>{const small=[],over=[];for(const el of document.querySelectorAll('#view button,#view input,#view select,#view a')){if(!el.offsetParent)continue;const r=el.getBoundingClientRect();if(el.type==='checkbox'||el.type==='radio')continue;if(r.height<44||r.width<44)small.push((el.id||el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' '+(el.innerText||'').slice(0,20))}const v=document.querySelector('#view');if(document.documentElement.scrollWidth>innerWidth+1)over.push('page '+document.documentElement.scrollWidth);return {small:[...new Set(small)].slice(0,8),over}});
for(const [pg,ids] of Object.entries(expect)){
  await q(pg=>document.querySelector('.settingsHubRow[data-settings-page="'+pg+'"]').click(),pg);await W(700);
  const r=await q(ids=>({head:document.querySelector('.settingsPageHead h2')?.innerText,sub:document.querySelector('#eyebrow')?.innerText,visible:ids.map(id=>id+':'+!!document.getElementById(id)?.offsetParent),cards:[...document.querySelectorAll('.settingsCard')].filter(c=>c.offsetParent).map(c=>(c.querySelector('h3')?.innerText||c.className).slice(0,24))}),ids);
  R['page_'+pg]=r; for(const v of r.visible)if(/:false/.test(v))bad.push(pg+' hides '+v); if(!r.cards.length)bad.push(pg+' empty');
  for(const theme of ['light','dark'])for(const w of [320,390,430]){await q(t=>document.documentElement.dataset.theme=t,theme);await p.setViewportSize({width:w,height:844});await W(250);const sw=await sweep();if(sw.over.length)bad.push(pg+' overflow '+theme+w);if(sw.small.length)R['small_'+pg+theme+w]=sw.small}
  await p.setViewportSize({width:390,height:844});await q(()=>document.documentElement.dataset.theme='light');
  await q(()=>document.querySelector('.settingsBack').click());await W(500);
  if(!await q(()=>!!document.querySelector('.settingsHub')))bad.push('back from '+pg+' failed');
}
for(const theme of ['light','dark'])for(const w of [320,390,430]){await q(t=>document.documentElement.dataset.theme=t,theme);await p.setViewportSize({width:w,height:844});await W(250);const sw=await sweep();if(sw.over.length)bad.push('hub overflow '+theme+w);if(sw.small.length)R['small_hub'+theme+w]=sw.small}
await q(()=>document.documentElement.dataset.theme='light');await p.setViewportSize({width:390,height:844});
// identity -> household page focused on name; save name; reload; initial + hub name
await q(()=>document.querySelector('.settingsHubIdentity').click());await W(700);
R.focusName=await q(()=>document.activeElement?.id);
await q(()=>{const f=document.getElementById('planlyDisplayName');f.value='Musti';f.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('planlyDisplayNameSave')?.click()});await W(2500);
await p.reload();await W(9000);
R.afterName=await q(()=>({btn:document.querySelector('#profileToggle').innerText.trim()}));
await q(()=>document.querySelector('#profileToggle').click());await W(700);
R.hubName=await q(()=>document.querySelector('.settingsHubIdentity strong')?.innerText);
if(R.hubName!=='Musti'||R.afterName.btn!=='M')bad.push('name flow '+JSON.stringify([R.hubName,R.afterName]));
// tab icons
R.tabs=await q(()=>[...document.querySelectorAll('.nav button')].map(b=>b.innerText.trim()+':'+(b.querySelector('svg circle[r="4"]')?'sun':b.querySelector('svg rect[height="15.5"]')?'grid':'other')));
if(R.tabs[0]!=='Today:sun'||R.tabs[1]!=='Plan:grid')bad.push('tab icons '+R.tabs);
// leaving settings via a tab and coming back opens the hub
await q(()=>document.querySelector('[data-section="today"]').click());await W(600);
R.todayAfter=await q(()=>document.querySelector('#pageTitle')?.innerText);
R.errors=h.errors; if(h.errors.length)bad.push('page errors');
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t153'); await h.browser.close();
