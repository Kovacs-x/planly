/* Planly 3.3C closeout — strict composite project identity.
   Never fall through to another household member's project when an owner scope
   is known. When no owner scope exists, ambiguous client ids resolve to null. */
projectById=function(id){
  if(!id)return null;
  const projectId=String(id),currentOwner=String(planlySession?.user?.id||''),scopedOwner=String(activeProjectOwnerId||'');
  if(scopedOwner)return state.projects.find(p=>String(p.id)===projectId&&planlyProjectOwnerId(p)===scopedOwner)||null;
  const mine=state.projects.find(p=>String(p.id)===projectId&&planlyProjectOwnerId(p)===currentOwner);
  if(mine)return mine;
  const matches=state.projects.filter(p=>String(p.id)===projectId);
  return matches.length===1?matches[0]:null;
};
