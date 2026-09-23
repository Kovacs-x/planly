type RefreshInput = { sourceId?: string }

const cors = {
  'Access-Control-Allow-Origin': 'https://kovacs-x.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
const SB=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const api=(path:string,init:RequestInit={},key=SERVICE)=>fetch(SB+path,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(init.headers||{})}})

function unfold(s:string){return s.replace(/\r?\n[ \t]/g,'')}
function unescapeIcs(s:string){return s.replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\')}
function prop(block:string,name:string){
  const m=block.match(new RegExp('^'+name+'(?:;[^:]*)?:(.*)$','mi')); return m?unescapeIcs(m[1].trim()):''
}
function rawProp(block:string,name:string){
  const m=block.match(new RegExp('^'+name+'([^:]*)?:(.*)$','mi')); return m?{params:m[1]||'',value:m[2].trim()}:null
}
function dateOnly(v:string){return /^\d{8}$/.test(v)}
function parseIcsDate(v:string){
  if(dateOnly(v)) return {iso:v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8),allDay:true}
  const m=v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if(!m) return null
  const base=`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}${m[7]?'Z':''}`
  return {iso:base,allDay:false}
}
function parseEvents(text:string){
  const clean=unfold(text), out:any[]=[]
  for(const block of clean.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi)||[]){
    if(/^STATUS:CANCELLED$/mi.test(block)) continue
    const uid=prop(block,'UID'); const sr=rawProp(block,'DTSTART'); if(!uid||!sr) continue
    const er=rawProp(block,'DTEND'), s=parseIcsDate(sr.value), e=er?parseIcsDate(er.value):null
    if(!s) continue
    const allDay=s.allDay
    let startsAt:string|null=null, endsAt:string|null=null, startDate:string|null=null,endDate:string|null=null
    if(allDay){
      startDate=s.iso; endDate=e?.iso||s.iso
    }else{
      startsAt=s.iso; endsAt=e?.iso||s.iso
      startDate=s.iso.slice(0,10); endDate=(e?.iso||s.iso).slice(0,10)
    }
    out.push({external_uid:uid,title:prop(block,'SUMMARY')||'Busy',description:prop(block,'DESCRIPTION')||null,location:prop(block,'LOCATION')||null,starts_at:startsAt,ends_at:endsAt,is_all_day:allDay,start_date:startDate,end_date:endDate,source_updated_at:new Date().toISOString()})
  }
  return out
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  if(req.method!=='POST') return json({error:'Method not allowed'},405)
  const auth=req.headers.get('authorization')||''
  if(!auth.toLowerCase().startsWith('bearer ')) return json({error:'Authentication required'},401)
  const userRes=await fetch(SB+'/auth/v1/user',{headers:{apikey:ANON,Authorization:auth}})
  if(!userRes.ok) return json({error:'Authentication required'},401)
  const user=await userRes.json(), ownerId=user.id
  const body=await req.json().catch(()=>({})) as RefreshInput
  const sourceId=String(body.sourceId||'')
  if(!sourceId) return json({error:'sourceId is required'},400)

  const srcRes=await fetch(SB+'/rest/v1/calendar_sources?id=eq.'+encodeURIComponent(sourceId)+'&owner_id=eq.'+encodeURIComponent(ownerId)+'&select=id,name,enabled',{headers:{apikey:ANON,Authorization:auth}})
  const sources=await srcRes.json().catch(()=>[])
  if(!srcRes.ok||!sources[0]) return json({error:'Calendar source not found'},404)
  if(!sources[0].enabled) return json({error:'Calendar source is disabled'},400)

  const credRes=await api('/rest/v1/rpc/get_calendar_source_feed_url',{method:'POST',body:JSON.stringify({p_source_id:sourceId,p_owner_id:ownerId})})
  const feedUrl=await credRes.json().catch(()=>null)
  if(!credRes.ok||!feedUrl) return json({error:'Calendar credential unavailable'},500)

  let feed:Response
  try{feed=await fetch(String(feedUrl),{redirect:'follow',headers:{Accept:'text/calendar,text/plain;q=0.9,*/*;q=0.1','User-Agent':'Planly-Calendar/1.0'}})}
  catch{return json({error:'Calendar feed could not be reached'},502)}
  if(!feed.ok) return json({error:'Calendar feed could not be opened'},502)
  const ics=await feed.text()
  if(!/BEGIN:VCALENDAR/i.test(ics)) return json({error:'Calendar feed is invalid'},502)
  const events=parseEvents(ics).map(e=>({...e,source_id:sourceId,owner_id:ownerId}))

  const existingRes=await api('/rest/v1/external_calendar_events?source_id=eq.'+encodeURIComponent(sourceId)+'&select=id')
  if(!existingRes.ok) return json({error:'Could not prepare calendar refresh'},500)
  const delRes=await api('/rest/v1/external_calendar_events?source_id=eq.'+encodeURIComponent(sourceId),{method:'DELETE',headers:{Prefer:'return=minimal'}})
  if(!delRes.ok) return json({error:'Could not replace previous calendar events'},500)
  if(events.length){
    const up=await api('/rest/v1/external_calendar_events?on_conflict=source_id,external_uid',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(events)})
    if(!up.ok) return json({error:'Calendar events could not be saved'},500)
  }
  await api('/rest/v1/calendar_sources?id=eq.'+encodeURIComponent(sourceId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'connected',error:null,last_synced_at:new Date().toISOString()})})
  return json({ok:true,sourceId,eventCount:events.length})
})
