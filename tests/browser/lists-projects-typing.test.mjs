// Lists and Projects keep what you are doing: in a list, adding an item keeps the add field ready (keyboard stays up)
// and a sync landing while typing the next item keeps the typing and cursor; adding items quickly saves each one once;
// closing Lists returns Home to where it was scrolled; a New project name survives leaving the app and coming back.
// Run: node tests/browser/lists-projects-typing.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const day=new Date().toISOString().slice(0,10);
const chore=n=>({owner_id:OWNER,client_id:'h'+n,data:{id:'h'+n,title:'Chore '+n,date:day,time:'',category:'Home',durationMinutes:15,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'household',householdId:HOUSEHOLD,projectId:''},visibility:'household',household_id:HOUSEHOLD,cloud_version:1,deleted_at:null,task_date:day});
const db=makeDb();db.tables.planly_lists=[];db.tables.planly_list_items=[];db.delays.planly_list_items=700;
for(let i=1;i<=18;i++)db.tables.planly_tasks.push(chore(i));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
page.on('dialog',x=>x.accept());
const tab=t=>page.evaluate(t=>document.querySelector(`.nav button[data-tab="${t}"]`).click(),t);
const comeBack=()=>page.evaluate(async()=>{const set=v=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});set('hidden');document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,300));set('visible');document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));delete document.visibilityState});
const ADD='input[placeholder="Add an item…"]';

// Home scrolled down, then Lists opened and closed
await tab('home');await W(1500);
await page.evaluate(()=>window.scrollTo(0,600));await W(300);
const y0=await page.evaluate(()=>Math.round(scrollY));
await page.evaluate(()=>document.querySelector('[data-r1-lists]')?.click());await W(1000);
await page.fill('input[placeholder="New list name"]','Shop');await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Create')?.click());await W(2000);
check('creating a list clears the name field',await page.evaluate(()=>document.querySelector('input[placeholder="New list name"]')?.value||'')==='');
await page.evaluate(()=>document.querySelector('[data-list-id]')?.click());await W(800);
const add=page.locator(ADD);
await add.tap();await page.keyboard.type('milk');await page.keyboard.press('Enter');await W(200);
const afterAdd=await page.evaluate(sel=>({focus:document.activeElement?.matches?.(sel)||false,value:document.querySelector(sel)?.value}),ADD);
check('after adding an item the add field is empty and still ready to type (keyboard stays up)',afterAdd.focus&&afterAdd.value==='',JSON.stringify(afterAdd));
await page.keyboard.type('egg');await W(2500);
const typing=await page.evaluate(sel=>({value:document.querySelector(sel)?.value,focus:document.activeElement?.matches?.(sel)||false,items:[...document.querySelectorAll('[data-item-id]')].map(e=>e.innerText.replace('×','').trim())}),ADD);
check('when the save lands while typing the next item, the typing stays and the field keeps focus',typing.value==='egg'&&typing.focus&&typing.items.includes('milk'),JSON.stringify(typing));
await page.keyboard.press('Enter');await W(80);await page.keyboard.type('bread');await page.keyboard.press('Enter');await W(80);await page.keyboard.type('jam');await page.keyboard.press('Enter');
await W(5000);
const titles=db.tables.planly_list_items.filter(i=>!i.deleted_at).map(i=>i.title).sort();
check('adding items quickly saves each one once',JSON.stringify(titles)===JSON.stringify(['bread','egg','jam','milk']),JSON.stringify(titles));
check('…with no "could not sync" message',await page.evaluate(()=>!/could not sync|Not saved/i.test(document.getElementById('planlyListsWrap')?.innerText||'')));
await page.evaluate(()=>document.querySelector('[data-lists-back]')?.click());await W(400);
await page.evaluate(()=>document.querySelector('[data-lists-close]')?.click());await W(600);
const y1=await page.evaluate(()=>Math.round(scrollY));
check('closing Lists returns Home to where it was scrolled',y0>100&&Math.abs(y1-y0)<=2,JSON.stringify({y0,y1}));
check('…and the page is no longer locked',await page.evaluate(()=>!document.body.classList.contains('sheetOpen')&&!document.documentElement.classList.contains('sheetOpen')&&!document.body.style.top));

// New project: typing survives leaving the app and coming back
await tab('upcoming');await W(1200);
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/^Projects$/.test(b.innerText.trim()))?.click());await W(1000);
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/New project/.test(b.innerText))?.click());await W(800);
const hasForm=await page.evaluate(()=>!!document.getElementById('projectName'));
if(hasForm){await page.locator('#projectName').tap();await page.keyboard.type('Garden')}
await comeBack();await W(3000);
const kept=await page.evaluate(()=>({value:document.getElementById('projectName')?.value,focus:document.activeElement?.id}));
check('New project: the name typed survives leaving the app and coming back',hasForm&&kept.value==='Garden',JSON.stringify({hasForm,kept}));

check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
