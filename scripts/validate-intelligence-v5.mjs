import fs from 'node:fs';
const source=fs.readFileSync('v2/core-intelligence-v5.0.js','utf8');
const window={};
new Function('window',source)(window);
const api=window.PlanlyIntelligence;
if(!api||api.version!=='5.0.0')throw new Error('Planly Intelligence runtime missing');

const base={
  today:'2026-09-30',
  planningStart:'08:00',
  planningEnd:'18:00',
  currentUserId:'me',
  projects:[{id:'p1',name:'Launch',dueDate:'2026-10-01'}],
  externalBusy:[{start:600,end:660},{start:780,end:840}],
  tasks:[
    {id:'overdue',title:'Overdue high',date:'2026-09-28',priority:'high',durationMinutes:45,projectId:'p1',completed:false},
    {id:'today',title:'Today normal',date:'2026-09-30',priority:'normal',durationMinutes:30,completed:false},
    {id:'inbox',title:'Inbox low',date:'',priority:'low',durationMinutes:20,completed:false},
    {id:'other',title:'Partner task',date:'2026-09-30',priority:'high',durationMinutes:30,visibility:'household',assigneeId:'partner',completed:false},
    {id:'fixed',title:'Fixed task',date:'2026-09-30',time:'09:00',priority:'normal',durationMinutes:60,completed:false}
  ]
};
const first=api.recommendDayPlan(base);
const second=api.recommendDayPlan(JSON.parse(JSON.stringify(base)));
if(JSON.stringify(first)!==JSON.stringify(second))throw new Error('Intelligence output is not deterministic');
if(first.top3[0]?.id!=='overdue')throw new Error('Overdue high-priority task should rank first');
if(first.ranked.some(x=>x.id==='other'))throw new Error('Task assigned to another household member must not be recommended');
if(first.proposals.some(p=>p.time==='09:00'))throw new Error('Suggested time overlaps an existing task');
if(first.proposals.some(p=>p.time==='10:00'))throw new Error('Suggested time overlaps external calendar busy time');
if(!first.top3[0]?.reasons.some(x=>x.includes('Overdue')))throw new Error('Recommendation reasons must explain overdue pressure');
if(!first.top3[0]?.reasons.some(x=>x.includes('High priority')))throw new Error('Recommendation reasons must explain priority');
if(first.summary.freeMinutes<=0)throw new Error('Available-time calculation failed');

const assigned=api.recommendDayPlan({...base,tasks:[{id:'mine',title:'Assigned to me',date:'2026-09-30',priority:'normal',durationMinutes:30,visibility:'household',assigneeId:'me',completed:false}]});
if(!assigned.top3[0]?.reasons.includes('Assigned to you'))throw new Error('Household assignment reason missing');

console.log('Planly Intelligence 5.0 deterministic planning checks passed.');