// New/Edit project on a phone (390 px): the page only scrolls up and down (nothing sticks out sideways, including the
// due date and the stages); the Create project button can be scrolled clear of the bottom tabs; the top-right button
// says Create (or Save when editing) and saves, with an empty name it stays on the form, and outside the editor it still
// says Done and closes. Scroll bars are hidden across Planly.
// Run: node tests/browser/project-form-layout.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const db=makeDb();
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const nav=s=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);
const home=async()=>{await nav('plan');await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(800)};
const names=()=>db.tables.planly_projects.filter(r=>!r.deleted_at).map(r=>r.data?.name||r.name);
const head=()=>page.evaluate(()=>({text:document.getElementById('projectsClose')?.textContent.trim(),open:document.getElementById('projectsWrap')?.classList.contains('open'),form:!!document.getElementById('projectForm'),title:document.getElementById('projectsTitle')?.textContent}));

await home();await page.evaluate(()=>document.querySelector('[data-r1-project-new]').click());await W(800);
await page.evaluate(()=>{document.getElementById('projectName').value='Driving Licence';document.getElementById('projectWhy').value='Be driving in 2027';document.getElementById('projectDueDate').value='2026-12-31';
  const add=document.querySelector('[data-project-stage-add]');for(let i=0;i<4;i++)add.click()});await W(400);
await page.evaluate(()=>[...document.querySelectorAll('#projectStages input')].forEach((x,i)=>x.value=['Book test','2/3 week study','Pass theory','Book auto lessons'][i]||''));
const lay=await page.evaluate(()=>{const w=document.getElementById('projectsWrap'),vw=document.documentElement.clientWidth;
  const out=[...w.querySelectorAll('#projectForm *')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().right>vw+0.5).map(e=>e.tagName+(e.id?'#'+e.id:'')+'.'+e.className);
  return {sw:w.scrollWidth,cw:w.clientWidth,ox:getComputedStyle(w).overflowX,out}});
check('nothing sticks out sideways and the page can’t move left or right',lay.sw<=lay.cw&&lay.ox==='hidden'&&lay.out.length===0,JSON.stringify(lay));
const bottom=await page.evaluate(()=>{const w=document.getElementById('projectsWrap');w.scrollTop=w.scrollHeight;const b=document.querySelector('#projectForm [type=submit]').getBoundingClientRect(),n=document.querySelector('.nav').getBoundingClientRect(),f=document.querySelector('.fab');const fr=f&&f.offsetParent?f.getBoundingClientRect():null;
  return {btnBottom:Math.round(b.bottom),navTop:Math.round(n.top),clearOfFab:!fr||b.bottom<=fr.top||b.top>=fr.bottom||b.right<=fr.left,hit:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('[type=submit]')?.textContent}});
check('scrolled to the bottom, Create project sits above the bottom tabs and can be tapped',bottom.btnBottom<=bottom.navTop&&bottom.hit==='Create project',JSON.stringify(bottom));
check('top-right button says Create in a new project',(await head()).text==='Create',JSON.stringify(await head()));
await page.evaluate(()=>document.getElementById('projectsClose').click());await W(1500);
let h=await head();
check('…and tapping it creates the project, with its stages, and opens it',names().includes('Driving Licence')&&h.open&&!h.form&&h.title==='Driving Licence'&&h.text==='Done',JSON.stringify({h,n:names()}));
check('…stages saved',await page.evaluate(()=>/Book test[\s\S]*Pass theory/.test(document.getElementById('projectsContent')?.innerText||'')));
await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(600);
check('editing: the button says Save',(await head()).text==='Save');
await page.evaluate(()=>{document.getElementById('projectName').value='Driving licence (auto)'});await page.evaluate(()=>document.getElementById('projectsClose').click());await W(1500);
h=await head();check('…and saves the change',names().includes('Driving licence (auto)')&&!h.form&&h.text==='Done',JSON.stringify({h,n:names()}));
await page.evaluate(()=>document.getElementById('projectsBack').click());await W(600);
await page.evaluate(()=>document.querySelector('[data-project-action="new"]')?.click());await W(600);
const before=names().length;await page.evaluate(()=>document.getElementById('projectsClose').click());await W(900);h=await head();
check('empty name: Create stays on the form and saves nothing',h.form&&names().length===before,JSON.stringify(h));
await page.evaluate(()=>document.getElementById('projectsBack').click());await W(600);h=await head();
check('in the project list it says Done …',h.text==='Done'&&!h.form,JSON.stringify(h));
await page.evaluate(()=>document.getElementById('projectsClose').click());await W(600);
check('… and closes Projects',!(await head()).open);
check('scroll bars hidden',await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarWidth==='none'&&getComputedStyle(document.getElementById('projectsWrap')).scrollbarWidth==='none'));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
