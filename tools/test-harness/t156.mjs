// Settings redesign: hub icons/gradient card, switches have >=44px tappable label rows, contrast of hub text; light+dark; every sub-page.
import { launch } from './harness.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const h=await launch({}); const {page:p,W}=h; const q=(f,a)=>p.evaluate(f,a); const bad=[],R={};
await p.setViewportSize({width:390,height:844});
await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(9000);
const lum=c=>{let m=c.match(/[\d.]+/g).map(Number);if(m.length>3&&m[3]<1)throw new Error('lum needs an opaque colour: '+c);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
for(const theme of ['light','dark']){
 await q(t=>document.documentElement.dataset.theme=t,theme);
 await q(()=>document.getElementById('profileToggle').click());await W(800);
 const hub=await q(()=>({icons:[...document.querySelectorAll('.settingsHubRow .setIcon,.settingsHubTile .setIcon,.settingsHubSignOut .setIcon')].map(i=>Math.round(i.getBoundingClientRect().width)+'x'+Math.round(i.getBoundingClientRect().height)),rows:[...document.querySelectorAll('.settingsHubRow,.settingsHubTile,.settingsHubIdentity,.settingsHubSignOut')].map(r=>Math.round(r.getBoundingClientRect().height)),idText:[...document.querySelectorAll('.settingsHubIdentity strong,.settingsHubIdentity small')].map(e=>getComputedStyle(e).color),overflow:document.documentElement.scrollWidth>innerWidth}));
 R['hub_'+theme]=hub;
 if(hub.icons.length!==10||hub.icons.some(s=>s!=='32x32'))bad.push(theme+' icons '+hub.icons);
 if(hub.rows.some(h=>h<44))bad.push(theme+' hub row <44');
 if(hub.overflow)bad.push(theme+' hub overflow');
 // identity text vs the darkest and lightest gradient stops
 const over=(c,bg)=>{const m=c.match(/[\d.]+/g).map(Number),b=bg.match(/[\d.]+/g).map(Number),a=m.length>3?m[3]:1;return 'rgb('+[0,1,2].map(i=>Math.round(a*m[i]+(1-a)*b[i])).join(',')+')'};
 for(const c of hub.idText)for(const bg of ['rgb(37,99,235)','rgb(91,59,224)','rgb(126,47,216)']){const k=contrast(over(c,bg),bg);if(k<4.5)bad.push(theme+' identity contrast '+k.toFixed(2))}
 for(const pg of ['appearance','planning','intelligence','calendars','household','account','data']){
  await q(k=>document.querySelector('.settingsHubRow[data-settings-page="'+k+'"]').click(),pg);await W(600);
  const sw=await q(()=>[...document.querySelectorAll('.settingsPaged input[type=checkbox]')].filter(i=>i.getBoundingClientRect().height>0&&i.closest('.settingsCard:not([hidden])')&&getComputedStyle(i.closest('.settingsCard')).display!=='none').map(i=>{const l=i.closest('label')||document.querySelector('label[for="'+i.id+'"]');const r=i.getBoundingClientRect(),lr=l?.getBoundingClientRect();return {id:i.id||i.dataset.todayCard||i.name||'?',w:Math.round(r.width),h:Math.round(r.height),label:lr?Math.round(lr.height):0,bg:getComputedStyle(i).backgroundColor,checked:i.checked}}));
  R[theme+'_'+pg]=sw;
  for(const s of sw){if(Math.max(s.h,s.label)<44)bad.push(theme+' '+pg+' switch tap <44 '+s.id+' '+JSON.stringify(s));if(s.w!==51)bad.push(theme+' '+pg+' not a switch '+s.id)}
  if(await q(()=>document.documentElement.scrollWidth>innerWidth))bad.push(theme+' overflow '+pg);
  await q(()=>document.querySelector('.settingsBack')?.click());await W(500);
 }
 // a switch toggles and persists through the existing handler
 if(theme==='light'){await q(()=>document.querySelector('.settingsHubRow[data-settings-page="appearance"]').click());await W(600);
  const before=await q(()=>document.querySelector('input[data-today-card="top3"]')?.checked);
  await q(()=>document.querySelector('input[data-today-card="top3"]').closest('label').click());await W(500);
  const after=await q(()=>document.querySelector('input[data-today-card="top3"]')?.checked);
  R.toggle=[before,after];if(before===after)bad.push('switch did not toggle via its row');
  await q(()=>document.querySelector('input[data-today-card="top3"]').closest('label').click());await W(300);
  await p.screenshot({path:'t156-appearance.png'});await q(()=>document.querySelector('.settingsBack')?.click());await W(400);}
 await p.screenshot({path:`t156-hub-${theme}.png`,fullPage:true});
 await q(()=>document.querySelector('[data-section="today"]').click());await W(500);
}
R.errors=h.errors;if(h.errors.length)bad.push('page errors');
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t156');await h.browser.close();
