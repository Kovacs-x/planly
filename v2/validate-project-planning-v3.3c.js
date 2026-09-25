#!/usr/bin/env node
const fs=require('fs');
const files=['app-v3.2.0.js','core-projects-v3.3c.js','core-build-v3.3c.js','core-assignment-v3.3c.js','core-project-planning-v3.3c.js'];
const parts=files.map(f=>fs.readFileSync(new URL(f,'file://'+__dirname+'/').pathname,'utf8'));
let app=parts[0];
const closeIndex=app.lastIndexOf('})();');
if(closeIndex<0)throw new Error('primary app closure missing');
const generated=app.slice(0,closeIndex)+'\n'+parts.slice(1).join('\n')+'\n'+app.slice(closeIndex);
new Function(generated);
if(generated.includes('$$$'))throw new Error('forbidden $$$ token');
if(/\$\([^)]*\)\.forEach\s*\(/.test(generated))throw new Error('accidental $().forEach');
for(const marker of ['const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)]','externalEventsForDate','renderTimeline','projectOptionsHtml','data-project-owner','PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING']){
  if(!generated.includes(marker))throw new Error('missing critical marker: '+marker);
}
const sw=fs.readFileSync(new URL('sw.js','file://'+__dirname+'/').pathname,'utf8');
new Function(sw);
for(const marker of ['planly-v2-330c04','planly-v2-sw-330c04','core-project-planning-v3.3c.js?v=330c04'])if(!sw.includes(marker))throw new Error('missing SW marker: '+marker);
console.log('Planly 3.3C project-planning validation passed');
