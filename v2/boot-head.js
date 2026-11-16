// Planly boot (head): theme and boot state before first paint, and no pinch zoom. Loaded as a file (not inline) so the
// Content-Security-Policy can forbid inline scripts.
(()=>{try{const saved=JSON.parse(localStorage.getItem('planly-device-settings-v1')||'null');let theme=saved?.theme||'light';if(theme==='system')theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}})();
if(!('serviceWorker' in navigator)||!navigator.serviceWorker.controller)document.documentElement.classList.add('planlyBootPending');else document.documentElement.classList.add('planlyWarmStart');
window.__planlySwBoot={status:'starting'};
// Planly behaves like an app: no pinch zoom. iOS Safari ignores user-scalable=no, so cancel its pinch gestures too.
for(const t of ['gesturestart','gesturechange','gestureend'])document.addEventListener(t,e=>e.preventDefault(),{passive:false});
  
