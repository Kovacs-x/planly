// R4: names + bills on Today
import { launch } from './harness.mjs';
import { ME, PARTNER, HH } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const who=process.argv[2]||'owner'; const uid=who==='partner'?PARTNER:ME;
const h=await launch({uid}); const {page:p,W,MOCK,ctx}=h; const q=(f,a)=>p.evaluate(f,a); const R={toasts:[]};
const lk=o=>{const x=new Date();x.setDate(x.getDate()+o);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
// seed: names, a completed-by-partner task, bills
MOCK.db.planly_household_members.find(m=>m.user_id===ME).display_name='Mustafa';
MOCK.db.planly_household_members.find(m=>m.user_id===PARTNER).display_name='Sarah';
const bins=MOCK.db.planly_tasks.find(t=>t.client_id==='task-bins');bins.completed=true;bins.completed_by=PARTNER;bins.completed_at=new Date().toISOString();bins.data={...bins.data,completed:true};
const E=MOCK.db.planly_budget_entries, rent=E.find(e=>e.description==='Rent'), elec=E.find(e=>e.description==='Electricity');
rent.entry_date=lk(0); elec.entry_date=lk(1); elec.show_on_today=true; elec.today_lead_days=2;
const mk=(base,desc,date,show,lead,owner)=>{const r={...base,id:crypto.randomUUID(),client_id:'e-'+crypto.randomUUID(),description:desc,entry_date:date,show_on_today:show,today_lead_days:lead,owner_id:owner||base.owner_id,allocation_status:'planned',cloud_version:1};E.push(r);return r};
mk(elec,'Water (in 3d, lead 2)',lk(3),true,2);
mk(elec,'Council tax (in 3d, lead 3)',lk(3),true,3);
mk(elec,'Phone (overdue)',lk(-2),true,2);
mk(elec,'TV licence (paid)',lk(0),true,2).allocation_status='paid';
mk(elec,'Gym (flag off)',lk(0),false,2);
mk(rent,'Owner personal car (show)',lk(0),true,2,ME);
p.on('dialog',d=>d.dismiss());
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
console.log('DBG',JSON.stringify(await q(()=>({navs:document.querySelectorAll('.nav button').length,boot:window.__planlySwBoot?.status,t:document.body.innerText.slice(0,120)}))),JSON.stringify(h.errors));await q(()=>{const o=window.showToast;window.__t=[];const el=document.getElementById('planlyToast');if(el)new MutationObserver(()=>window.__t.push(el.textContent)).observe(el,{childList:true,characterData:true,subtree:true})});
const nav=async s=>{await q(s=>{const b=document.querySelector(`.nav button[data-section="${s}"]`);if(b){b.click();return}if(s==='settings'){document.querySelector('#profileToggle')?.click();setTimeout(()=>document.querySelector('[data-profile-settings]')?.click(),200)}},s);await W(1100)};
const rows=()=>q(()=>[...document.querySelectorAll('#view .task')].map(t=>t.innerText.replace(/\s+/g,' ').replace(/^.*?Delete /,'').slice(0,90)));
const bills=()=>q(()=>[...document.querySelectorAll('.billsDueSection .billDueRow')].map(r=>r.innerText.replace(/\s+/g,' ').trim()));
// Today bills
await nav('today');R.todayBills=await bills();R.billsSectionTitle=await q(()=>document.querySelector('.billsDueSection h2')?.textContent||'none');
R.billTarget=await q(()=>{const b=document.querySelector('[data-budget-bill-paid]');if(!b)return 'none';const r=b.getBoundingClientRect();return b.getAttribute('aria-label')+' '+Math.round(r.width)+'x'+Math.round(r.height)});
// Home labels
await nav('home');R.homeRows=await rows();R.members=await q(()=>[...document.querySelectorAll('.homeMember')].map(m=>m.innerText.replace(/\s+/g,' ')));
await nav('today');R.todayRows=await rows();
if(who==='owner'){
 // tick a bill on Today -> paid + undo
 MOCK.log=[];const tgt=await q(()=>{const r=[...document.querySelectorAll('.billDueRow')].find(r=>/Owner personal car/.test(r.innerText));r?.querySelector('[data-budget-bill-paid]').click();return !!r});await W(2500);
 R.tick={clicked:tgt,writes:MOCK.log.filter(l=>!l.startsWith('GET')&&!l.includes('sync_state')).map(l=>l.split('?')[0]+(l.includes('cloud_version')?' [cv]':'')),db:E.find(e=>e.description==='Owner personal car (show)').allocation_status+'/v'+E.find(e=>e.description==='Owner personal car (show)').cloud_version,billsAfter:await bills(),undo:await q(()=>document.body.innerText.match(/Bill marked paid[^\n]*/)?.[0]||'none')};
 MOCK.log=[];await q(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^undo$/i.test(b.innerText.trim()));b?.click()});await W(2500);
 R.undo={writes:MOCK.log.filter(l=>!l.startsWith('GET')&&!l.includes('sync_state')).map(l=>l.split('?')[0]+(l.includes('cloud_version')?' [cv]':'')),db:E.find(e=>e.description==='Owner personal car (show)').allocation_status+'/v'+E.find(e=>e.description==='Owner personal car (show)').cloud_version,billsAfter:await bills()};
 // Budget: edit Rent -> show on today
 await nav('budget');await q(()=>{const c=[...document.querySelectorAll('.budgetCat[data-cat]')].find(c=>/Rent/.test(c.innerText));c?.click()});await W(900);
 await q(()=>{const r=[...document.querySelectorAll('.budgetPaymentRow')].find(r=>/^Rent/.test(r.innerText.trim()));r?.querySelector('[data-budget-edit-entry]')?.click()});await W(900);
 R.editForm=await q(()=>({labels:[...document.querySelectorAll('#budgetEditPaymentForm label')].map(l=>l.innerText.trim()),lead:document.getElementById('editPaymentLead')?.value,max:document.getElementById('editPaymentLead')?.max}));
 MOCK.log=[];await q(()=>{document.getElementById('editPaymentShowToday').checked=true;document.getElementById('budgetEditPaymentForm').requestSubmit()});await W(2500);
 R.editSave={writes:MOCK.log.filter(l=>!l.startsWith('GET')&&!l.includes('sync_state')).map(l=>l.split('?')[0]+(l.includes('cloud_version')?' [cv]':'')),db:'show='+rent.show_on_today+' lead='+rent.today_lead_days+' v'+rent.cloud_version};
 // add payment with show today
 await q(()=>document.querySelector('[data-act="allocation"]')?.click());await W(800);
 R.addForm=await q(()=>({hasToggle:!!document.getElementById('allocShowToday'),leadDefault:document.getElementById('allocTodayLead')?.value,leadOpts:[...document.querySelectorAll('#allocTodayLead option')].map(o=>o.value).join(',')}));
 MOCK.log=[];await q(()=>{document.getElementById('allocAmount').value='12';document.getElementById('allocName').value='Netflix';document.getElementById('allocShowToday').checked=true;document.getElementById('budgetAllocationForm').requestSubmit()});await W(3000);
 R.addSave=E.filter(e=>e.description==='Netflix').map(e=>'show='+e.show_on_today+' lead='+e.today_lead_days+' date='+e.entry_date);
 await nav('today');R.todayBillsAfterEdit=await bills();
 // Settings name
 await nav('settings');await q(()=>{document.querySelectorAll('details').forEach(d=>d.open=true)});await W(300);
 R.nameField=await q(()=>{const i=document.getElementById('planlyDisplayName');if(!i)return 'missing';const l=document.querySelector('label[for="planlyDisplayName"]');const b=document.getElementById('planlyDisplayNameSave').getBoundingClientRect();return {value:i.value,maxlength:i.maxLength,label:l?.innerText,help:i.closest('section')?.innerText.replace(/\s+/g,' ').slice(0,160),saveBtn:Math.round(b.width)+'x'+Math.round(b.height)}});
 const save=async v=>{if(!(await q(()=>!!document.getElementById('planlyDisplayName'))))return 'NAME INPUT NOT RENDERED';MOCK.nameCalls=0;MOCK.log=[];await q(v=>{const i=document.getElementById('planlyDisplayName');i.value=v;document.getElementById('planlyDisplayNameSave').click()},v);await W(2500);return {calls:MOCK.nameCalls||0,reqs:MOCK.log.map(l=>l.split('?')[0]).join(' '),toast:await q(()=>document.getElementById('planlyToast')?.textContent||''),db:String(MOCK.db.planly_household_members.find(m=>m.user_id===ME).display_name)}};
 R.save_Mo=await save('Mo');
 R.save_21=await save('x'.repeat(21));
 R.save_rtl=await save('Mo‮ab');
 R.save_blank=await save('   ');
 R.save_back=await save('Mustafa');
 await ctx.setOffline(true);await q(()=>window.dispatchEvent(new Event('offline')));R.save_offline=await save('Offline');await ctx.setOffline(false);await q(()=>window.dispatchEvent(new Event('online')));await W(2000);
 // rename reflected without reload on Home
 MOCK.db.planly_household_members.find(m=>m.user_id===ME).display_name='Mo';await p.reload();await W(10000);await nav('home');R.homeAfterRename=await rows();R.membersAfterRename=await q(()=>[...document.querySelectorAll('.homeMember')].map(m=>m.innerText.replace(/\s+/g,' ')));
 // escaping: partner name with markup
 MOCK.db.planly_household_members.find(m=>m.user_id===PARTNER).display_name='<b>x</b>&';
 await p.reload();await W(10000);await nav('today');await nav('home');
 R.escape=await q(()=>({boldInRows:document.querySelectorAll('#view .task b, .homeMember b').length,textShown:document.getElementById('view').innerText.includes('<b>x</b>&')}));
 // fallback: no names
 MOCK.db.planly_household_members.forEach(m=>m.display_name=null);await p.reload();await W(10000);await nav('today');await nav('home');R.fallbackRows=await rows();R.fallbackMembers=await q(()=>[...document.querySelectorAll('.homeMember')].map(m=>m.innerText.replace(/\s+/g,' ')));
}
await nav('budget');await q(()=>document.querySelector('[data-budget-scope="household"]')?.click());await W(2500);await nav('today');R.todayBillsHouseholdScope=await bills();
MOCK.log=[];await nav('today');await nav('plan');await nav('home');await nav('today');R.tabSwitchReqs=MOCK.log.length;
MOCK.log=[];await W(15000);R.idle=MOCK.log.length;
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(who,k,JSON.stringify(v));
await h.browser.close();
