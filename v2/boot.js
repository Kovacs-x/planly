// Planly boot: registers the service worker and loads the composed runtime. Loaded as a file (not inline) so the
// Content-Security-Policy can forbid inline scripts.
(()=>{
  'use strict';
  const RELOAD_KEY='planly-sw-first-reload',TIMEOUT_MS=6000,RUNTIME_URL='./app-v3.2.0.js?v=721t59';
  const splash=document.getElementById('planlyBootSplash'),message=document.getElementById('planlyBootMessage'),retry=document.getElementById('planlyBootRetry');
  const setBoot=(status,detail={})=>{window.__planlySwBoot={status,...detail}};
  const fail=(text,status='error')=>{setBoot(status);document.documentElement.classList.remove('planlyWarmStart');document.documentElement.classList.add('planlyBootPending');if(splash)splash.hidden=false;if(message)message.textContent=text;if(retry)retry.hidden=false};
  const ready=()=>{sessionStorage.removeItem(RELOAD_KEY);document.documentElement.classList.remove('planlyBootPending','planlyWarmStart');if(splash)splash.hidden=true;setBoot('ready')};
  const loadRuntime=()=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=RUNTIME_URL;script.async=false;script.onload=()=>{ready();resolve()};script.onerror=()=>reject(new Error('runtime-load-failed'));document.body.appendChild(script)});
  const waitForController=()=>new Promise((resolve,reject)=>{
    let settled=false;
    const done=fn=>{if(settled)return;settled=true;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',onController);fn()};
    const onController=()=>done(resolve);
    const timer=setTimeout(()=>done(()=>reject(new Error('controller-timeout'))),TIMEOUT_MS);
    navigator.serviceWorker.addEventListener('controllerchange',onController);
    if(navigator.serviceWorker.controller)done(resolve);
  });
  retry?.addEventListener('click',()=>{sessionStorage.removeItem(RELOAD_KEY);location.reload()});
  const maintainRegistration=async()=>{try{const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs){const path=new URL(reg.scope).pathname;if(path.endsWith('/planly/'))await reg.unregister();if(path.endsWith('/planly/v2-preview/')&&!reg.installing&&!reg.waiting&&!reg.active)await reg.unregister()}return await navigator.serviceWorker.register('./sw.js',{scope:'./'})}catch{return null}};
  (async()=>{
    if(!('serviceWorker' in navigator)){fail('Planly needs service-worker support to start safely in this browser.','unsupported');return}
    if(navigator.serviceWorker.controller){
      document.documentElement.classList.remove('planlyBootPending');if(splash)splash.hidden=true;setBoot('warm-start',{controlled:true});
      maintainRegistration();
      try{await loadRuntime()}catch{fail('Planly could not finish loading. Tap Retry to try again.','runtime-error')}
      return
    }
    try{
      const reg=await maintainRegistration();
      if(!reg)throw new Error('service-worker-registration-failed');
      setBoot('registered',{scope:reg.scope,controlled:!!navigator.serviceWorker.controller});
      if(navigator.serviceWorker.controller){await loadRuntime();return}
      if(sessionStorage.getItem(RELOAD_KEY)==='1'){
        try{await waitForController();await loadRuntime();return}
        catch{fail(navigator.onLine?'Planly could not finish setting up. Tap Retry to try again.':'Planly is offline and has not been prepared on this device yet. Connect once to finish setup.','setup-incomplete');return}
      }
      await waitForController();
      sessionStorage.setItem(RELOAD_KEY,'1');
      location.reload();
    }catch(err){
      const offline=!navigator.onLine;
      fail(offline?'Planly is offline and has not been prepared on this device yet. Connect once to finish setup.':'Planly could not finish setting up. Tap Retry to try again.',offline?'offline-first-visit':'setup-error');
    }
  })();
})();
