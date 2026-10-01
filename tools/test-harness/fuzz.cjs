global.window={};eval(require('fs').readFileSync(process.argv[2],'utf8'));const E=window.PlanlyIntelligence;
let seed=42;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};const pick=a=>a[Math.floor(rnd()*a.length)];
const days=['2026-09-20','2026-09-28','2026-09-30','2026-10-01','2026-10-02','2026-10-05','2026-10-25','2026-10-26',''];
const fails={};const f=(k,x)=>{fails[k]=(fails[k]||0)+1;if(fails[k]===1)console.log('FAIL',k,JSON.stringify(x).slice(0,300))};
let maxMs=0;
for(let it=0;it<5000;it++){
 const today=pick(['2026-10-01','2026-10-25','2026-10-26','2026-12-31','2027-01-01']);const realToday=rnd()<.7?today:pick(['2026-10-01','2026-09-30']);
 const n=Math.floor(rnd()*60);const tasks=[];
 for(let i=0;i<n;i++){const hh=rnd()<.5;tasks.push({id:'t'+i,title:pick(['Buy milk','Dentist','','x'.repeat(300),'🍎 Apple','Clean bathroom']),date:pick(days),time:rnd()<.4?pick(['00:00','07:30','09:00','13:15','23:45','23:59','25:00','',null]):'',durationMinutes:pick(process.env.NOABC?[0,5,30,60,90,720,1000,undefined,-5,'45','']:[0,5,30,60,90,720,1000,undefined,'abc',-5]),priority:pick(['high','normal','low',undefined,'HIGH']),completed:rnd()<.2,visibility:hh?'household':pick(['private',undefined]),assigneeId:hh?pick(['me','partner','']):'',_planlyOwnedByMe:hh?rnd()<.6:true,projectId:pick(['','p1','p2','missing']),createdAt:Math.floor(rnd()*1e6),subtasks:rnd()<.2?[{done:false},{done:true}]:undefined,deferCount:pick([0,1,3,5,undefined]),category:pick(['Health','Personal','Home',undefined])})}
 const busy=[];const nb=Math.floor(rnd()*4);for(let i=0;i<nb;i++){const s=Math.floor(rnd()*1440)-200,e=s+Math.floor(rnd()*900);busy.push({start:s,end:e})}
 const input={today,realToday,nowMinutes:Math.floor(rnd()*1440),planningStart:pick(['08:00','08:00:00','22:00','',undefined,'7:5']),planningEnd:pick(['23:00','23:00:00','06:00','',undefined]),currentUserId:'me',defaultDuration:pick([30,0,undefined]),tasks,projects:[{id:'p1',dueDate:pick(['2026-10-02','2026-09-01','',undefined])},{id:'p2',visibility:'household'}],busy,members:[{id:'me'},{id:'partner'}],weekStart:'2026-09-28',weekEnd:'2026-10-04',learning:rnd()<.3?{Health:{usualMinutes:45,bestTimeMinutes:600,samples:3}}:{},prefs:{nightRest:rnd()<.5,nightRestHours:pick([6,8,12,0,99])}};
 let a,b;const t0=process.hrtime.bigint();try{a=E.analyse(input)}catch(e){f('throws',{e:e.message});continue}const ms=Number(process.hrtime.bigint()-t0)/1e6;maxMs=Math.max(maxMs,ms);
 b=E.analyse(JSON.parse(JSON.stringify(input)));if(JSON.stringify(a)!==JSON.stringify(b))f('nondeterministic',{});
 const byId=new Map(tasks.map(t=>[t.id,t]));
 for(const x of a.top3){const t=byId.get(x.id);if(!t)f('top3 unknown',x);else{if(t.visibility==='household')f('D1 household in top3',t);if(t._planlyOwnedByMe===false)f('partner in top3',t);if(t.date!==today)f('top3 not target day',{t,today});if(t.completed)f('completed in top3',t)}}
 if(a.top3.length>((a.day.isWorkDay||a.day.overnightRest)?2:3))f('top3 too many',{n:a.top3.length,d:a.day});
 for(const x of [...a.overdue,...a.times,...(a.leftToday||[])]){const t=byId.get(x.id);if(t&&t._planlyOwnedByMe===false)f('partner actionable',t)}
 for(const x of a.times){if(!x.time)continue;const [h,m]=x.time.split(':').map(Number),mins=h*60+m;if(today===realToday&&mins<input.nowMinutes-1)f('past time suggested',{x,now:input.nowMinutes});if(mins<0||mins>1439)f('bad time',x)}
 for(const k of ['freeMinutes','plannedMinutes','busyMinutes','overBy','planningMinutes'])if(!Number.isFinite(a.day[k])||a.day[k]<0)f('bad day '+k,a.day);
 for(const x of a.overdue)for(const r of x.reasons)if(/\d{4}-\d{2}-\d{2}|NaN|undefined/.test(r))f('raw reason',x);
 for(const x of a.top3)for(const r of x.reasons)if(/NaN|undefined/.test(r))f('bad top3 reason',x);
 for(const x of (a.weekCandidates||[])){const t=byId.get(x.id);if(t&&(t.visibility==='household'||t._planlyOwnedByMe===false||t.completed))f('bad week candidate',t)}
 for(const s of a.household.shareOut){const t=byId.get(s.id);if(!t||t._planlyOwnedByMe===false)f('shareOut not owned',t)}
}
console.log('fuzz done 5000; failures:',JSON.stringify(fails),'max ms',maxMs.toFixed(1));
