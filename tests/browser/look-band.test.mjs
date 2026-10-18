// Look: every screen has a soft colour glow behind it and a band in its section's colour behind the page title (Budget
// follows Me / Household). The band sits behind the title wherever the header ends up, the title is white on it, and
// nothing the person taps is covered (the band and glow sit behind everything).
// Run: node tests/browser/look-band.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date().toISOString(),P='11111111-0000-4000-8000-000000000001',H='22222222-0000-4000-8000-000000000002';
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:H,owner_id:OWNER,scope_type:'household',household_id:HOUSEHOLD,name:'Home',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[];db.tables.planly_budget_targets=[];db.tables.planly_budget_entries=[];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const look=()=>page.evaluate(()=>{const bar=document.querySelector('.topbar'),b=getComputedStyle(bar,'::before'),t=document.getElementById('pageTitle'),r=t.getBoundingClientRect(),br=bar.getBoundingClientRect();
  const x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);
  return {band:b.backgroundImage,z:b.zIndex,content:b.content,bottom:br.bottom-parseFloat(b.bottom),title:getComputedStyle(t).color,titleOnTop:!!top&&(top===t||t.contains(top)||top.closest?.('.topbar')===bar),
    glow:getComputedStyle(document.body,'::before').backgroundImage,bodyBg:getComputedStyle(document.body).backgroundColor}});
const BANDS={today:'rgb(47, 79, 208)',plan:'rgb(90, 63, 200)',home:'rgb(27, 122, 76)',budget:'rgb(168, 75, 7)',fitness:'rgb(23, 115, 140)'};
for(const [s,col] of Object.entries(BANDS)){await page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);await W(1800);const l=await look();
  check(`${s}: a band in the section's colour sits behind a white title`,l.band.includes(col)&&l.z==='-1'&&l.title==='rgb(255, 255, 255)'&&l.titleOnTop&&l.bottom>0,JSON.stringify(l));}
const l=await look();
check('the glow is behind every screen',/radial-gradient/.test(l.glow)&&l.bodyBg==='rgba(0, 0, 0, 0)',JSON.stringify({glow:l.glow.slice(0,60),bg:l.bodyBg}));
await page.evaluate(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(1500);
await page.evaluate(()=>document.querySelector('[data-budget-scope="household"]')?.click());await W(2000);
check('Budget in Household turns the band violet',(await look()).band.includes('rgb(85, 64, 184)'),(await look()).band);
// the band sits behind the header wherever it is (here the "Add Planly to your iPhone" note is above it)
const help=await page.evaluate(()=>{const h=document.getElementById('installHelp');return h&&!h.hidden?h.getBoundingClientRect().height:0});
check('with the install note above the header, the title still sits on the band',(await look()).titleOnTop&&help>=0,String(help));
check('tapping still works through the band: the first card button is the element on top',await page.evaluate(()=>{const b=document.querySelector('[data-budget-scope="personal"]'),r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===b||b.contains(e)}));
await page.evaluate(()=>{document.documentElement.dataset.theme='dark'});await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200);
check('dark mode uses a deeper band',(await look()).band.includes('rgb(38, 51, 138)'),(await look()).band);
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
