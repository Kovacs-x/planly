import fs from 'node:fs';
const source=fs.readFileSync('v2/core-intelligence-v5.js','utf8'),window={};new Function('window',source)(window);const api=window.PlanlyIntelligence;if(!api?.analyse)throw Error('Intelligence analyse API missing');
if(/Date\s*\.|new\s+Date|Date\.now|Math\.random|fetch\s*\(|\.from\s*\(|document\.|localStorage/.test(source))throw Error('Engine purity regression');
const base={today:'2026-09-30',nowMinutes:480,planningStart:'08:00',planningEnd:'18:00',currentUserId:'me',defaultDuration:30,projects:[{id:'p1',dueDate:'2026-10-01'}],busy:[{start:600,end:660}],tasks:[
{id:'personal',title:'Personal',date:'2026-09-30',priority:'high',durationMinutes:45,completed:false,visibility:'private',createdAt:1},
{id:'overdue',title:'Overdue',date:'2026-09-28',priority:'normal',durationMinutes:30,completed:false,visibility:'private',createdAt:2},
{id:'chore',title:'Chore',date:'2026-09-30',priority:'high',durationMinutes:30,completed:false,visibility:'household',assigneeId:'me',createdAt:3},
{id:'partner',title:'Partner',date:'2026-09-30',priority:'high',durationMinutes:30,completed:false,visibility:'household',assigneeId:'me',_planlyOwnedByMe:false,createdAt:4}
]};
const a=api.analyse(base),b=api.analyse(JSON.parse(JSON.stringify(base)));if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Engine not deterministic');
if(a.top3.some(x=>x.id==='chore'||x.id==='partner'))throw Error('D1 household task leaked into Top 3');
if(!a.chores.some(x=>x.id==='chore'))throw Error('Owned assigned household chore missing');
if(a.overdue.some(x=>x.id==='partner')||a.times.some(x=>x.id==='partner'))throw Error('Partner-owned task became actionable');
if(Object.keys(base.busy[0]).sort().join(',')!=='end,start')throw Error('Busy fixture contains private calendar metadata');
const work=api.analyse({...base,busy:[{start:480,end:900}],tasks:base.tasks.filter(x=>x.id!=='partner')});if(!work.day.isWorkDay||work.top3.length>2)throw Error('D2 work-day priority limit failed');
const overload=api.analyse({...base,tasks:[{id:'x',date:'2026-09-30',visibility:'private',durationMinutes:700,completed:false}]});if(overload.day.status!=='over'||overload.day.overBy<=0)throw Error('Capacity overload failed');
const clash=api.analyse({...base,tasks:[{id:'x',date:'2026-09-30',time:'10:15',visibility:'private',durationMinutes:30,completed:false}]});if(!clash.day.clashes.some(x=>x.b==='calendar'))throw Error('Calendar clash failed');
const late=api.analyse({...base,nowMinutes:900,busy:[],tasks:[{id:'x',date:'2026-09-30',visibility:'private',durationMinutes:30,completed:false}]});if(late.times.some(x=>x.time&&Number(x.time.slice(0,2))*60+Number(x.time.slice(3))<900))throw Error('Past time suggested');
console.log('Planly Intelligence core checks passed');
const seconds=api.analyse({...base,planningStart:'08:00:00',planningEnd:'18:00:00'});if(seconds.day.planningMinutes!==600)throw Error('HH:MM:SS planning hours failed');
const cross=api.analyse({...base,tasks:[{id:'target',date:'2026-09-30',visibility:'private',priority:'normal',completed:false},{id:'old',date:'2026-09-29',visibility:'private',priority:'high',completed:false},{id:'future',date:'2026-10-01',visibility:'private',priority:'high',completed:false}]});if(cross.top3.some(x=>x.id!=='target'))throw Error('Cross-day task leaked into Top 3');
const tomorrow=api.analyse({...base,today:'2026-10-01',realToday:'2026-09-30',nowMinutes:480,tasks:[{id:'todayOld',date:'2026-09-30',visibility:'private',completed:false},{id:'target',date:'2026-10-01',visibility:'private',completed:false}]});if(tomorrow.overdue.some(x=>x.id==='todayOld')||!tomorrow.leftToday.some(x=>x.id==='todayOld'&&x.reasons.includes('Not done yet today'))||tomorrow.top3.some(x=>x.id==='todayOld'))throw Error('Tomorrow left-today semantics failed');
const night=api.analyse({...base,busy:[{start:0,end:480}],prefs:{nightRest:true},tasks:[{id:'a',date:'2026-09-30',visibility:'private',completed:false},{id:'b',date:'2026-09-30',visibility:'private',completed:false},{id:'c',date:'2026-09-30',visibility:'private',completed:false}]});if(!night.day.overnightRest||night.top3.length>2)throw Error('Night-shift rest reduction failed');

const rest8=api.analyse({...base,nowMinutes:480,busy:[{start:0,end:480}],prefs:{nightRest:true,nightRestHours:8},tasks:[{id:'a',date:'2026-09-30',visibility:'private',completed:false,durationMinutes:30}]});if(rest8.times.some(x=>x.time&&Number(x.time.slice(0,2))*60+Number(x.time.slice(3))<960))throw Error('8h night rest suggested too early');
const rest12=api.analyse({...base,nowMinutes:480,busy:[{start:0,end:480}],prefs:{nightRest:true,nightRestHours:12},tasks:[{id:'a',date:'2026-09-30',visibility:'private',completed:false,durationMinutes:30}]});if(rest12.times.some(x=>x.time&&Number(x.time.slice(0,2))*60+Number(x.time.slice(3))<1200))throw Error('12h night rest suggested too early');
if(!rest8.day.overnightRest||rest8.day.restUntil!=='16:00'||rest12.day.restUntil!=='20:00')throw Error('Night rest metadata failed');

if(api.version!=='5.0.0-i5')throw Error('I3 engine version mismatch');
const weighted=api.analyse({...base,tasks:[{id:'weighted',title:'Weighted',date:'2026-09-28',priority:'high',durationMinutes:30,completed:false,visibility:'private',createdAt:1,deferCount:3}]});
const weightedRow=weighted.overdue.find(x=>x.id==='weighted');if(!weightedRow||!Array.isArray(weightedRow.factors)||!weightedRow.factors.some(x=>x.text==='Overdue 2 days'&&x.points===110)||!weightedRow.factors.some(x=>x.text==='High priority'&&x.points===45)||!weightedRow.factors.some(x=>x.text==='Moved 3 times'&&x.points===-15))throw Error('I2 real weighted factors missing');
if(weightedRow.suggest!=='inbox'||!weightedRow.reasons.includes('Moved 3 times'))throw Error('I2 deferCount overdue recommendation failed');
const mapScaleTasks=Array.from({length:500},(_,i)=>({id:'scale-'+i,date:'2026-09-30',priority:i%7===0?'high':'normal',durationMinutes:30,completed:false,visibility:'private',createdAt:i+1}));
const scaled=api.analyse({...base,tasks:mapScaleTasks});if(!scaled.top3.length||scaled.top3.some(x=>!Array.isArray(x.factors)))throw Error('I2 scaled ranking/factors failed');
console.log('Planly Intelligence I2 weighted checks passed');

const i3=api.analyse({...base,projects:[{id:'p1',name:'Project',dueDate:'2026-10-02'}],tasks:[{id:'p-task',projectId:'p1',date:'',priority:'high',durationMinutes:30,completed:false,visibility:'private',createdAt:1}]});const ps=i3.projects.find(x=>x.id==='p1');if(api.version!=='5.0.0-i5'||!ps||ps.status!=='behind'||ps.nextStepId!=='p-task')throw Error('I3 project signal failed');console.log('Planly Intelligence I3 project checks passed');

const i3Boundary=api.analyse({...base,projects:[{id:'shared',name:'Shared'}],tasks:[{id:'hh-owned',projectId:'shared',date:'',completed:false,visibility:'household',_planlyOwnedByMe:true},{id:'hh-partner',projectId:'shared',date:'',completed:false,visibility:'household',_planlyOwnedByMe:false}]});const pb=i3Boundary.projects.find(x=>x.id==='shared');if(!pb||pb.nextStepId||pb.status!=='not-scheduled')throw Error('I3 household task leaked into personal project action');
const i3OnTrack=api.analyse({...base,projects:[{id:'p2',name:'Scheduled'}],tasks:[{id:'scheduled',projectId:'p2',date:'2026-10-01',completed:false,visibility:'private',_planlyOwnedByMe:true}]});if(i3OnTrack.projects.find(x=>x.id==='p2')?.status!=='on-track')throw Error('I3 scheduled project status failed');

const doneProject=api.analyse({...base,projects:[{id:'done',name:'Done'}],tasks:[{id:'done-task',projectId:'done',completed:true,visibility:'private'}]}).projects.find(x=>x.id==='done');if(doneProject?.status!=='done')throw Error('I3 completed project status failed');
const sharedActive=api.analyse({...base,projects:[{id:'shared2',name:'Shared'}],tasks:[{id:'shared-task',projectId:'shared2',completed:false,visibility:'household',_planlyOwnedByMe:false}]}).projects.find(x=>x.id==='shared2');if(sharedActive?.status!=='not-scheduled'||sharedActive?.nextStepId)throw Error('I3 shared status/action split failed');
const emptyProject=api.analyse({...base,projects:[{id:'empty',name:'Empty',dueDate:'2026-10-20'}],tasks:[]}).projects.find(x=>x.id==='empty');if(emptyProject?.status!=='empty'||!emptyProject.reasons.includes('No tasks yet'))throw Error('F3 project with no tasks must read No tasks yet');
const inboxWeek=api.analyse({...base,tasks:[{id:'inbox-week',title:'Inbox',date:'',completed:false,visibility:'private',priority:'high'}]});if(!inboxWeek.weekCandidates.some(x=>x.id==='inbox-week'))throw Error('I3 Inbox missing from week candidates');

const i4=api.analyse({...base,today:'2026-10-01',weekStart:'2026-09-28',weekEnd:'2026-10-04',members:[{id:'me'},{id:'partner'}],tasks:[{id:'done-me',visibility:'household',completed:true,completedBy:'me',completedDate:'2026-09-29'},{id:'done-partner',visibility:'household',completed:true,completedBy:'partner',completedDate:'2026-09-30'},{id:'owned-free',visibility:'household',completed:false,date:'2026-10-02',_planlyOwnedByMe:true},{id:'partner-free',visibility:'household',completed:false,date:'2026-10-03',_planlyOwnedByMe:false},{id:'shift',visibility:'household',completed:false,date:'2026-10-02',assigneeId:'partner',durationMinutes:480,_planlyOwnedByMe:false}]});if(i4.household.weekCounts.me!==1||i4.household.weekCounts.partner!==1)throw Error('I4 completion attribution counts failed');if(i4.household.unassigned.length!==2)throw Error('I4 unassigned count failed');if(i4.household.shareOut.length!==1||i4.household.shareOut[0].id!=='owned-free')throw Error('I4 share out crossed ownership boundary');if(i4.household.longShifts.length!==1||i4.household.longShifts[0].id!=='shift')throw Error('I4 shared long-block signal failed');console.log('Planly Intelligence I4 household checks passed');

const tie=api.analyse({...base,today:'2026-10-01',weekStart:'2026-09-28',weekEnd:'2026-10-04',members:[{id:'a'},{id:'b'}],tasks:[{id:'free',visibility:'household',completed:false,date:'2026-10-02',_planlyOwnedByMe:true}]});if(tie.household.shareOut.length)throw Error('I5 equal household loads must remain Anyone');console.log('Planly Intelligence I5 tie check passed');

const learned=api.analyse({...base,today:'2026-10-01',realToday:'2026-10-01',nowMinutes:540,planningStart:'09:00',planningEnd:'09:45',busy:[],learning:{Health:{usualMinutes:45,bestTimeMinutes:600,samples:3}},tasks:[{id:'learned-fit',title:'Health task',category:'Health',date:'2026-10-01',durationMinutes:60,priority:'normal',_planlyOwnedByMe:true}]});if(learned.day.plannedMinutes!==45)throw Error('I5 learned duration not used in capacity maths');const lt=learned.times.find(x=>x.id==='learned-fit');if(!lt||lt.time!=='09:00'||!lt.reasons.some(x=>x.includes('Usually takes you ~45m')))throw Error('I5 learned duration/reason not used in suggested time');const plain=api.analyse({...base,today:'2026-10-01',realToday:'2026-10-01',nowMinutes:540,planningStart:'09:00',planningEnd:'09:45',busy:[],tasks:[{id:'plain-fit',title:'Health task',category:'Health',date:'2026-10-01',durationMinutes:60,priority:'normal',_planlyOwnedByMe:true}]});if(plain.day.plannedMinutes!==60||plain.times.find(x=>x.id==='plain-fit')?.time)throw Error('I5 no-history baseline changed');console.log('Planly Intelligence I5 learned planning fixture passed');

// Stage 4 correctness regression fixtures.
const fixedLearned=api.analyse({...base,today:'2026-10-01',realToday:'2026-10-01',nowMinutes:480,planningStart:'08:00',planningEnd:'12:00',learning:{Health:{usualMinutes:30,bestTimeMinutes:600,samples:3}},tasks:[{id:'fixed',title:'Fixed health',category:'Health',date:'2026-10-01',time:'09:00',durationMinutes:60,priority:'normal',_planlyOwnedByMe:true}]});if(fixedLearned.day.plannedMinutes!==60)throw Error('Stage4 fixed-time learned duration changed planned occupancy');const fixedClash=api.analyse({...base,today:'2026-10-01',realToday:'2026-10-01',nowMinutes:480,planningStart:'08:00',planningEnd:'12:00',busy:[{start:570,end:585}],learning:{Health:{usualMinutes:30,bestTimeMinutes:600,samples:3}},tasks:[{id:'fixed-clash',title:'Fixed health',category:'Health',date:'2026-10-01',time:'09:00',durationMinutes:60,priority:'normal',_planlyOwnedByMe:true}]});if(!fixedClash.day.clashes.some(x=>x.a==='fixed-clash'&&x.b==='calendar'))throw Error('Stage4 fixed-time interval was shortened by learning');const malformed=api.analyse({...base,today:'2026-10-01',realToday:'2026-10-01',nowMinutes:480,planningStart:'08:00',planningEnd:'12:00',defaultDuration:35,tasks:[{id:'bad-duration',title:'Bad duration',date:'2026-10-01',durationMinutes:'oops',priority:'normal',_planlyOwnedByMe:true}]});if(!Number.isFinite(malformed.day.plannedMinutes)||malformed.day.plannedMinutes!==35)throw Error('Stage4 malformed duration fallback failed');const restTop=api.analyse({...base,today:'2026-10-01',realToday:'2026-10-01',nowMinutes:480,planningStart:'08:00',planningEnd:'23:00',busy:[{start:60,end:420}],prefs:{nightRest:true,nightRestHours:8},tasks:[1,2,3].map(i=>({id:'rest-'+i,title:'Rest '+i,date:'2026-10-01',priority:'high',_planlyOwnedByMe:true}))});if(restTop.top3.length>2)throw Error('Stage4 protected-rest Top 3 must be limited to two');console.log('Planly Stage4 correctness fixtures passed');
// ---- Suggestions (6.0) ----
{const S=api.suggest;if(typeof S!=='function')throw Error('suggest() missing');
const t=(id,o={})=>({id,title:id,date:'2026-10-05',priority:'normal',durationMinutes:30,completed:false,visibility:'private',category:'Personal',createdAt:1,...o});
const base={today:'2026-10-05',tomorrow:'2026-10-06',weekend:'2026-10-10',nowMinutes:9*60,planningStart:'08:00',planningEnd:'22:00',currentUserId:'me',defaultDuration:30,busy:[{start:600,end:720}],learning:{},dismissed:[],nightRestHours:0};
const keys=r=>r.suggestions.map(x=>x.key);
const a=S({...base,tasks:[t('call')]}),b=S(JSON.parse(JSON.stringify({...base,tasks:[t('call')]})));if(JSON.stringify(a)!==JSON.stringify(b))throw Error('suggest not deterministic');
// free slot: after now (09:00 → first 15-min boundary after now+10 = 09:15), avoiding the 10:00–12:00 busy block
const slot=a.suggestions.find(x=>x.kind==='slot');if(!slot||slot.actions[0].time!=='09:15'||slot.actions[0].op!=='move'||slot.actions[0].date!=='2026-10-05')throw Error('free slot wrong: '+JSON.stringify(a.suggestions));
const crowded=S({...base,nowMinutes:9*60+50,tasks:[t('call',{durationMinutes:60})]});if(crowded.suggestions[0]?.actions[0].time!=='12:00')throw Error('slot must skip busy block: '+JSON.stringify(crowded.suggestions));
// timed tasks block slots too
const timed=S({...base,tasks:[t('call'),t('meet',{time:'09:15',durationMinutes:45})]});if(timed.suggestions.find(x=>x.kind==='slot').actions[0].time!=='12:00')throw Error('slot must avoid timed task: '+JSON.stringify(timed.suggestions));
// learned best time is preferred when there are enough samples
const learned=S({...base,learning:{Personal:{usualMinutes:30,bestTimeMinutes:18*60+30,samples:4}},tasks:[t('call')]}),ls=learned.suggestions[0];if(ls.actions[0].time!=='18:30'||!/usually do Personal tasks around 18:30/.test(ls.why))throw Error('learned time not used: '+JSON.stringify(ls));
// never suggest household, partner-owned or completed tasks
const scoped=S({...base,tasks:[t('chore',{visibility:'household',assigneeId:'me'}),t('theirs',{_planlyOwnedByMe:false}),t('done',{completed:true})]});if(scoped.suggestions.length)throw Error('suggest leaked non-own task: '+keys(scoped));
// slipping: overdue task gets today's free slot; repeated moves are explained
const late=S({...base,tasks:[t('insurance',{date:'2026-10-04',deferCount:2})]}),l=late.suggestions[0];if(l.kind!=='late'||!/1 day late/.test(l.title)||!/moved it 2 times/.test(l.why)||l.actions[0].date!=='2026-10-05'||!l.actions[0].time||l.actions[1].date!=='2026-10-06')throw Error('late suggestion wrong: '+JSON.stringify(l));
// overload: day over → move the least important untimed task; no slot suggestions while over
const over=S({...base,nowMinutes:20*60,tasks:[t('a',{durationMinutes:90,priority:'high'}),t('b',{durationMinutes:60,priority:'low'}),t('c',{durationMinutes:30})]});
if(over.suggestions[0]?.kind!=='over'||over.suggestions[0].actions[0].id!=='b'||over.suggestions[0].actions[0].date!=='2026-10-06'||over.suggestions.some(x=>x.kind==='slot'))throw Error('overload wrong: '+JSON.stringify(over));
// durations: only with ≥5 samples and a real difference
const d5=S({...base,learning:{Work:{usualMinutes:45,bestTimeMinutes:600,samples:5}},tasks:[t('w1',{category:'Work',time:'13:00'}),t('w2',{category:'Work',time:'14:00'})]});const ds=d5.suggestions.find(x=>x.kind==='duration');if(!ds||ds.actions[0].minutes!==45||ds.actions[0].ids.length!==2)throw Error('duration suggestion wrong: '+JSON.stringify(d5.suggestions));
if(S({...base,learning:{Work:{usualMinutes:45,bestTimeMinutes:600,samples:4}},tasks:[t('w1',{category:'Work',time:'13:00'})]}).suggestions.some(x=>x.kind==='duration'))throw Error('duration suggestion needs 5 samples');
// dismissed suggestions stay hidden; at most 5
if(S({...base,dismissed:[slot.key],tasks:[t('call')]}).suggestions.length)throw Error('dismissed suggestion returned');
if(S({...base,tasks:['a','b','c','d','e','f','g'].map(x=>t(x,{date:'2026-10-0'+(x==='a'?'1':'5')}))}).suggestions.length>5)throw Error('more than 5 suggestions');
// protected rest after an overnight block
const rest=S({...base,busy:[{start:0,end:420}],nightRestHours:8,tasks:[t('call')]});if(rest.suggestions[0]?.actions[0].time<'15:00')throw Error('slot inside protected rest: '+JSON.stringify(rest.suggestions));
// nothing to suggest is an empty list
if(S({...base,tasks:[]}).suggestions.length!==0)throw Error('empty day must have no suggestions');
console.log('Planly Suggestions engine checks passed');}
// ---- Smarter Suggestions (6.1): learning from your own finished tasks, habits, slips, timings, your week, feedback ----
{const S=api.suggest,L=api.learn;if(typeof L!=='function')throw Error('learn() missing');
const jsWd=k=>new Date(k+'T12:00:00Z').getUTCDay(),shift=(k,n)=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const today='2026-10-06',H=(id,title,doneDay,doneMin,o={})=>({id,title,category:o.cat||'Personal',date:o.date??doneDay,time:o.time||'',durationMinutes:o.dur||30,deferCount:o.defer||0,recurring:!!o.rec,doneDay,doneMin});
const t=(id,o={})=>({id,title:id,date:today,priority:'normal',durationMinutes:30,completed:false,visibility:'private',category:'Personal',createdAt:1,...o});
const base={today,tomorrow:'2026-10-07',weekend:'2026-10-10',nowMinutes:9*60,planningStart:'08:00',planningEnd:'22:00',currentUserId:'me',defaultDuration:30,busy:[],learning:{},dismissed:[],nightRestHours:0};
// pure date maths matches the calendar across month and year ends
const yearEnd=['2026-12-13','2026-12-20','2026-12-27','2027-01-03'].map((d,i)=>H('y'+i,'Bins',d,600));const ye=L({today:'2027-01-05',history:yearEnd});
if(ye.habits.length!==1||ye.habits[0].weekday!==jsWd('2027-01-03')||ye.habits[0].unit!=='weeks'||ye.habits[0].interval!==1)throw Error('weekly habit across a year end wrong: '+JSON.stringify(ye.habits));
for(let i=-400;i<=400;i+=37){const k=shift('2026-10-06',i),r=L({today:k,history:[0,7,14].map(n=>H('w'+n,'W',shift(k,-21+n),600))});if(r.habits[0]?.weekday!==jsWd(shift(k,-7)))throw Error('weekday maths wrong near '+k)}
// learn() does not change its input, is deterministic, and ignores rows in the future or older than 180 days
const hist=[H('a','Call mum','2026-09-20',1140),H('b','Call mum','2026-09-27',1140),H('c','Call mum','2026-10-04',1140)],snap=JSON.stringify(hist);const l1=L({today,history:hist});if(JSON.stringify(hist)!==snap||JSON.stringify(l1)!==JSON.stringify(L({today,history:JSON.parse(snap)})))throw Error('learn not pure');
// learning is continuous: recent days count more, so a changed routine wins within a few weeks
{const old=[60,67,74,81,88,95,102,109].map(k=>H('o'+k,'Gym',shift(today,-k),8*60,{dur:60})),now=[6,13,20].map(k=>H('n'+k,'Gym',shift(today,-k),19*60,{dur:60}));
 const g=L({today,history:[...old,...now]}).byKey.gym;if(g.start!==18*60)throw Error('a new routine must win over older history: '+JSON.stringify(g));
 if(L({today,history:old}).byKey.gym.start!==7*60)throw Error('old routine baseline wrong');
 const slips=[90,97,104,111,118,125].map(k=>H('s'+k,'Admin',shift(today,-k),600,{date:shift(today,-k-2),defer:1})),onTime=[5,12,19].map(k=>H('t'+k,'Admin',shift(today,-k),600));
 const a=L({today,history:[...slips,...onTime]}).byKey.admin;if(!(a.slipRate<0.5))throw Error('a task that stopped slipping must stop being flagged: '+a.slipRate);
 if(S({...base,history:[...slips,...onTime],tasks:[t('Admin')]}).suggestions.some(x=>x.kind==='slip'))throw Error('slip suggested for a task that no longer slips');
 if(!(L({today,history:slips}).byKey.admin.slipRate===1))throw Error('slip baseline wrong');}
if(L({today,history:[H('f','F','2026-10-07',600),H('o','O','2026-03-01',600)]}).n!==0)throw Error('future/old rows must be ignored');
// habits: a steady rhythm of hand-made tasks → "Make it repeat"
const habit=S({...base,history:hist,tasks:[]}).suggestions.find(x=>x.kind==='habit');
if(!habit||habit.actions[0].op!=='repeat'||habit.actions[0].id!=='c'||habit.actions[0].unit!=='weeks'||habit.actions[0].interval!==1||habit.actions[0].weekday!==0||!/every week/.test(habit.title)||!/3 times on Sundays/.test(habit.why))throw Error('habit wrong: '+JSON.stringify(habit));
if(S({...base,history:hist,tasks:[t('Call mum',{date:'2026-10-11'})]}).suggestions.some(x=>x.kind==='habit'))throw Error('habit suggested although an open task exists');
if(S({...base,history:hist,tasks:[t('call mum',{completed:true,recurrence:'weekly'})]}).suggestions.some(x=>x.kind==='habit'))throw Error('habit suggested although it already repeats');
if(L({today,history:[H('a','X','2026-09-01',600),H('b','X','2026-09-04',600),H('c','X','2026-09-20',600)]}).habits.length)throw Error('irregular rhythm must not be a habit');
if(L({today,history:hist.slice(0,2)}).habits.length)throw Error('two times is not a habit');
if(L({today,history:hist.map(h=>({...h,recurring:true}))}).habits.length)throw Error('already-repeating tasks are not habits');
if(L({today:'2026-10-30',history:hist}).habits.length)throw Error('a habit not done for over two periods is stale');
const fort=L({today,history:['2026-08-25','2026-09-08','2026-09-22','2026-10-06'].map((d,i)=>H('p'+i,'Pay window cleaner',d,600))}).habits[0];if(fort?.interval!==2||fort.unit!=='weeks')throw Error('fortnightly habit wrong: '+JSON.stringify(fort));
// usual time: the task's own history (by weekday when there is enough) beats its category
const gymHist=['2026-09-15','2026-09-22','2026-09-29'].map((d,i)=>H('g'+i,'Gym',d,19*60,{dur:60}));const g=S({...base,history:gymHist,tasks:[t('Gym',{durationMinutes:60})]}).suggestions.find(x=>x.kind==='slot');
if(!g||g.actions[0].time!=='18:00'||!/On Tuesdays you usually do “Gym” around 18:00/.test(g.why))throw Error('learned weekday time wrong: '+JSON.stringify(g));
const g2=S({...base,history:['2026-09-14','2026-09-23','2026-09-30'].map((d,i)=>H('g'+i,'Gym',d,19*60,{dur:60})),tasks:[t('Gym',{durationMinutes:60})]}).suggestions.find(x=>x.kind==='slot');if(!g2||g2.actions[0].time!=='18:00'||!/usually do “Gym” around 18:00 \(3 times\)/.test(g2.why))throw Error('learned title time wrong: '+JSON.stringify(g2));
// a task with its own history gets its usual time first; a busy best time falls to the nearest free one, not the start of the gap
{const r=S({...base,history:gymHist,learning:{Admin:{usualMinutes:30,bestTimeMinutes:1080,samples:3}},tasks:[t('Call mum',{priority:'high',category:'Admin'}),t('Gym',{durationMinutes:60})]}).suggestions.filter(x=>x.kind==='slot'),gy=r.find(x=>x.actions[0].id==='Gym'),cm=r.find(x=>x.actions[0].id==='Call mum');
if(gy?.actions[0].time!=='18:00'||!cm||cm.actions[0].time==='18:00')throw Error('own history must claim its usual time first: '+JSON.stringify(r));
const near=S({...base,history:gymHist,busy:[{start:17*60+45,end:18*60+30}],tasks:[t('Gym',{durationMinutes:60})]}).suggestions.find(x=>x.kind==='slot');if(near?.actions[0].time!=='18:30')throw Error('busy usual time must fall to the nearest free time: '+JSON.stringify(near))}
{const r=S({...base,history:gymHist,learning:{Admin:{usualMinutes:30,bestTimeMinutes:1080,samples:3}},tasks:[t('Old admin',{category:'Admin',date:'2026-10-03',priority:'high'}),t('Gym',{durationMinutes:60})]}).suggestions,late=r.find(x=>x.kind==='late'),gy=r.find(x=>x.kind==='slot');
if(gy?.actions[0].time!=='18:00'||!late||late.actions[0].time==='18:00')throw Error('an overdue task must not take a time held by a task with its own history: '+JSON.stringify(r))}
// real durations from ticking timed tasks (needs 3; planned 60m, ticked ~75m after start)
const dh=['2026-09-22','2026-09-24','2026-09-29'].map((d,i)=>H('d'+i,'Gym',d,19*60+15,{time:'18:00',dur:60}));const ds=S({...base,history:dh,tasks:[t('Gym',{time:'18:00',durationMinutes:60})]}).suggestions.find(x=>x.kind==='duration');
if(!ds||ds.actions[0].minutes!==75||ds.actions[0].ids[0]!=='Gym'||!/usually takes you 1h 15m/.test(ds.title))throw Error('learned duration wrong: '+JSON.stringify(ds));
if(S({...base,history:dh.slice(0,2),tasks:[t('Gym',{time:'18:00',durationMinutes:60})]}).suggestions.some(x=>x.kind==='duration'))throw Error('duration needs 3 timed ticks');
if(L({today,history:[H('z','Gym','2026-09-22',23*60,{time:'08:00',dur:60})]}).byKey.gym.actualN!==0)throw Error('a tick hours after the end must not count as a duration');
if(S({...base,nowMinutes:19*60,history:dh,tasks:[t('Gym',{time:'18:00',durationMinutes:60})]}).suggestions.some(x=>x.kind==='duration'))throw Error('duration suggested for a task already started');
// likely to slip: a task you keep pushing back gets a firm time, or the weekday it usually gets done
const slipHist=['2026-09-10','2026-09-17','2026-09-24','2026-10-01'].map((d,i)=>H('s'+i,'Do admin',d,11*60,{date:shift(d,-2),defer:1}));const sl=S({...base,history:slipHist,tasks:[t('Do admin')]}).suggestions.find(x=>x.kind==='slip');
if(!sl||!/^Lock in 10:30$/.test(sl.actions[0].label)||sl.actions[1]?.date!=='2026-10-08'||!/pushed it back 4 of the last 4 times/.test(sl.why))throw Error('slip wrong: '+JSON.stringify(sl));
if(S({...base,history:slipHist,tasks:[t('Do admin')]}).suggestions.some(x=>x.kind==='slot'&&x.actions[0].id==='Do admin'))throw Error('slip and slot duplicated for one task');
if(!S({...base,tasks:[t('Renew',{deferCount:2})]}).suggestions.some(x=>x.kind==='slip'&&/moved 2 times/.test(x.why)))throw Error('task moved twice should be flagged');
// your week: a coming day with far more planned than usual, moved to a lighter day (needs 4 weeks of history)
const weekHist=[];for(let k=1;k<=42;k++){const d=shift(today,-k);if(jsWd(d)===6)for(let j=0;j<5;j++)weekHist.push(H('h'+k+j,'Thing '+j+k,d,600+j*30))}
const wk=S({...base,history:weekHist,tasks:[1,2,3,4,5].map(i=>t('thu'+i,{date:'2026-10-08'}))}).suggestions.find(x=>x.kind==='week');
if(!wk||wk.title!=='Thursday looks heavy'||wk.actions[0].date!=='2026-10-10'||wk.actions[0].id!=='thu1')throw Error('week wrong: '+JSON.stringify(wk));
if(S({...base,history:weekHist.slice(0,10),tasks:[1,2,3,4,5].map(i=>t('thu'+i,{date:'2026-10-08'}))}).suggestions.some(x=>x.kind==='week'))throw Error('week hint needs 4 weeks of history');
// feedback: kinds you keep dismissing are muted, a task dismissed twice is left alone, accepted kinds rank higher
const mix={...base,history:weekHist,tasks:[t('Read'),...[1,2,3,4,5].map(i=>t('thu'+i,{date:'2026-10-08'}))]};const plain=S(mix).suggestions.map(x=>x.kind);
if(plain.indexOf('slot')>plain.indexOf('week'))throw Error('slot should outrank week by default: '+plain);
const liked=S({...mix,feedback:{kinds:{week:{a:6,d:0},slot:{a:0,d:2}}}}).suggestions.map(x=>x.kind);if(liked.indexOf('week')>liked.indexOf('slot'))throw Error('accepted kind must rank higher: '+liked);
if(S({...mix,feedback:{kinds:{slot:{a:0,d:5}}}}).suggestions.some(x=>x.kind==='slot'))throw Error('a kind dismissed 5 times without use must be muted');
if(!S({...mix,feedback:{kinds:{slot:{a:1,d:5}}}}).suggestions.some(x=>x.kind==='slot'))throw Error('a kind you sometimes use must not be muted');
if(S({...mix,feedback:{subjects:{Read:2}}}).suggestions.some(x=>x.actions.some(a=>a.id==='Read')))throw Error('a task dismissed twice must be left alone');
// never more than five; still only your own private open tasks
if(S({...base,history:[...hist,...gymHist,...slipHist,...weekHist],tasks:[t('Gym'),t('Do admin'),t('a'),t('b'),t('c'),t('old',{date:'2026-10-01'}),...[1,2,3,4,5].map(i=>t('thu'+i,{date:'2026-10-08'}))]}).suggestions.length>5)throw Error('more than five suggestions');
if(S({...base,history:slipHist,tasks:[t('Do admin',{visibility:'household'}),t('Do admin 2',{title:'Do admin',_planlyOwnedByMe:false})]}).suggestions.some(x=>x.actions.some(a=>a.op!=='repeat')))throw Error('suggested a task that is not yours');
console.log('Planly Smarter Suggestions engine checks passed');}
