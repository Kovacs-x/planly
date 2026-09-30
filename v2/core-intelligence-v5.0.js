// Planly Intelligence 5.0 — deterministic planning and priority engine.
(()=>{'use strict';
if(window.PlanlyIntelligence)return;

const VERSION='5.0.0';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const pad=n=>String(n).padStart(2,'0');
const parseDateKey=value=>{const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12):null};
const dayDiff=(a,b)=>{const da=parseDateKey(a),db=parseDateKey(b);return da&&db?Math.round((da-db)/86400000):0};
const timeToMinutes=value=>{const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return m?clamp(Number(m[1])*60+Number(m[2]),0,1439):0};
const minutesToTime=value=>{const n=clamp(Math.round(Number(value)||0),0,1439);return pad(Math.floor(n/60))+':'+pad(n%60)};
const durationOf=task=>clamp(Number(task?.durationMinutes||30),5,720);
const priorityRank=task=>({high:3,normal:2,low:1})[String(task?.priority||'normal').toLowerCase()]||2;
const projectMap=projects=>new Map((Array.isArray(projects)?projects:[]).map(p=>[String(p.id||''),p]));

function eligible(task,currentUserId){
  if(!task||task.completed)return false;
  if(task.visibility!=='household')return true;
  const assignee=String(task.assigneeId||task.assignee_id||'');
  return !assignee||!currentUserId||assignee===currentUserId;
}

function taskDateClass(task,today){
  const date=String(task?.date||'');
  if(!date)return {kind:'inbox',days:0};
  const diff=dayDiff(date,today);
  if(diff<0)return {kind:'overdue',days:Math.abs(diff)};
  if(diff===0)return {kind:'today',days:0};
  return {kind:'future',days:diff};
}

function fixedBusyIntervals(tasks,today,externalBusy,start,end){
  const rows=[];
  for(const task of Array.isArray(tasks)?tasks:[]){
    if(task?.completed||task?.date!==today||!task?.time)continue;
    const s=timeToMinutes(task.time),e=s+durationOf(task);
    if(e>start&&s<end)rows.push({start:Math.max(start,s),end:Math.min(end,e),kind:'task',id:String(task.id||'')});
  }
  for(const item of Array.isArray(externalBusy)?externalBusy:[]){
    const s=Number(item?.start),e=Number(item?.end);
    if(Number.isFinite(s)&&Number.isFinite(e)&&e>start&&s<end)rows.push({start:Math.max(start,s),end:Math.min(end,e),kind:'calendar'});
  }
  rows.sort((a,b)=>a.start-b.start||a.end-b.end);
  const merged=[];
  for(const row of rows){
    const last=merged[merged.length-1];
    if(last&&row.start<=last.end)last.end=Math.max(last.end,row.end);
    else merged.push({start:row.start,end:row.end});
  }
  return merged;
}

function freeGaps(busy,start,end){
  const gaps=[];let cursor=start;
  for(const item of busy){
    if(item.start>cursor)gaps.push({start:cursor,end:item.start,minutes:item.start-cursor});
    cursor=Math.max(cursor,item.end);
  }
  if(cursor<end)gaps.push({start:cursor,end,minutes:end-cursor});
  return gaps;
}

function projectUrgency(project,today){
  if(!project?.dueDate||project.archived)return {score:0,reason:''};
  const diff=dayDiff(String(project.dueDate),today);
  if(diff<0)return {score:35,reason:'Project deadline is overdue'};
  if(diff===0)return {score:30,reason:'Project is due today'};
  if(diff===1)return {score:25,reason:'Project is due tomorrow'};
  if(diff<=3)return {score:18,reason:`Project is due in ${diff} days`};
  if(diff<=7)return {score:10,reason:`Project is due this week`};
  return {score:0,reason:''};
}

function rankTask(task,ctx){
  const {today,projects,currentUserId,gaps}=ctx;
  const dateClass=taskDateClass(task,today);
  if(dateClass.kind==='future')return null;
  let score=0;const reasons=[];
  if(dateClass.kind==='overdue'){
    score+=110+Math.min(40,dateClass.days*5);
    reasons.push(`Overdue by ${dateClass.days} day${dateClass.days===1?'':'s'}`);
  }else if(dateClass.kind==='today'){
    score+=90;reasons.push('Already planned for today');
  }else{
    score+=35;reasons.push('Still in Inbox');
  }

  const priority=String(task.priority||'normal').toLowerCase();
  if(priority==='high'){score+=55;reasons.push('High priority')}
  else if(priority==='normal')score+=20;
  else score+=5;

  if(task.pinned){score+=28;reasons.push('Previously chosen for Top 3')}
  if(task.time){score+=18;reasons.push('Already has a fixed time')}

  const project=projects.get(String(task.projectId||''));
  const urgency=projectUrgency(project,today);
  score+=urgency.score;if(urgency.reason)reasons.push(urgency.reason);

  const assignee=String(task.assigneeId||task.assignee_id||'');
  if(task.visibility==='household'&&assignee&&currentUserId&&assignee===currentUserId){
    score+=16;reasons.push('Assigned to you');
  }

  const duration=durationOf(task);
  const fit=gaps.find(g=>g.minutes>=duration);
  if(!task.time){
    if(fit){score+=14;reasons.push(`Fits a ${fit.minutes}-minute free gap`)}
    else{score-=18;reasons.push('No open timed gap is long enough')}
  }

  const remainingSubtasks=(Array.isArray(task.subtasks)?task.subtasks:[]).filter(s=>!s.done).length;
  if(remainingSubtasks){score+=Math.min(8,remainingSubtasks*2);reasons.push(`${remainingSubtasks} checklist item${remainingSubtasks===1?'':'s'} remaining`)}

  return {
    id:String(task.id||''),
    title:String(task.title||'Untitled task'),
    score,
    duration,
    dateClass:dateClass.kind,
    priorityRank:priorityRank(task),
    createdAt:Number(task.createdAt||0),
    reasons
  };
}

function stableRank(a,b){
  return b.score-a.score||b.priorityRank-a.priorityRank||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
}

function occupy(gaps,start,duration){
  const end=start+duration,next=[];
  for(const gap of gaps){
    if(end<=gap.start||start>=gap.end){next.push(gap);continue}
    if(start>gap.start)next.push({start:gap.start,end:start,minutes:start-gap.start});
    if(end<gap.end)next.push({start:end,end:gap.end,minutes:gap.end-end});
  }
  return next.sort((a,b)=>a.start-b.start);
}

function proposalsFor(top3,tasksById,today,gaps){
  let working=gaps.map(g=>({...g}));
  const proposals=[];
  for(const ranked of top3){
    const task=tasksById.get(ranked.id);if(!task)continue;
    const proposal={id:ranked.id,date:today,pinned:true,time:task.time||'',reasons:[...ranked.reasons]};
    if(task.date===today&&task.time){
      working=occupy(working,timeToMinutes(task.time),durationOf(task));
    }else if(!task.time){
      const gap=working.find(g=>g.minutes>=durationOf(task));
      if(gap){
        proposal.time=minutesToTime(gap.start);
        proposal.reasons.push(`Suggested at ${proposal.time} to use an open calendar gap`);
        working=occupy(working,gap.start,durationOf(task));
      }else{
        proposal.reasons.push('Keep as Anytime because no free timed gap fits');
      }
    }
    proposals.push(proposal);
  }
  return proposals;
}

function recommendDayPlan(input={}){
  const today=String(input.today||'');
  if(!parseDateKey(today))throw new Error('Planly Intelligence requires a local YYYY-MM-DD date.');
  const tasks=Array.isArray(input.tasks)?input.tasks:[];
  const projects=projectMap(input.projects);
  const currentUserId=String(input.currentUserId||'');
  let start=timeToMinutes(input.planningStart||'08:00'),end=timeToMinutes(input.planningEnd||'23:00');
  if(end<=start){start=480;end=1380}

  const busy=fixedBusyIntervals(tasks,today,input.externalBusy,start,end);
  const gaps=freeGaps(busy,start,end);
  const tasksById=new Map(tasks.map(t=>[String(t?.id||''),t]));
  const ranked=tasks
    .filter(t=>eligible(t,currentUserId))
    .map(t=>rankTask(t,{today,projects,currentUserId,gaps}))
    .filter(Boolean)
    .sort(stableRank);
  const top3=ranked.slice(0,3);
  const proposals=proposalsFor(top3,tasksById,today,gaps);
  const busyMinutes=busy.reduce((sum,x)=>sum+(x.end-x.start),0);
  const freeMinutes=Math.max(0,end-start-busyMinutes);

  return {
    engineVersion:VERSION,
    strategy:'deterministic-v1',
    date:today,
    summary:{
      candidateCount:ranked.length,
      busyMinutes,
      freeMinutes,
      planningMinutes:end-start,
      fixedCommitments:busy.length
    },
    ranked:ranked.map(x=>({id:x.id,score:x.score,reasons:[...x.reasons]})),
    top3:top3.map(x=>({id:x.id,title:x.title,score:x.score,reasons:[...x.reasons]})),
    proposals
  };
}

window.PlanlyIntelligence=Object.freeze({version:VERSION,recommendDayPlan});
})();