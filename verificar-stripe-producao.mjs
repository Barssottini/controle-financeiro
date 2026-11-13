// Executa handlers reais com Stripe/Supabase simulados. Nunca movimenta dinheiro.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { planoDaConta, precoConfere } from './supabase/functions/_shared/account-plan.ts';
import { chaveStripeProducao } from './supabase/functions/_shared/stripe-live.ts';
import { linhaDaAssinatura } from './supabase/functions/stripe-webhook/mapa.ts';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
function handler(name, cfg={}) {
 let fn;const calls=[];
 const env={STRIPE_SECRET_KEY:'sk_live_mock',STRIPE_WEBHOOK_SECRET:'whsec_mock',SUPABASE_URL:'https://example.com',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',STRIPE_PRICE_ID:'price_pf',STRIPE_BUSINESS_PRICE_ID:'price_pj',...cfg.env};
 const row={status:'trialing',trial_ends_at:'2020-01-01',stripe_customer_id:null,stripe_subscription_id:null,...cfg.row};
 const sub={id:'sub_mock',livemode:true,status:'active',current_period_end:4102444800,customer:'cus_mock',metadata:{user_id:'uid'},...cfg.sub};
 const stripe={prices:{retrieve:async id=>{calls.push(['price',id]);return {active:true,livemode:true,currency:'brl',unit_amount:cfg.tipo==='pj'?4990:1990,recurring:{interval:'month',interval_count:1},...cfg.price};}},
 customers:{create:async(_a,opts)=>{calls.push(['customer',opts]);return {id:'cus_mock'};}},
 subscriptions:{retrieve:async()=>{if(cfg.retrieveError)throw Error('offline');return sub;}},
 checkout:{sessions:{create:async a=>{calls.push(['checkout',a]);return {url:'https://checkout.stripe.com/mock'};}}},
 billingPortal:{sessions:{create:async()=>{calls.push(['portal']);return {url:'https://billing.stripe.com/mock'};}}},
 webhooks:{constructEventAsync:async()=>{if(cfg.badSignature)throw Error('invalid signature');return {livemode:true,type:'customer.subscription.updated',data:{object:{id:sub.id}},...cfg.event};}}};
 class Stripe {constructor(){return stripe;}static createFetchHttpClient(){}static createSubtleCryptoProvider(){}}
 const createClient=()=>({auth:{getUser:async()=>({data:{user:cfg.noUser?null:{id:'uid',email:'teste@example.com'}}}),admin:{getUserById:async()=>({data:{user:null}})}},from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='account_profiles'?{account_type:cfg.tipo||'pf'}:cfg.missingRow?null:row,error:cfg.readError?Error('db offline'):null}),update(data){calls.push(['update',data]);return {eq:async()=>({error:cfg.saveError?Error('db offline'):null})};}};}});
 const code=fs.readFileSync(path.join(decodeURIComponent(root),'supabase/functions',name,'index.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
 new Function('Deno','Stripe','createClient','planoDaConta','precoConfere','chaveStripeProducao','linhaDaAssinatura','mensagemAssinatura','console',stripTypeScriptTypes(code))(
 {env:{get:k=>env[k]},serve:f=>fn=f},Stripe,createClient,planoDaConta,precoConfere,chaveStripeProducao,linhaDaAssinatura,()=>({}),{error(){},warn(){},log(){}});
 return {calls,run:()=>fn(new Request('https://example.com/'+name,{method:'POST',body:'{}'}))};
}
for(const key of [undefined,'','sk_test_x','rk_test_x','pk_live_x'])assert.equal(chaveStripeProducao(key),false);
assert(chaveStripeProducao('sk_live_x'));assert(chaveStripeProducao('rk_live_x'));
for(const name of ['stripe-checkout','stripe-portal','stripe-webhook']){
 const c=handler(name,{env:{STRIPE_SECRET_KEY:'sk_test_mock'}});assert((await c.run()).status>=500);assert.equal(c.calls.length,0);
}
for(const tipo of ['pf','pj']){
 const c=handler('stripe-checkout',{tipo});assert.equal((await c.run()).status,200);
 assert.equal(c.calls.find(x=>x[0]==='price')[1],tipo==='pf'?'price_pf':'price_pj');
 assert.equal(c.calls.find(x=>x[0]==='checkout')[1].subscription_data.metadata.account_type,tipo);
}
for(const cfg of [{readError:true},{missingRow:true},{price:{livemode:false}},{price:{unit_amount:1}},{price:{currency:'usd'}},{saveError:true},{retrieveError:true,row:{stripe_customer_id:'cus',stripe_subscription_id:'sub'}}]){
 const c=handler('stripe-checkout',cfg);assert((await c.run()).status>=500);assert(!c.calls.some(x=>x[0]==='checkout'));
}
let c=handler('stripe-checkout',{row:{status:'active',current_period_end:'2100-01-01'}});assert.equal((await c.run()).status,409);assert.equal(c.calls.length,0);
c=handler('stripe-checkout',{row:{stripe_customer_id:'cus',stripe_subscription_id:'sub'}});assert.equal((await c.run()).status,200);assert(c.calls.some(x=>x[0]==='portal'));assert(!c.calls.some(x=>x[0]==='checkout'));
for(const [cfg,status] of [[{},200],[{badSignature:true},400],[{event:{livemode:false}},400],[{sub:{livemode:false}},500],[{readError:true},500],[{missingRow:true},500],[{saveError:true},500]]){
 c=handler('stripe-webhook',cfg);assert.equal((await c.run()).status,status);
 if(cfg.badSignature||cfg.event||cfg.sub)assert(!c.calls.some(x=>x[0]==='update'));
}
console.log('Stripe produção: preços PF/PJ, chaves live, rejeição de teste, cortesia, assinatura existente, erros de banco, assinatura do webhook e ativação verificados.');
