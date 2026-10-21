// Look: every screen has a soft colour glow behind it and a light wash in its section's colour behind the page title,
// which is written in that colour; each section has its own colour (Today blue, Plan violet, Home green, Budget amber,
// Household rose, Fitness teal). The wash is no solid slab: it fades out just below the title, with no rounded edge. It
// sits behind the title wherever the header ends up, and nothing the person taps is covered (wash and glow sit behind everything).
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
  return {band:b.backgroundImage,z:b.zIndex,content:b.content,bottom:br.bottom-parseFloat(b.bottom),radius:b.borderBottomLeftRadius,title:getComputedStyle(t).color,titleOnTop:!!top&&(top===t||t.contains(top)||top.closest?.('.topbar')===bar),
    glow:getComputedStyle(document.body,'::before').backgroundImage,bodyBg:getComputedStyle(document.body).backgroundColor}});
const BANDS={today:['rgb(220, 229, 255)','rgb(47, 79, 208)'],plan:['rgb(235, 226, 255)','rgb(90, 63, 200)'],home:['rgb(216, 241, 227)','rgb(27, 122, 76)'],budget:['rgb(255, 231, 204)','rgb(168, 75, 7)'],fitness:['rgb(214, 240, 246)','rgb(23, 115, 140)']};
const titles=[];
for(const [s,[wash,ink]] of Object.entries(BANDS)){await page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);await W(1800);const l=await look();titles.push(l.title);
  check(`${s}: a light wash in the section's colour fades out behind a title in that colour`,l.band.includes(wash)&&/transparent|rgba\(0, 0, 0, 0\)/.test(l.band)&&l.radius==='0px'&&l.z==='-1'&&l.title===ink&&l.titleOnTop&&l.bottom>0,JSON.stringify(l));}
check('every section has its own colour',new Set(titles).size===titles.length,JSON.stringify(titles));
const l=await look();
check('the glow is behind every screen',/radial-gradient/.test(l.glow)&&l.bodyBg==='rgba(0, 0, 0, 0)',JSON.stringify({glow:l.glow.slice(0,60),bg:l.bodyBg}));
await page.evaluate(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(1500);
await page.evaluate(()=>document.querySelector('[data-budget-scope="household"]')?.click());await W(2000);
{const l=await look();check('Budget in Household turns the wash and title rose',l.band.includes('rgb(255, 223, 234)')&&l.title==='rgb(180, 35, 90)',JSON.stringify(l))}
// the band sits behind the header wherever it is (here the "Add Planly to your iPhone" note is above it)
const help=await page.evaluate(()=>{const h=document.getElementById('installHelp');return h&&!h.hidden?h.getBoundingClientRect().height:0});
check('with the install note above the header, the title still sits on the band',(await look()).titleOnTop&&help>=0,String(help));
check('tapping still works through the band: the first card button is the element on top',await page.evaluate(()=>{const b=document.querySelector('[data-budget-scope="personal"]'),r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===b||b.contains(e)}));
await page.evaluate(()=>{document.documentElement.dataset.theme='dark'});await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200);
{const l=await look();check('dark mode uses a deep wash and a light title',l.band.includes('rgb(28, 37, 82)')&&l.title==='rgb(158, 176, 255)',JSON.stringify(l))}
// The phone in dark mode with no Planly theme set (e.g. while the app starts): every section uses its deeper band
await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>{delete document.documentElement.dataset.theme});
const AUTO={today:'rgb(28, 37, 82)',plan:'rgb(43, 32, 88)',home:'rgb(18, 56, 42)',budget:'rgb(61, 42, 12)',fitness:'rgb(15, 53, 64)'};
for(const [s,col] of Object.entries(AUTO)){await page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);await W(1500);if(s==='budget'){await page.evaluate(()=>document.querySelector('[data-budget-scope="personal"]')?.click());await W(1500)}await page.evaluate(()=>{delete document.documentElement.dataset.theme});await W(100);
  const b=(await look()).band;check(`automatic dark mode: ${s} uses its deep wash`,b.includes(col),b);}
await page.evaluate(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(1200);await page.evaluate(()=>document.querySelector('[data-budget-scope="household"]')?.click());await W(1500);await page.evaluate(()=>{delete document.documentElement.dataset.theme});await W(100);
check('automatic dark mode: Budget in Household uses the deep rose wash',(await look()).band.includes('rgb(67, 23, 43)'),(await look()).band);
await page.evaluate(()=>{document.documentElement.dataset.theme='light'});await W(100);
check('a light Planly theme on a dark phone keeps the light wash',(await look()).band.includes('rgb(255, 223, 234)'),(await look()).band);
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
