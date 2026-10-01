import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const R={};
// ---- TWO PHONES: owner + partner tick the same Anyone chore at once
{const a=await launch({uid:ME}),b=await launch({uid:PARTNER});const [pa,pb]=[a.page,b.page];
 for(const pg of [pa,pb]){await pg.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));await pg.goto('http://localhost:8802/planly/v2/');}
 await a.W(4000);for(const pg of [pa,pb])await pg.reload();await a.W(11000);
 for(const pg of [pa,pb])await pg.evaluate(()=>document.querySelector('[data-section="home"]')?.click());await a.W(1200);
 const tick=pg=>pg.evaluate(()=>{const row=[...document.querySelectorAll('.homeChoreRow,.choreRow,#view .task,#view [data-chore-open]')].find(r=>/Clean bathroom/.test(r.innerText)&&!/Done by/.test(r.innerText));const btn=row?.querySelector('button.check,[data-action="toggle"],[data-household-completion],.choreCheck,button');btn?.click();return !!btn});
 R.ticks=await Promise.all([tick(pa),tick(pb)]);await a.W(9000);
 const row=a.MOCK.db.planly_tasks.find(t=>t.client_id==='task-bathroom');R.dbBathroom={completed:row.completed,by:String(row.completed_by||'').slice(0,4),v:row.cloud_version};
 for(const pg of [pa,pb]){await pg.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await a.W(400);await pg.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))})}await a.W(4000);
 R.viewA=await pa.evaluate(()=>[...document.querySelectorAll('#view .homeChoreRow, #view [data-chore-open], #view .task')].filter(r=>/Clean bathroom/.test(r.innerText)).map(r=>r.className.slice(0,40)+' :: '+r.innerText.replace(/\n/g,' | ')));
 R.viewB=await pb.evaluate(()=>[...document.querySelectorAll('#view .homeChoreRow, #view [data-chore-open], #view .task')].filter(r=>/Clean bathroom/.test(r.innerText)).map(r=>r.className.slice(0,40)+' :: '+r.innerText.replace(/\n/g,' | ')));
 R.twoPhoneErrors=[...a.errors,...b.errors];await a.browser.close();await b.browser.close()}
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
