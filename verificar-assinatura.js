const fs=require('fs'),assert=require('node:assert/strict');
const h=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const part=(a,b)=>{const i=h.indexOf(a),j=h.indexOf(b,i);assert(i>=0&&j>i);return h.slice(i,j);};
const panel=part('function renderSubPanel(', '// ═══ CAPTCHA');
const access=part('function subAccess(', '// ═══ FREE x PRO');
const revalidate=part('let _nfUltimaRevalida=0;',"document.addEventListener('visibilitychange'");
const elements=new Map(),document={visibilityState:'visible',getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',dataset:{}});return elements.get(id);}};
const sub={status:'active',current_period_end:'2100-01-01T03:00:00Z',stripe_subscription_id:null,mp_preapproval_id:null};
const api=new Function('document','sub',`
 let _nfSub={status:'trialing',trial_ends_at:'2099-01-01'},reloaded=false,banner=null;
 const sb={auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})}};
 async function getSubscription(){return sub;}const location={reload(){reloaded=true;}};
 function renderTrialBanner(acc){banner=acc.reason;}function nomePlanoPro(){return 'North Empresarial Pro';}function precoPro(){return '49,90';}
 function fmtDate(d){return new Date(d).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});}
 ${access}${panel}${revalidate}
 return {revalidarAssinatura,renderSubPanel,subAccess,get:()=>({reloaded,banner})};
`)(document,sub);
(async()=>{
 await api.revalidarAssinatura();assert.deepEqual(api.get(),{reloaded:false,banner:'active'});
 const text=elements.get('sub-info').innerHTML;
 assert(text.includes('31/12/2099'));assert(text.includes('Sem cobrança'));assert(!text.includes('Próxima cobrança'));
 assert(!elements.get('sub-actions').innerHTML.includes('gerenciarAssinatura'));
 const paid={...sub,stripe_subscription_id:'sub_test'};
 api.renderSubPanel(paid,api.subAccess(paid));assert(elements.get('sub-info').innerHTML.includes('Próxima cobrança'));
 assert(elements.get('sub-actions').innerHTML.includes('gerenciarAssinatura'));
  const ts=fs.readFileSync(require('path').join(__dirname,'supabase/functions/orcamento-ia/index.ts'),'utf8');
  const js=require('node:module').stripTypeScriptTypes(ts.slice(ts.indexOf('function ehPro('),ts.indexOf('// O resumo vem')));
  const edgePro=new Function(js+';return ehPro;')();
  for(const [state,want] of [[sub,true],[{...sub,current_period_end:'2020-01-01'},false],[{...sub,current_period_end:'invalid'},false],[{...sub,current_period_end:null},true],[{...paid,current_period_end:'2020-01-01'},true],[{status:'trialing',trial_ends_at:'2099-01-01'},true],[{status:'trialing',trial_ends_at:'2020-01-01'},false],[{status:'canceled',current_period_end:'2099-01-01'},true]]){
    assert.equal(api.subAccess(state).ok,want);assert.equal(edgePro(state),want);
  }
 console.log('Plano: atualização teste → Pro sem recarga; concessão sem cobrança; assinatura paga preservada.');
})().catch(e=>{console.error(e);process.exitCode=1});
