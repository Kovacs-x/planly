window.PLANLY_SUPABASE_CONFIG={
  url:'https://dtniwcwjucepsjzoojuc.supabase.co',
  publishableKey:'sb_publishable_RTHxTr4653cqVPGnSKlO2g_7e_5yLvx'
};
window.PLANLY_GOOGLE_CLIENT_ID='171071129565-49nuqh2l2i83ftg8gnu8evsfq3qh48r8.apps.googleusercontent.com';
// Runtime modules are composed by the Planly service worker. Keep this file configuration-only.

window.PlanlySupabase={get(){if(this.client)return this.client;if(!window.supabase?.createClient)throw Error('Supabase runtime is unavailable.');const cfg=window.PLANLY_SUPABASE_CONFIG;if(!cfg?.url||!cfg?.publishableKey)throw Error('Planly Supabase configuration is unavailable.');this.client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return this.client},client:null};
