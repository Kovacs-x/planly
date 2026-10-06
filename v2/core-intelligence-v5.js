// Planly Intelligence 5.0 — pure deterministic advisory engine.
(()=>{'use strict';if(window.PlanlyIntelligence)return;
const VERSION='5.0.0-i5',clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),pad=n=>String(n).padStart(2,'0');
const dateParts=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?[+m[1],+m[2],+m[3]]:null};
const serial=s=>{const p=dateParts(s);if(!p)return NaN;let [y,m,d]=p;y-=m<=2?1:0;const era=Math.floor(y/400),yoe=y-era*400,mp=m+(m>2?-3:9),doy=Math.floor((153*mp+2)/5)+d-1,doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;return era*146097+doe};
const dayDiff=(a,b)=>serial(a)-serial(b),timeMin=s=>{const m=String(s||'').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);return m?clamp(+m[1]*60 + +m[2],0,1439):0};
const timeText=n=>{n=clamp(Math.round(n),0,1439);return pad(Math.floor(n/60))+':'+pad(n%60)};
const finiteDuration=(v,fallback)=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:fallback},duration=(t,d=30,learning={})=>clamp(finiteDuration(learning?.[String(t?.category||'Personal')]?.usualMinutes,finiteDuration(t?.durationMinutes,finiteDuration(d,30))),5,720),fixedDuration=(t,d=30)=>clamp(finiteDuration(t?.durationMinutes,finiteDuration(d,30)),5,720),owned=t=>t&&t._planlyOwnedByMe!==false;
const humanMinutes=n=>{n=Math.max(0,Math.round(n));const h=Math.floor(n/60),m=n%60;return h?(h+'h'+(m?' '+m+'m':'')):(m+'m')},short=s=>String(s||'').slice(0,60),reason=(a,s)=>{s=short(s);if(s&&!a.includes(s)&&a.length<6)a.push(s)};
const mergeBusy=(rows,start,end)=>{const a=rows.map(x=>({start:Math.max(start,Number(x.start)),end:Math.min(end,Number(x.end))})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start).sort((x,y)=>x.start-y.start||x.end-y.end),m=[];for(const x of a){const l=m[m.length-1];if(l&&x.start<=l.end)l.end=Math.max(l.end,x.end);else m.push({...x})}return m};
const gaps=(busy,start,end)=>{const out=[];let c=start;for(const x of busy){if(x.start>c)out.push({start:c,end:x.start,minutes:x.start-c});c=Math.max(c,x.end)}if(c<end)out.push({start:c,end,minutes:end-c});return out};
const priority=t=>({high:3,normal:2,low:1})[String(t?.priority||'normal').toLowerCase()]||2;
const stable=(a,b)=>b.score-a.score||b.priority-a.priority||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
const assignedToMe=(t,uid)=>{const a=String(t?.assigneeId||t?.assignee_id||'');return !a||a===uid};
function scoreTask(t,ctx){const {today,realToday,projects,free,learning}=ctx,id=String(t.id||''),reasons=[],factors=[];let score=0;const dd=String(t.date||'')?dayDiff(String(t.date),today):null;
 const add=(text,points)=>{score+=points;text=short(text);if(text&&!factors.some(x=>x.text===text))factors.push({text,points});reason(reasons,text)};
 if(dd!==null&&dd<0){const days=Math.abs(dd);add('Overdue '+days+' day'+(days===1?'':'s'),100+Math.min(40,days*5))}
 else if(dd===0)add(today===realToday?'Due today':'Due tomorrow',80);else if(dd===null)add('Still in Inbox',25);else return null;
 if(String(t.priority).toLowerCase()==='high')add('High priority',45);else{const p=priority(t);add((p===2?'Normal':'Low')+' priority',p*8)}
 const p=projects.get(String(t.projectId||''));if(p?.dueDate){const pd=dayDiff(String(p.dueDate),today);if(pd<=0)add('Project due today',30);else if(pd===1)add('Project due tomorrow',24);else if(pd<=3)add('Project due in '+pd+' days',18);else if(pd<=7)add('Project due this week',10)}
 if(t.time)add('Already has a time',12);else{const learned=learning?.[String(t.category||'Personal')],need=duration(t,ctx.defaultDuration,learning),fit=free.find(g=>g.minutes>=need);if(learned){add('Usually takes you ~'+humanMinutes(need),0);if(Number.isFinite(Number(learned.bestTimeMinutes)))add('Often done around '+timeText(Number(learned.bestTimeMinutes)),0)}if(fit)add('Fits a '+humanMinutes(fit.minutes)+' gap',12);else add('No free gap long enough today',-20)}
 const left=(Array.isArray(t.subtasks)?t.subtasks:[]).filter(x=>!x.done).length;if(left)add(left+' checklist item'+(left===1?'':'s')+' left',Math.min(8,left*2));
 const defer=Number(t?.data?.deferCount||t?.deferCount||0);if(defer>=3)add('Moved '+defer+' times',-15);
 return {id,score,priority:priority(t),createdAt:Number(t.createdAt||0),reasons,factors};
}
function analyse(input={}){const today=String(input.today||'');if(!dateParts(today))throw Error('today must be YYYY-MM-DD');
 const tasks=Array.isArray(input.tasks)?input.tasks:[],learning=input.learning||{},projects=new Map((input.projects||[]).map(p=>[String(p.id||''),p])),uid=String(input.currentUserId||''),defaultDuration=Number(input.defaultDuration||30),taskById=new Map();
 for(const t of tasks){const id=String(t?.id||'');if(!id)continue;if(!taskById.has(id)||owned(t))taskById.set(id,t)}
 let start=timeMin(input.planningStart||'08:00'),end=timeMin(input.planningEnd||'23:00');if(end<=start){start=480;end=1380}
 const now=clamp(Number(input.nowMinutes),0,1439),effectiveStart=Math.max(start,now),external=(input.busy||[]).map(x=>({start:Number(x.start),end:Number(x.end)}));
 const todayTasks=tasks.filter(t=>!t.completed&&String(t.date||'')===today),timed=todayTasks.filter(t=>t.time).map(t=>({start:timeMin(t.time),end:timeMin(t.time)+fixedDuration(t,defaultDuration),id:String(t.id||'')}));
 const externalMerged=mergeBusy(external,start,end),nightShift=external.filter(x=>Number(x.start)<360&&Number(x.end)>=360).sort((a,b)=>Number(b.end)-Number(a.end))[0],overnightRest=!!input.prefs?.nightRest&&!!nightShift,restHours=clamp(Number(input.prefs?.nightRestHours||8),4,12),restBusy=overnightRest?[{start:Number(nightShift.end),end:Number(nightShift.end)+restHours*60}]:[],busy=mergeBusy([...timed,...external,...restBusy],effectiveStart,end),free=gaps(busy,effectiveStart,end),planningMinutes=Math.max(0,end-effectiveStart),busyMinutes=externalMerged.reduce((s,x)=>s+x.end-x.start,0),freeMinutes=free.reduce((s,x)=>s+x.minutes,0);
 const plannedMinutes=todayTasks.reduce((s,t)=>s+(t.time?fixedDuration(t,defaultDuration):duration(t,defaultDuration,learning)),0),overBy=Math.max(0,plannedMinutes-freeMinutes),status=!todayTasks.length?'empty':plannedMinutes>freeMinutes?'over':plannedMinutes>freeMinutes*.85?'tight':'fits',isWorkDay=busyMinutes>=360;
 const clashes=[];for(let i=0;i<timed.length;i++){for(let j=i+1;j<timed.length;j++){if(timed[j].start<timed[i].end&&timed[j].end>timed[i].start)clashes.push({a:timed[i].id,b:timed[j].id})}for(const b of external){if(b.start<timed[i].end&&b.end>timed[i].start)clashes.push({a:timed[i].id,b:'calendar'})}}
 const realToday=String(input.realToday||today),ctx={today,realToday,projects,free,defaultDuration,learning},ranked=tasks.filter(t=>owned(t)&&!t.completed).map(t=>scoreTask(t,ctx)).filter(Boolean).sort(stable),rankById=new Map(ranked.map(r=>[r.id,r]));
 const personal=ranked.filter(r=>taskById.get(r.id)?.visibility!=='household'),weekCandidates=personal.filter(r=>{const t=taskById.get(r.id);return !t.date||dayDiff(String(t.date),realToday)<0}).map(r=>({id:r.id,reasons:r.reasons.slice(0,2),factors:r.factors,score:r.score})),targetPersonal=personal.filter(r=>String(taskById.get(r.id)?.date||'')===today),top3=targetPersonal.slice(0,(isWorkDay||overnightRest)?2:3).map(x=>({id:x.id,reasons:x.reasons.slice(0,2),factors:x.factors,score:x.score}));
 const chores=tasks.filter(t=>!t.completed&&t.visibility==='household'&&assignedToMe(t,uid)&&String(t.date||'')&&dayDiff(String(t.date),today)<=0&&dayDiff(String(t.date),today)>=-6).map(t=>({id:String(t.id),reasons:[String(t.date)===today?'Due today':'Overdue this week']}));
 const leftToday=realToday!==today?tasks.filter(t=>owned(t)&&!t.completed&&String(t.date||'')===realToday).map(t=>({id:String(t.id),suggest:'today',kind:'leftToday',reasons:['Not done yet today'],factors:[{text:'Not done yet today',points:null}]})):[];
 const overdue=tasks.filter(t=>owned(t)&&!t.completed&&t.date&&dayDiff(String(t.date),realToday)<0).map(t=>{const days=Math.abs(dayDiff(String(t.date),today)),d=Number(t?.data?.deferCount||t?.deferCount||0),fit=free.some(g=>g.minutes>=duration(t,defaultDuration,learning));let suggest=days<=2&&fit?'today':'tomorrow';if(d>=3||(days>14&&!t.projectId))suggest='inbox';else if(!fit&&days>2)suggest='nextWeek';const reasons=[];reason(reasons,'Overdue '+days+' day'+(days===1?'':'s'));if(d>=3)reason(reasons,'Moved '+d+' times');else if(suggest==='today'&&fit)reason(reasons,today===realToday?'Fits today':'Fits tomorrow');else if(suggest==='tomorrow')reason(reasons,'Spread out to tomorrow');else if(suggest==='nextWeek')reason(reasons,'No free gap long enough');else if(suggest==='inbox')reason(reasons,'Needs a fresh decision');const base=rankById.get(String(t.id));return {id:String(t.id),suggest,reasons,kind:'overdue',factors:base?.factors||[],score:base?.score}});
 let work=free.map(x=>({...x}));const times=[];for(const r of targetPersonal){const t=taskById.get(r.id);if(!t||t.time||String(t.date||'')!==today)continue;const need=duration(t,defaultDuration,learning),learned=learning?.[String(t.category||'Personal')],g=work.find(x=>x.minutes>=need),reasons=[];if(learned){reason(reasons,'Usually takes you ~'+humanMinutes(need));if(Number.isFinite(Number(learned.bestTimeMinutes)))reason(reasons,'Often done around '+timeText(Number(learned.bestTimeMinutes)))}if(!g){reason(reasons,'No free gap long enough today');times.push({id:r.id,time:'',reasons,factors:r.factors,score:r.score});continue}let at=Math.ceil(g.start/15)*15;if(at>g.start&&at+need>g.end)continue;reason(reasons,'Fits the '+need+'m gap at '+timeText(at));times.push({id:r.id,time:timeText(at),reasons,factors:r.factors,score:r.score});const cut=at+need+10;work=work.flatMap(x=>cut<=x.start||at>=x.end?[x]:[{start:x.start,end:at,minutes:at-x.start},{start:cut,end:x.end,minutes:x.end-cut}].filter(y=>y.minutes>0))}
 const moveCandidate=status==='over'?targetPersonal.map(r=>({r,t:taskById.get(r.id)})).filter(x=>x.t&&!x.t.time).sort((a,b)=>a.r.score-b.r.score||String(a.t.id).localeCompare(String(b.t.id)))[0]:null;
 const projectSignals=[];for(const p of projects.values()){if(p?.archived)continue;const all=tasks.filter(t=>String(t.projectId||'')===String(p.id||'')),activeAll=all.filter(t=>!t.completed),completed=all.filter(t=>t.completed),actionable=tasks.filter(t=>owned(t)&&t.visibility!=='household'&&!t.completed&&String(t.projectId||'')===String(p.id||'')),rankedActive=actionable.map(t=>rankById.get(String(t.id))).filter(Boolean).sort(stable),dueDays=p.dueDate?dayDiff(String(p.dueDate),today):null,dated=activeAll.filter(t=>t.date),next=rankedActive[0]||null;let status='on-track',reasons=[];if(!activeAll.length&&completed.length){status='done';reasons=['All tasks complete']}else if(!activeAll.length){status='empty';reasons=['No tasks yet']}else if(dueDays!==null&&dueDays<0){status='behind';reasons=['Project is overdue']}else if(dueDays!==null&&dueDays<=7&&!dated.length){status='behind';reasons=['Due soon with nothing scheduled']}else if(!dated.length){status='not-scheduled';reasons=['Active tasks are not scheduled']}else{reasons=[dueDays!==null&&dueDays<=14?'Due date and tasks are in view':'Active work is scheduled']}projectSignals.push({id:String(p.id||''),status,reasons,nextStepId:next?.id||'',nextStepReasons:next?.reasons?.slice(0,2)||[]})}
 const members=(input.members||[]).map(m=>({id:String(m.id||m.user_id||''),name:String(m.name||m.display_name||'')})).filter(m=>m.id),weekStart=String(input.weekStart||today),weekEnd=String(input.weekEnd||weekStart),weekCounts={};for(const m of members)weekCounts[m.id]=0;
 const householdTasks=tasks.filter(t=>t.visibility==='household'),completedWeek=householdTasks.filter(t=>t.completed&&String(t.completedDate||'')>=weekStart&&String(t.completedDate||'')<=weekEnd&&String(t.completedBy||t.completed_by||''));for(const t of completedWeek){const actor=String(t.completedBy||t.completed_by||'');if(Object.prototype.hasOwnProperty.call(weekCounts,actor))weekCounts[actor]++}
 const unassigned=householdTasks.filter(t=>!t.completed&&!String(t.assigneeId||t.assignee_id||'')&&String(t.date||'')>=weekStart&&String(t.date||'')<=weekEnd).map(t=>String(t.id||'')).filter(Boolean);
 const ownerUnassigned=householdTasks.filter(t=>!t.completed&&owned(t)&&!String(t.assigneeId||t.assignee_id||'')&&String(t.date||'')>=weekStart&&String(t.date||'')<=weekEnd),loads={...weekCounts};for(const m of members)loads[m.id]=Number(loads[m.id]||0)+householdTasks.filter(t=>!t.completed&&String(t.assigneeId||t.assignee_id||'')===m.id&&String(t.date||'')>=weekStart&&String(t.date||'')<=weekEnd).length;
 const shareOut=[];for(const t of ownerUnassigned){const ordered=members.slice().sort((a,b)=>Number(loads[a.id]||0)-Number(loads[b.id]||0)||a.id.localeCompare(b.id)),target=ordered[0];if(!target)break;if(ordered.length>1&&Number(loads[ordered[0].id]||0)===Number(loads[ordered[1].id]||0))break;shareOut.push({id:String(t.id||''),assigneeId:target.id});loads[target.id]=Number(loads[target.id]||0)+1}
 const longShifts=householdTasks.filter(t=>!t.completed&&String(t.date||'')>=weekStart&&String(t.date||'')<=weekEnd&&Number(t.durationMinutes||0)>=360&&String(t.assigneeId||t.assignee_id||'')).map(t=>({id:String(t.id||''),assigneeId:String(t.assigneeId||t.assignee_id||''),date:String(t.date||''),minutes:Number(t.durationMinutes||0)}));
 return {engineVersion:VERSION,day:{date:today,isWorkDay,planningMinutes,busyMinutes,freeMinutes,plannedMinutes,overBy,clashes,status,overnightRest,restUntil:overnightRest?timeText(Number(nightShift.end)+restHours*60):'',move:moveCandidate?{id:String(moveCandidate.t.id),reasons:['Move this flexible task to free '+duration(moveCandidate.t,defaultDuration)+'m'],factors:moveCandidate.r.factors,score:moveCandidate.r.score}:null},top3,chores,overdue,leftToday,times,weekCandidates,projects:projectSignals,household:{weekCounts,unassigned,shareOut,longShifts}};
}

