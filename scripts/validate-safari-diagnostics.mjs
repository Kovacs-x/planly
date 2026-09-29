import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)};
const diag=read('v2/core-safari-diagnostics-v4.3b.js'),manifest=read('v2/runtime-modules.json'),sw=read('v2/sw.js');
new Function(diag);new Function(sw);
for(const marker of ['localStorage','visibilitychange','tap-intercepted','INTERACTIVE','MAX=30','MAX_BYTES=64000','elementFromPoint','blockers()','serviceWorker','__planlySwBoot','unhandledrejection','pointerdown','pointerup','click','tap-no-click','PlanlySafariDiagnostics'])if(!diag.includes(marker))fail('Missing Safari diagnostic invariant: '+marker);
for(const forbidden of ['preventDefault(','stopPropagation(','MutationObserver','dispatchEvent(new MouseEvent','HTMLElement.prototype.click','sessionStorage'])if(diag.includes(forbidden))fail('Diagnostics alter semantics or lose relaunch persistence: '+forbidden);
if(!diag.includes("const d=down;down=null")||!diag.includes("up=elInfo(e.target)"))fail('Pointerup must capture tap values before async work');
if(!diag.includes("if(!p.clicked)setTimeout(()=>full('tap-no-click'"))fail('Full blocker scan must be deferred to suspicious no-click taps');
if(diag.includes("light('tap',{tap:{dt,move,down:down.target"))fail('Async tap handler reads cleared down state');
if(diag.includes('document.createElement')||diag.includes('appendChild'))fail('Diagnostics must not add permanent overlay controls');
if(!manifest.includes('"version": 18')||!manifest.includes('./core-safari-diagnostics-v4.3b.js?v=430b01'))fail('Runtime manifest does not load Safari diagnostics');
for(const marker of ["const CACHE='planly-v2-430b-02'","const VERSION='planly-v2-sw-430b-02'","const APP_URL='./app-v3.2.0.js?v=430b02'"","const SAFARI_DIAGNOSTICS_URL='./core-safari-diagnostics-v4.3b.js?v=430b01'",'SAFARI_DIAGNOSTICS_URL];'])if(!sw.includes(marker))fail('Service worker diagnostic composition missing: '+marker);
if(diag.includes('$$$')||diag.includes('$().forEach'))fail('Generated diagnostics contain forbidden selector corruption');
console.log('Safari freeze diagnostic validation passed');

const app=read('v2/app-v3.2.0.js');new Function(app);for(const marker of ['<h3>Diagnostics</h3>','planlyCopyFreezeDiagnosticsBtn','planlyClearFreezeDiagnosticsBtn','planlyFreezeDiagnosticsFallback','PlanlySafariDiagnostics?.clear()'])if(!app.includes(marker))fail('Settings diagnostics export missing: '+marker);if(app.includes('$$$')||app.includes('$().forEach'))fail('Generated app contains forbidden selector corruption');
