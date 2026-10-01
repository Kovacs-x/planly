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

if(api.version!=='5.0.0-i2')throw Error('I2 engine version mismatch');
const weighted=api.analyse({...base,tasks:[{id:'weighted',title:'Weighted',date:'2026-09-28',priority:'high',durationMinutes:30,completed:false,visibility:'private',createdAt:1,deferCount:3}]});
const weightedRow=weighted.overdue.find(x=>x.id==='weighted');if(!weightedRow||!Array.isArray(weightedRow.factors)||!weightedRow.factors.some(x=>x.text==='Overdue 2 days'&&x.points===110)||!weightedRow.factors.some(x=>x.text==='High priority'&&x.points===45)||!weightedRow.factors.some(x=>x.text==='Moved 3 times'&&x.points===-15))throw Error('I2 real weighted factors missing');
if(weightedRow.suggest!=='inbox'||!weightedRow.reasons.includes('Moved 3 times'))throw Error('I2 deferCount overdue recommendation failed');
const mapScaleTasks=Array.from({length:500},(_,i)=>({id:'scale-'+i,date:'2026-09-30',priority:i%7===0?'high':'normal',durationMinutes:30,completed:false,visibility:'private',createdAt:i+1}));
const scaled=api.analyse({...base,tasks:mapScaleTasks});if(!scaled.top3.length||scaled.top3.some(x=>!Array.isArray(x.factors)))throw Error('I2 scaled ranking/factors failed');
console.log('Planly Intelligence I2 weighted checks passed');