// Learning (6.1): plain statistics over the caller's own completed tasks. Pure: no clock, no storage.
// Learning never resets: older days simply count less. Each history row: {id,title,category,date,time,durationMinutes,deferCount,recurring,doneDay:'YYYY-MM-DD',doneMin:0-1439}.
const fromSerial=n=>{const era=Math.floor(n/146097),doe=n-era*146097,yoe=Math.floor((doe-Math.floor(doe/1460)+Math.floor(doe/36524)-Math.floor(doe/146096))/365),doy=doe-(365*yoe+Math.floor(yoe/4)-Math.floor(yoe/100)),mp=Math.floor((5*doy+2)/153),d=doy-Math.floor((153*mp+2)/5)+1,m=mp+(mp<10?3:-9),y=yoe+era*400+(m<=2?1:0);return y+'-'+pad(m)+'-'+pad(d)};
const addDaysKey=(s,n)=>fromSerial(serial(s)+n),weekdayOf=s=>(((serial(s)-serial('1970-01-01'))%7)+7+4)%7;
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const titleKey=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g,' ').replace(/\b\d+\b/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
const median=a=>{if(!a.length)return NaN;const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
// Recent days count more (half-life 30 days), so a change in routine shows within a few weeks.
const HALF_LIFE=30,recency=age=>Math.pow(0.5,Math.max(0,age)/HALF_LIFE);
const wMedian=(rows,f)=>{const a=[];for(const r of rows){const v=f(r);if(v!=null&&Number.isFinite(v))a.push([v,r.w])}if(!a.length)return NaN;a.sort((x,y)=>x[0]-y[0]);let total=0;for(const x of a)total+=x[1];let run=0;for(const x of a){run+=x[1];if(run>=total/2)return x[0]}return a[a.length-1][0]};
const hasTime=s=>/^\d{1,2}:\d{2}/.test(String(s||''));
function groupStats(rows){const actualN=rows.filter(r=>r.actual!=null).length,wd={};for(let w=0;w<7;w++){const s=rows.filter(r=>r.wd===w);if(s.length>=3)wd[w]=Math.round(wMedian(s,r=>r.start)/15)*15}
 const counts=[0,0,0,0,0,0,0],wts=[0,0,0,0,0,0,0];let wsum=0,wslip=0;for(const r of rows){counts[r.wd]++;wts[r.wd]+=r.w;wsum+=r.w;if(r.slipped)wslip+=r.w}let mode=-1;for(let w=0;w<7;w++)if(counts[w]&&(mode<0||wts[w]>wts[mode]))mode=w;
 return {n:rows.length,start:Math.round(wMedian(rows,r=>r.start)/15)*15,startByWd:wd,actual:actualN?Math.max(5,Math.round(wMedian(rows,r=>r.actual)/5)*5):null,actualN,slipRate:wsum?wslip/wsum:0,mostDoneWd:mode>=0&&counts[mode]>=2&&wts[mode]>=wsum/2?mode:-1}}
function learn(input={}){const today=String(input.today||'');if(!dateParts(today))return {n:0,byKey:{},byCat:{},habits:[],usualByWd:null};
 const from=addDaysKey(today,-180);
 const rows=[];for(const h of (Array.isArray(input.history)?input.history:[])){const doneDay=String(h?.doneDay||'');if(!dateParts(doneDay)||doneDay>today||doneDay<from)continue;
  const dur=clamp(finiteDuration(h.durationMinutes,30),5,720),doneMin=clamp(Math.round(Number(h.doneMin)||0),0,1439),planned=String(h.date||''),onDay=planned===doneDay,timed=hasTime(h.time)&&onDay,start=timed?timeMin(h.time):Math.max(0,doneMin-dur);
  const actual=timed&&doneMin>=start+5&&doneMin<=start+Math.max(dur*2.5,dur+60)?doneMin-start:null;
  rows.push({w:recency(dayDiff(today,doneDay)),id:String(h.id||''),title:String(h.title||''),key:titleKey(h.title),cat:String(h.category||'Personal'),doneDay,doneMin,wd:weekdayOf(doneDay),start,actual,recurring:!!h.recurring,slipped:Number(h.deferCount||0)>0||(!!planned&&dateParts(planned)&&doneDay>planned)})}
 const group=f=>{const g={};for(const r of rows){const k=f(r);if(!k)continue;(g[k]||(g[k]=[])).push(r)}const out={};for(const k of Object.keys(g).sort())out[k]=groupStats(g[k]);return out};
 const byKey=group(r=>r.key),byCat=group(r=>r.cat);
 // Habits: the same task done by hand at a steady rhythm (daily, weekly, fortnightly, monthly).
 const habits=[];const keyed={};for(const r of rows)if(r.key&&!r.recurring)(keyed[r.key]||(keyed[r.key]=[])).push(r);
 for(const k of Object.keys(keyed).sort()){const list=keyed[k].slice().sort((a,b)=>a.doneDay.localeCompare(b.doneDay)||a.doneMin-b.doneMin),days=[];for(const r of list)if(days[days.length-1]!==r.doneDay)days.push(r.doneDay);if(days.length<3)continue;
  const gapsD=[];for(let i=1;i<days.length;i++)gapsD.push(dayDiff(days[i],days[i-1]));const cls=g=>g===1?'d1':g>=6&&g<=8?'w1':g>=13&&g<=15?'w2':g>=27&&g<=32?'m1':'';const first=cls(gapsD[gapsD.length-1]);if(!first)continue;
  const recent=gapsD.slice(-4);if(recent.filter(g=>cls(g)===first).length<Math.max(2,recent.length-1))continue;
  const unit=first==='d1'?'days':first==='m1'?'months':'weeks',interval=first==='w2'?2:1,period=first==='d1'?1:first==='w1'?7:first==='w2'?14:30,last=list[list.length-1];
  if(dayDiff(today,last.doneDay)>period*2)continue;
  const wdCounts=[0,0,0,0,0,0,0];for(const d of days)wdCounts[weekdayOf(d)]++;let wd=0;for(let w=1;w<7;w++)if(wdCounts[w]>wdCounts[wd])wd=w;
  habits.push({key:k,title:last.title,category:last.cat,lastId:last.id,lastDay:last.doneDay,times:days.length,unit,interval,period,weekday:wd,time:last.start})}
 // Your week: how many tasks you usually finish on each weekday, from the last 8 weeks (needs 4 weeks of history).
 let usualByWd=null;const oldest=rows.reduce((m,r)=>r.doneDay<m?r.doneDay:m,today);
 if(dayDiff(today,oldest)>=28){usualByWd=[];const perDay={};for(const r of rows)perDay[r.doneDay]=(perDay[r.doneDay]||0)+1;for(let w=0;w<7;w++){const c=[];for(let k=1;k<=56;k++){const d=addDaysKey(today,-k);if(weekdayOf(d)===w&&d>=oldest)c.push(perDay[d]||0)}usualByWd.push(c.length>=4?Math.round(median(c)):null)}}
 return {n:rows.length,byKey,byCat,habits,usualByWd};
}

// Suggestions (6.1): a short list of concrete, one-tap changes, each with a plain reason, ranked by what you tend to accept.
// Pure: date, time, tasks, busy times, history, feedback and dismissed keys all come from the caller.
function suggest(input={}){
 const today=String(input.today||''),now=clamp(Number(input.nowMinutes)||0,0,1439),uid=String(input.currentUserId||''),defaultDuration=finiteDuration(input.defaultDuration,30);
 const startP=timeMin(input.planningStart||'08:00'),endP=Math.max(startP+60,timeMin(input.planningEnd||'23:00')||1439),learning=input.learning||{},dismissed=new Set((input.dismissed||[]).map(String));
 const tomorrow=String(input.tomorrow||''),weekend=String(input.weekend||''),restHours=clamp(Number(input.nightRestHours)||0,0,12);
 const fb=input.feedback||{},fbKinds=fb.kinds||{},fbSubjects=fb.subjects||{};
 const profile=learn({today,history:input.history});
 const tasks=Array.isArray(input.tasks)?input.tasks:[],live=t=>t&&!t.completed&&!t.deleted&&!t.deleted_at;
 const mine=t=>live(t)&&owned(t)&&String(t.visibility||'private')!=='household';
 const blocksMe=t=>live(t)&&(owned(t)||String(t.assigneeId||t.assignee_id||'')===uid);
 const dur=t=>fixedDuration(t,defaultDuration),cat=t=>String(t?.category||'Personal'),q=s=>'“'+short(s||'Untitled')+'”';
 const round15=n=>Math.ceil(n/15)*15,todayWd=dateParts(today)?weekdayOf(today):0;
 // What you tend to do with each kind of suggestion (last 60 days, counted by the caller).
 const weight=k=>{const f=fbKinds[k]||{},a=Number(f.a)||0,d=Number(f.d)||0;return (a+1)/(a+d+2)};
 const muted=k=>{const f=fbKinds[k]||{};return (Number(f.d)||0)>=5&&!(Number(f.a)||0)};
 const skipSubject=id=>(Number(fbSubjects[String(id)])||0)>=2;
 // When you usually do this task: its own history first (by weekday when there is enough), then its category.
 const usualTime=t=>{const k=profile.byKey[titleKey(t.title)];if(k&&k.n>=3){const w=k.startByWd[todayWd];return w!=null?{min:w,n:k.n,text:'On '+WEEKDAYS[todayWd]+'s you usually do '+q(t.title)+' around '+timeText(w)+'.'}:{min:k.start,n:k.n,text:'You usually do '+q(t.title)+' around '+timeText(k.start)+' ('+k.n+' times).'}}
  const c=profile.byCat[cat(t)];if(c&&c.n>=4)return {min:c.start,n:c.n,text:'You usually do '+cat(t)+' tasks around '+timeText(c.start)+'.'};
  const o=learning[cat(t)];if(o&&o.samples>=3&&Number.isFinite(Number(o.bestTimeMinutes)))return {min:Number(o.bestTimeMinutes),n:o.samples,text:'You usually do '+cat(t)+' tasks around '+timeText(Number(o.bestTimeMinutes))+'. '};return null};
 // Busy: calendar blocks + timed tasks that are mine to do + protected rest after an overnight block.
 const busyRaw=(Array.isArray(input.busy)?input.busy:[]).map(x=>({start:Number(x.start),end:Number(x.end)}));
 const night=busyRaw.find(x=>x.start<=0&&x.end-x.start>=240);
 if(night&&restHours)busyRaw.push({start:0,end:Math.min(1439,night.end+restHours*60)});
 for(const t of tasks)if(blocksMe(t)&&String(t.date||'')===today&&t.time){const s=timeMin(t.time);busyRaw.push({start:s,end:s+dur(t)})}
 const from=Math.max(startP,round15(now+10)),busy=mergeBusy(busyRaw,from,endP),free=gaps(busy,from,endP).filter(g=>g.minutes>=15);
 const taken=[];
 // Today's untimed tasks with their own history hold their usual time; other suggestions avoid it when they can.
 const held=[];for(const t of tasks)if(mine(t)&&String(t.date||'')===today&&!t.time){const k=profile.byKey[titleKey(t.title)];if(k&&k.n>=3){const w=k.startByWd[todayWd],m=w!=null?w:k.start;held.push({id:String(t.id),start:m,end:m+dur(t)})}}
 const slotFor=(t,avoid=[])=>{const hold=held.filter(h=>h.id!==String(t.id)),first=pick(t,avoid.concat(hold));return first||(hold.length?pick(t,avoid):null)};
 const pick=(t,avoid)=>{const d=dur(t),u=usualTime(t),best=u?u.min:null;const opts=[];
  const clear=s=>!taken.concat(avoid).some(x=>s<x.end&&s+d>x.start);
  for(const g of free){let lo=round15(g.start),hi=g.end-d;if(hi<lo)continue;for(let s=lo;s<=hi;s+=15){if(!clear(s))continue;opts.push({start:s,gap:g});break}
   // Nearest free start to when you usually do it (not just the start of the gap).
   if(best!=null){let pick=null;for(let s=lo;s<=hi;s+=15)if(clear(s)&&(pick==null||Math.abs(s-best)<Math.abs(pick-best)))pick=s;if(pick!=null)opts.push({start:pick,gap:g,learned:Math.abs(pick-best)<=60})}}
  if(!opts.length)return null;opts.sort((a,b)=>best!=null?Math.abs(a.start-best)-Math.abs(b.start-best)||a.start-b.start:a.start-b.start);return {...opts[0],usual:u,minutes:d}};
 const cands=[],handled=new Set();
 const add=(s,base,subject)=>{if(dismissed.has(s.key)||muted(s.kind)||(subject&&skipSubject(subject)))return false;s.subject=String(subject||'');cands.push({s,score:base*(0.5+weight(s.kind)),order:cands.length});return true};
 const byPriority=(a,b)=>priority(b)-priority(a)||String(a.date||'').localeCompare(String(b.date||''))||Number(a.createdAt||0)-Number(b.createdAt||0)||String(a.id).localeCompare(String(b.id));
 // 1. Today is over: move the least important flexible task.
 const todayMine=tasks.filter(t=>mine(t)&&String(t.date||'')===today),remaining=todayMine.reduce((n,t)=>n+(t.time&&timeMin(t.time)+dur(t)<=from?0:dur(t)),0);
 const busyCal=mergeBusy((Array.isArray(input.busy)?input.busy:[]).map(x=>({start:Number(x.start),end:Number(x.end)})),from,endP).reduce((n,x)=>n+x.end-x.start,0);
 const overBy=remaining+busyCal-Math.max(0,endP-from);
 if(overBy>=15&&tomorrow){const flex=todayMine.filter(t=>!t.time&&priority(t)<3).sort((a,b)=>priority(a)-priority(b)||dur(b)-dur(a)||String(a.id).localeCompare(String(b.id)))[0];
  if(flex&&add({key:'over:'+flex.id+':'+today,kind:'over',tag:'Busy day',title:'Today is '+humanMinutes(overBy)+' over',why:'Move '+q(flex.title)+' ('+humanMinutes(dur(flex))+') to tomorrow so the rest fits.',actions:[{label:'Move to tomorrow',op:'move',id:String(flex.id),date:tomorrow},...(weekend&&weekend!==tomorrow?[{label:'This weekend',op:'move',id:String(flex.id),date:weekend}]:[])]},100,flex.id))handled.add(String(flex.id))}
 // 2. Slipping: overdue tasks get a real slot today, or a later day.
 for(const t of tasks.filter(t=>mine(t)&&t.date&&String(t.date)<today).sort(byPriority).slice(0,3)){const late=dayDiff(today,String(t.date)),moved=Number(t.deferCount||t.data?.deferCount||0),slot=overBy>=15?null:slotFor(t);
  const why=(moved>=2?'You’ve moved it '+moved+' times. ':'')+(slot?(slot.usual&&slot.learned?slot.usual.text+' ':'')+timeText(slot.start)+' today is free.':'There’s no free time left today.');
  const actions=slot?[{label:'Today '+timeText(slot.start),op:'move',id:String(t.id),date:today,time:timeText(slot.start)},{label:'Tomorrow',op:'move',id:String(t.id),date:tomorrow}]:[{label:'Tomorrow',op:'move',id:String(t.id),date:tomorrow},...(weekend&&weekend!==tomorrow?[{label:'This weekend',op:'move',id:String(t.id),date:weekend}]:[])];
  if(add({key:'late:'+t.id+':'+today,kind:'late',tag:'Slipping',title:q(t.title)+' is '+late+' day'+(late===1?'':'s')+' late',why,actions},90+priority(t)*2,t.id)&&slot)taken.push({start:slot.start,end:slot.start+slot.minutes});handled.add(String(t.id))}
 // 3. Likely to slip: today's tasks you (or tasks like it) usually push back get a firm time, or the day they usually get done.
 if(overBy<15)for(const t of todayMine.filter(t=>!handled.has(String(t.id))&&!(t.time&&timeMin(t.time)<now)).sort(byPriority)){const moved=Number(t.deferCount||t.data?.deferCount||0),k=profile.byKey[titleKey(t.title)],risky=moved>=2||(k&&k.n>=4&&k.slipRate>=0.5);if(!risky)continue;
  const slot=!t.time?slotFor(t):null,actions=[];if(slot)actions.push({label:'Lock in '+timeText(slot.start),op:'move',id:String(t.id),date:today,time:timeText(slot.start)});
  if(k&&k.mostDoneWd>=0&&k.mostDoneWd!==todayWd){const ahead=(k.mostDoneWd-todayWd+7)%7,target=addDaysKey(today,ahead);actions.push({label:'Move to '+WEEKDAYS[k.mostDoneWd].slice(0,3),op:'move',id:String(t.id),date:target})}
  if(!actions.length)continue;
  const why=(moved>=2?'It’s been moved '+moved+' times already. ':'You’ve pushed it back '+Math.round(k.slipRate*k.n)+' of the last '+k.n+' times. ')+(slot?'A set time makes it likelier to happen.':'It usually gets done on '+WEEKDAYS[k.mostDoneWd]+'s.');
  if(add({key:'slip:'+t.id+':'+today,kind:'slip',tag:'Likely to slip',title:q(t.title)+' often gets pushed back',why,actions},80+priority(t),t.id)&&slot)taken.push({start:slot.start,end:slot.start+slot.minutes});handled.add(String(t.id));if(cands.filter(x=>x.s.kind==='slip').length>=2)break}
 // 4. Free slot: today's untimed tasks get a time that fits, near when you usually do them.
 const ownHistory=t=>(profile.byKey[titleKey(t.title)]?.n||0)>=3?0:1;
 if(overBy<15)for(const t of todayMine.filter(t=>!t.time&&!handled.has(String(t.id))).sort((a,b)=>ownHistory(a)-ownHistory(b)||byPriority(a,b)).slice(0,3)){const slot=slotFor(t);if(!slot)continue;const alt=slotFor(t,[{start:slot.start,end:slot.start+slot.minutes+60}]);
  const why=(slot.usual?slot.usual.text+' ':'')+'Free from '+timeText(Math.max(slot.gap.start,from))+' to '+timeText(slot.gap.end)+'.';
  if(add({key:'slot:'+t.id+':'+today,kind:'slot',tag:'Free time',title:'Do '+q(t.title)+' at '+timeText(slot.start),why,actions:[{label:'Add at '+timeText(slot.start),op:'move',id:String(t.id),date:today,time:timeText(slot.start)},...(alt&&alt.start!==slot.start?[{label:timeText(alt.start)+' instead',op:'move',id:String(t.id),date:today,time:timeText(alt.start)}]:[])]},60+priority(t),t.id))taken.push({start:slot.start,end:slot.start+slot.minutes})}
 // 5. Your timings: how long a task (or a kind of task) really takes you, from when you tick timed tasks.
 let durs=0;const notStarted=t=>!(t.time&&timeMin(t.time)<now);
 for(const [k,g] of Object.entries(profile.byKey)){if(durs>=2||!(g.actualN>=3))continue;const hit=todayMine.filter(t=>titleKey(t.title)===k&&notStarted(t)&&Math.abs(dur(t)-g.actual)>=15);if(!hit.length)continue;
  if(add({key:'dur:'+k+':'+today,kind:'duration',tag:'Your timings',title:q(hit[0].title)+' usually takes you '+humanMinutes(g.actual),why:'Timed from the last '+g.actualN+' times you ticked it. It’s planned at '+humanMinutes(dur(hit[0]))+' today.',actions:[{label:'Use '+humanMinutes(g.actual),op:'duration',ids:hit.map(t=>String(t.id)),minutes:g.actual}]},50,'dur:'+k))durs++}
 const catUsual={};for(const [c,g] of Object.entries(profile.byCat))if(g.actualN>=5)catUsual[c]={minutes:g.actual,n:g.actualN};for(const [c,g] of Object.entries(learning))if(!catUsual[c]&&g?.samples>=5)catUsual[c]={minutes:Number(g.usualMinutes),n:g.samples};
 for(const c of Object.keys(catUsual).sort()){if(durs>=2)break;const usual=catUsual[c].minutes,hit=todayMine.filter(t=>cat(t)===c&&notStarted(t)&&!(profile.byKey[titleKey(t.title)]?.actualN>=3)&&Math.abs(dur(t)-usual)>=15);if(!hit.length)continue;
  if(add({key:'dur:'+c+':'+today,kind:'duration',tag:'Your timings',title:c+' tasks take you about '+humanMinutes(usual),why:hit.length+' of today’s '+c+' task'+(hit.length===1?' is':'s are')+' planned at '+humanMinutes(dur(hit[0]))+'. Using your real time keeps the day realistic.',actions:[{label:'Use '+humanMinutes(usual),op:'duration',ids:hit.map(t=>String(t.id)),minutes:usual}]},50,'dur:'+c))durs++}
 // 6. Habits: something you keep adding by hand at a steady rhythm can repeat on its own.
 const openKeys=new Set(tasks.filter(t=>live(t)&&owned(t)).map(t=>titleKey(t.title))),repeating=new Set(tasks.filter(t=>owned(t)&&t.recurrence&&t.recurrence!=='none').map(t=>titleKey(t.title)));
 for(const h of profile.habits){if(openKeys.has(h.key)||repeating.has(h.key))continue;const every=h.unit==='days'?'every day':h.unit==='months'?'every month':h.interval===2?'every 2 weeks':'every week',on=h.unit==='weeks'?' on '+WEEKDAYS[h.weekday]+'s':'';
  add({key:'habit:'+h.key,kind:'habit',tag:'Habit',title:'You do '+q(h.title)+' '+every,why:'Done '+h.times+' times'+on+'. Make it repeat so you don’t have to add it each time.',actions:[{label:'Make it repeat',op:'repeat',id:h.lastId,unit:h.unit,interval:h.interval,weekday:h.weekday}]},45,'habit:'+h.key)}
 // 7. Your week: a coming day with far more planned than you usually finish on that weekday.
 if(profile.usualByWd){const days=[];for(let i=1;i<=6;i++){const d=addDaysKey(today,i),w=weekdayOf(d),planned=tasks.filter(t=>mine(t)&&String(t.date||'')===d),usual=profile.usualByWd[w];days.push({d,w,planned,usual,spare:usual==null?0:usual-planned.length})}
  const heavy=days.filter(x=>x.usual!=null&&x.planned.length>=4&&x.planned.length>=x.usual+3).sort((a,b)=>a.spare-b.spare||a.d.localeCompare(b.d))[0],light=heavy&&days.filter(x=>x.d!==heavy.d&&x.usual!=null&&x.spare>=1).sort((a,b)=>b.spare-a.spare||a.d.localeCompare(b.d))[0];
  const move=light&&heavy.planned.filter(t=>!t.time&&priority(t)<3).sort((a,b)=>priority(a)-priority(b)||String(a.id).localeCompare(String(b.id)))[0];
  if(move)add({key:'week:'+heavy.d,kind:'week',tag:'Your week',title:WEEKDAYS[heavy.w]+' looks heavy',why:heavy.planned.length+' tasks planned. You usually finish about '+heavy.usual+' on '+WEEKDAYS[heavy.w]+'s, and '+WEEKDAYS[light.w]+' is lighter.',actions:[{label:'Move '+q(move.title)+' to '+WEEKDAYS[light.w].slice(0,3),op:'move',id:String(move.id),date:light.d}]},55,move.id)}
 const out=cands.sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,5).map(x=>x.s);
 return {engineVersion:VERSION,date:today,overBy:Math.max(0,overBy),suggestions:out};
}
// Smart quick add (6.2): reads a typed task such as "Call mum tomorrow 6pm 20m" into its parts.
// Pure: today comes from the caller. Anything listed in `ignore` (a part the user tapped away) is left in the title.
const MONTH_RE='(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthNum=s=>['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(String(s).slice(0,3).toLowerCase())+1;
const MONTH_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WD_FULL={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6},WD_ANY={...WD_FULL,sun:0,mon:1,tue:2,tues:2,wed:3,weds:3,thu:4,thur:4,thurs:4,fri:5,sat:6};
const WD_RE='(sunday|monday|tuesday|wednesday|thursday|friday|saturday)',WD_ANY_RE='(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat)';
const validKey=(y,m,d)=>{const k=y+'-'+pad(m)+'-'+pad(d);return y>=2000&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=31&&fromSerial(serial(k))===k?k:''};
const nextWeekday=(today,w,allowToday)=>{const diff=(w-weekdayOf(today)+7)%7;return addDaysKey(today,diff===0&&!allowToday?7:diff)};
const addMonthsKey=(k,n)=>{const p=dateParts(k);let y=p[0],m=p[1]+n;y+=Math.floor((m-1)/12);m=((m-1)%12+12)%12+1;let d=p[2];while(d>28&&!validKey(y,m,d))d--;return validKey(y,m,d)};
function parseQuick(text,opt={}){
 const original=String(text||''),today=String(opt.today||'');if(!dateParts(today))return {title:original.trim(),date:'',time:'',minutes:0,priority:'',category:'',repeat:null,parts:[]};
 const ignore=new Set((opt.ignore||[]).map(String)),cats=(Array.isArray(opt.categories)&&opt.categories.length?opt.categories:['Personal','Work','Home','Health','Finance','Errands']).map(String);
 let s=' '+original.replace(/\s+/g,' ')+' ';
 const r={date:'',time:'',minutes:0,priority:'',category:'',repeat:null};
 // Find `re`; if fn accepts the match, cut it out of the text. Returns fn's value or null.
 const take=(kind,re,fn)=>{if(ignore.has(kind))return null;const m=s.match(re);if(!m)return null;const v=fn(m);if(v===false||v==null)return null;s=s.slice(0,m.index)+' '+s.slice(m.index+m[0].length);return v};
 // #category
 const c=take('category',/#([a-z][\w-]*)/i,m=>cats.find(x=>x.toLowerCase()===m[1].toLowerCase())||false);if(c)r.category=c;
 // priority
 const p=take('priority',/(?:!\s*|\bpriority\s+)(high|low)\b|\b(high|low)\s+priority\b|\b(urgent|asap)\b|\s(high|low)\s*$/i,m=>String(m[1]||m[2]||m[4]||'high').toLowerCase());if(p)r.priority=p;
 // duration: "20m", "1h", "1h30", "1.5 hours", "for 45 mins", "an hour", "half an hour"
 let mins=take('duration',/\b(?:for\s+)?(\d{1,2}(?:\.\d+)?)\s*(?:h|hrs?|hours?)(?![a-z])(?:\s*(?:and\s+)?(\d{1,2})\s*(?:m|mins?|minutes?)?(?![a-z\d]))?/i,m=>Math.round(Number(m[1])*60)+Number(m[2]||0));
 if(mins==null)mins=take('duration',/\b(?:for\s+)?(\d{1,3})\s*(?:m|mins?|minutes?)(?![a-z])/i,m=>Number(m[1]));
 if(mins==null)mins=take('duration',/\b(?:for\s+)?(an hour and a half|half an hour|(?:a\s+)?quarter of an hour|an hour)\b/i,m=>({'an hour and a half':90,'half an hour':30,'an hour':60})[m[1].toLowerCase()]||15);
 if(mins!=null)r.minutes=clamp(mins,5,720);
 // repeats
 const ord={first:1,second:2,third:3,fourth:4,fifth:5,last:-1};
 let rep=take('repeat',new RegExp('\\b(?:on\\s+the\\s+)?(first|second|third|fourth|fifth|last)\\s+'+WD_RE+'\\s+(?:of\\s+)?(?:every|each)\\s+month\\b|\\b(?:every|each)\\s+month\\s+on\\s+the\\s+(first|second|third|fourth|fifth|last)\\s+'+WD_RE+'\\b|\\b(?:on\\s+the\\s+)?(first|second|third|fourth|fifth|last)\\s+'+WD_RE+'\\s+monthly\\b','i'),m=>({type:'custom',unit:'months',interval:1,monthlyMode:'ordinal',ordinal:ord[(m[1]||m[3]||m[5]).toLowerCase()],weekday:WD_FULL[(m[2]||m[4]||m[6]).toLowerCase()],label:'Monthly on the '+(m[1]||m[3]||m[5]).toLowerCase()+' '+WEEKDAYS[WD_FULL[(m[2]||m[4]||m[6]).toLowerCase()]]}));
 if(!rep)rep=take('repeat',/\b(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:every|each)\s+month\b|\b(?:every|each)\s+month\s+(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i,m=>{const d=clamp(Number(m[1]||m[2]),1,31);return {type:'monthly',unit:'months',interval:1,monthlyMode:'day',monthDay:d,label:'Monthly on the '+d+(d%10===1&&d!==11?'st':d%10===2&&d!==12?'nd':d%10===3&&d!==13?'rd':'th')}});
 if(!rep)rep=take('repeat',new RegExp('\\b(?:every|each)\\s+(?:other|second|2nd)\\s+'+WD_ANY_RE+'s?\\b','i'),m=>{const w=WD_ANY[m[1].toLowerCase()];return {type:'custom',unit:'weeks',interval:2,weekdays:[w],label:'Every other '+WEEKDAYS[w]}});
 if(!rep)rep=take('repeat',/\b(?:every|each)\s+(\d{1,2}|other|second|2nd)\s+(day|week|month)s?\b/i,m=>{const n=/^\d+$/.test(m[1])?clamp(Number(m[1]),1,99):2,u=m[2].toLowerCase()+'s';return {type:'custom',unit:u,interval:n,label:'Every '+n+' '+u}});
 if(!rep)rep=take('repeat',/\bfortnightly\b/i,()=>({type:'custom',unit:'weeks',interval:2,label:'Every 2 weeks'}));
 if(!rep)rep=take('repeat',/\b(?:every\s+weekdays?|weekdays|mon(?:day)?\s*(?:-|to)\s*fri(?:day)?)\b/i,()=>({type:'weekdays',unit:'weeks',interval:1,weekdays:[1,2,3,4,5],label:'Weekdays'}));
 if(!rep)rep=take('repeat',/\b(?:daily|every\s+day|each\s+day|every\s+morning|every\s+night|every\s+evening)\b/i,m=>({type:'daily',unit:'days',interval:1,label:'Every day',partOfDay:(m[0].match(/morning|night|evening/i)||[''])[0].toLowerCase()}));
 if(!rep)rep=take('repeat',new RegExp('\\b(?:every|each)\\s+((?:'+WD_ANY_RE+'s?(?:\\s*(?:,|and|&|\\+)\\s*|\\s+(?='+WD_ANY_RE+')))*'+WD_ANY_RE+'s?)\\b','i'),m=>{const days=[];for(const w of m[1].toLowerCase().split(/[^a-z]+/))if(w&&WD_ANY[w.replace(/s$/,'')]!=null)days.push(WD_ANY[w.replace(/s$/,'')]);else if(w&&WD_ANY[w]!=null)days.push(WD_ANY[w]);const u=[...new Set(days)].sort((a,b)=>a-b);if(!u.length)return false;return {type:u.length===1?'weekly':'custom',unit:'weeks',interval:1,weekdays:u,label:u.length===1?'Every '+WEEKDAYS[u[0]]:'Every '+u.map(w=>WEEKDAYS[w].slice(0,3)).join(', ')}});
 if(!rep)rep=take('repeat',/\b(?:weekly|every\s+week|each\s+week)\b/i,()=>({type:'weekly',unit:'weeks',interval:1,label:'Every week'}));
 if(!rep)rep=take('repeat',/\b(?:monthly|every\s+month|each\s+month)\b/i,()=>({type:'monthly',unit:'months',interval:1,monthlyMode:'day',label:'Every month'}));
 if(rep)r.repeat=rep;
 // time
 const bad=i=>/[£$€\d.,]/.test(s[i-1]||''),dayStart=timeMin(opt.planningStart||'08:00')||480,bare=h=>h>=1&&h<=11&&h*60<dayStart?h+12:h;
 let tm=take('time',/(?:\bat\s+|@\s*|\b)(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i,m=>{let h=Number(m[1])%12;if(/^p/i.test(m[3]))h+=12;return pad(h)+':'+pad(Number(m[2]||0))});
 if(!tm)tm=take('time',/(?:\bat\s+|@\s*|\b)([01]?\d|2[0-3])[:.]([0-5]\d)\b(?![.,]?\d)/,m=>bad(m.index+(m[0].length-m[0].trimStart().length))&&!/^(?:\s*at|@)/i.test(m[0])?false:pad(/^0/.test(m[1])?Number(m[1]):bare(Number(m[1])))+':'+m[2]);
 if(!tm)tm=take('time',/\b(?:at\s+)?(noon|midday|midnight)\b/i,m=>/midnight/i.test(m[1])?'00:00':'12:00');
 if(!tm)tm=take('time',/\bat\s+(\d{1,2})\b(?![:.]\d|\s*(?:%|am|pm|a\.m|p\.m|h|hrs?|hours?|m|mins?|minutes?|st|nd|rd|th)\b)/i,m=>{const h=Number(m[1]);if(h>23)return false;return pad(bare(h))+':00'});
 if(tm)r.time=tm;
 // parts of the day: "tonight", "this evening", "tomorrow morning" (only next to a day word, so "Morning run" stays a title)
 const PART={morning:'09:00',afternoon:'14:00',evening:'19:00',night:'20:00'};
 if(!ignore.has('time')&&!r.time){const m=s.match(new RegExp('\\b(this\\s+|in\\s+the\\s+|(?:on\\s+|next\\s+)?(today|tomorrow|tmrw|'+WD_ANY_RE.slice(1,-1)+')\\s+)(morning|afternoon|evening|night)\\b','i'));
  if(m){r.time=PART[m[3].toLowerCase()];const day=(m[2]||'').toLowerCase();let keep='';
   if(day&&WD_ANY[day]!=null&&!ignore.has('date')&&!r.date)r.date=nextWeekday(today,WD_ANY[day],false);else if(day)keep=day+' ';
   s=s.slice(0,m.index)+' '+keep+s.slice(m.index+m[0].length)}}
 if(!ignore.has('time')&&!r.time&&rep&&rep.partOfDay){r.time=PART[rep.partOfDay]}
 if(!ignore.has('date')||!ignore.has('time')){const m=s.match(/\btonight\b/i);if(m){if(!ignore.has('time')&&!r.time)r.time='19:00';if(!ignore.has('date'))r.date=today;s=s.slice(0,m.index)+' '+s.slice(m.index+m[0].length)}}
 // dates
 const dateRules=[
  [/\b(?:the\s+)?day\s+after\s+tomorrow\b/i,()=>addDaysKey(today,2)],
  [/\b(?:on\s+)?(?:tomorrow|tmrw|tmr|tomoz)\b/i,()=>addDaysKey(today,1)],
  [/\b(?:on\s+)?today\b/i,()=>today],
  [/\bin\s+(\d{1,3}|a|an|one|two|three|four|five|six)\s+(day|week|month|fortnight)s?\b/i,m=>{const n=({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6})[m[1].toLowerCase()]||Number(m[1]),u=m[2].toLowerCase();return u==='month'?addMonthsKey(today,n):addDaysKey(today,n*(u==='day'?1:u==='week'?7:14))}],
  [/\bnext\s+weekend\b/i,()=>{const w=weekdayOf(today);return addDaysKey(today,w===6?7:w===0?6:6-w+7)}],
  [/\b(?:this\s+|at\s+the\s+|on\s+the\s+)?weekend\b/i,()=>{const w=weekdayOf(today);return w===6||w===0?today:addDaysKey(today,6-w)}],
  [/\bnext\s+week\b/i,()=>addDaysKey(today,((8-weekdayOf(today))%7)||7)],
  [/\bnext\s+month\b/i,()=>{const p=dateParts(addMonthsKey(today,1));return validKey(p[0],p[1],1)}],
  [/\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?month\b/i,()=>{const p=dateParts(addMonthsKey(today,1));return addDaysKey(validKey(p[0],p[1],1),-1)}],
  [new RegExp('\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?'+MONTH_RE+'\\b(?:,?\\s+(\\d{4}))?','i'),m=>abs(m[3],monthNum(m[2]),Number(m[1]))],
  [new RegExp('\\b(?:on\\s+)?'+MONTH_RE+'\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?','i'),m=>abs(m[3],monthNum(m[1]),Number(m[2]))],
  [/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/,m=>abs(m[3]?(m[3].length===2?'20'+m[3]:m[3]):'',Number(m[2]),Number(m[1]))],
  [/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i,m=>{const p=dateParts(today),d=Number(m[1]);for(let i=0;i<3;i++){const k=validKey(dateParts(addMonthsKey(validKey(p[0],p[1],1),i))[0],dateParts(addMonthsKey(validKey(p[0],p[1],1),i))[1],d);if(k&&k>=today)return k}return false}],
  [new RegExp('\\b(?:on\\s+|this\\s+|next\\s+|by\\s+)?'+WD_RE+'\\b','i'),m=>nextWeekday(today,WD_FULL[m[1].toLowerCase()],/^this/i.test(m[0].trim()))],
  [/\b(?:on|this|next|by)\s+(sun|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat)\b/i,m=>nextWeekday(today,WD_ANY[m[1].toLowerCase()],/^this/i.test(m[0].trim()))]];
 function abs(y,m,d){if(y)return validKey(Number(y),m,d)||false;const p=dateParts(today);const k=validKey(p[0],m,d);if(!k)return false;return k>=today?k:(validKey(p[0]+1,m,d)||false)}
 if(!r.date)for(const [re,fn] of dateRules){const v=take('date',re,fn);if(v){r.date=v;break}}
 // A repeat with no date starts on its next matching day (today counts).
 if(rep&&!r.date&&!ignore.has('date')&&rep.unit==='months'){const p=dateParts(today),first=validKey(p[0],p[1],1);for(let i=0;i<14&&!r.date;i++){const mp=dateParts(addMonthsKey(first,i));let k='';
   if(rep.monthlyMode==='ordinal'){const days=[];for(let d=1;d<=31;d++){const kk=validKey(mp[0],mp[1],d);if(kk&&weekdayOf(kk)===rep.weekday)days.push(kk)}k=rep.ordinal===-1?days[days.length-1]:days[rep.ordinal-1]||''}
   else if(rep.monthDay){k=validKey(mp[0],mp[1],rep.monthDay);if(!k){let d=rep.monthDay;while(d>28&&!k)k=validKey(mp[0],mp[1],--d)}}
   if(k&&k>=today)r.date=k;if(!rep.monthDay&&rep.monthlyMode!=='ordinal')break}}
 if(rep&&!r.date&&!ignore.has('date')&&Array.isArray(rep.weekdays)&&rep.type!=='weekdays'){let best='';for(const w of rep.weekdays){const k=nextWeekday(today,w,true);if(!best||k<best)best=k}r.date=best}
 // Title: what is left, without dangling "at", "on", "for"…
 let title=s.replace(/\s+/g,' ').trim(),prev='';while(prev!==title){prev=title;title=title.replace(/^(?:at|on|by|for|in|from|every|each|the|and|,|-|–|—)\s+/i,'').replace(/\s+(?:at|on|by|for|in|from|every|each|the|and)$/i,'').replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g,'').trim()}
 const parts=[],dd=r.date?dayDiff(r.date,today):null;
 if(r.date){const p=dateParts(r.date),wd=WEEKDAYS[weekdayOf(r.date)];parts.push({kind:'date',label:dd===0?'Today':dd===1?'Tomorrow':dd>1&&dd<7?wd:wd.slice(0,3)+' '+p[2]+' '+MONTH_SHORT[p[1]-1]+(p[0]!==dateParts(today)[0]?' '+p[0]:'')})}
 if(r.time)parts.push({kind:'time',label:r.time});
 if(r.minutes)parts.push({kind:'duration',label:humanMinutes(r.minutes)});
 if(r.repeat)parts.push({kind:'repeat',label:r.repeat.label});
 if(r.priority)parts.push({kind:'priority',label:r.priority==='high'?'High priority':r.priority==='low'?'Low priority':r.priority});
 if(r.category)parts.push({kind:'category',label:r.category});
 return {title,...r,parts};
}
window.PlanlyIntelligence=Object.freeze({version:VERSION,analyse,suggest,learn,parseQuick,titleKey});})();
