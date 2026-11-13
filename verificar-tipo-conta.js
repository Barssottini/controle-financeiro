// Exercita o código real do cliente: migração e precedência do tipo imutável.
const fs=require('fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const block=html.slice(html.indexOf('// ═══ TIPO CANÔNICO NO SERVIDOR ═══'),html.indexOf('// ═══ FIM DO TIPO CANÔNICO ═══'));
assert(block.length>100);
function client({local,remote=null,readError=false,rpcError=false,unreadable=false,enabled=true}={}){
 const S={settings:local?{accountType:local}:{}};const calls=[];
 const control={remote,readError,rpcError};
 const sb={from(table){assert.equal(table,'account_profiles');return {select(){return this;},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'u1');return this;},async maybeSingle(){return {data:control.remote?{account_type:control.remote}:null,error:control.readError?Error('offline'):null};}};},async rpc(fn,args){calls.push(args.p_account_type);assert.equal(fn,'register_account_type');if(control.rpcError)return {error:Error('offline')};control.remote ||= args.p_account_type;return {data:control.remote};}};
 const api=new Function('S','sb','window','console','unreadable','TIPO_CONTA_SERVIDOR_ATIVO',`
 let _tipoServidor='',_nfUser={id:'u1'},_tipoProntoUid='u1',_nuvemIlegivel=unreadable;
 function persistSettings(){};
 ${block}
 return {sincronizarTipoConta,registrarTipoConta,get:()=>_tipoServidor};
 `)(S,sb,{addEventListener(){}},{warn(){}},unreadable,enabled);
 return {...api,S,calls,control};
}
(async()=>{
 let c=client({local:'pf',remote:'pj'});await c.sincronizarTipoConta();assert.equal(c.get(),'pj');assert.equal(c.S.settings.accountType,'pj');assert.deepEqual(c.calls,[]);
 c=client({local:'pj'});await c.sincronizarTipoConta();assert.equal(c.get(),'pj');assert.deepEqual(c.calls,['pj']);await c.sincronizarTipoConta();assert.equal(c.calls.length,1);
 c=client();await c.sincronizarTipoConta();assert.equal(c.get(),'');assert.deepEqual(c.calls,[]);
 c=client({local:'both'});await c.sincronizarTipoConta();assert.equal(c.get(),'');assert.deepEqual(c.calls,[]);
 c=client({local:'pj',unreadable:true});await c.sincronizarTipoConta();assert.deepEqual(c.calls,[]);
 c=client({local:'pj',readError:true});await c.sincronizarTipoConta();assert.equal(c.S.settings.accountType,'pj');assert.equal(c.get(),'');assert.deepEqual(c.calls,[]);
 c=client({local:'pj',rpcError:true});await c.sincronizarTipoConta();assert.equal(c.S.settings.accountType,'pj');assert.equal(c.get(),'');c.control.rpcError=false;await c.sincronizarTipoConta();assert.equal(c.get(),'pj');
 c=client({remote:'pf'});assert.equal(await c.registrarTipoConta('pj'),'pf');assert.equal(c.S.settings.accountType,'pf');
 await assert.rejects(()=>c.registrarTipoConta('admin'));
 const price=html.match(/function precoPro\(\)\{[^}]+\}/)[0];
 assert.equal(new Function('tipoConta',price+';return precoPro()')(()=> 'pj'),'49,90');
 assert.equal(new Function('tipoConta',price+';return precoPro()')(()=> 'pf'),'19,90');
 assert(html.includes('data:TIPO_CONTA_SERVIDOR_ATIVO?{account_type:_tipoCadastro,...(cnpj?{cnpj}:{})}:{}'));
 c=client({local:'pj',enabled:false});await c.sincronizarTipoConta();assert.deepEqual(c.calls,[]);assert.equal(await c.registrarTipoConta('pj'),'pj');assert.equal(c.get(),'');
 assert(html.includes("const WINDOWS_EXCLUSIVO_EM='';"));
 // Login em aparelho novo deve restaurar também uma conta sem lançamentos.
 const load=html.slice(html.indexOf('async function loadCloud(uid){'),html.indexOf('// ═══ AUTH ═══'));
 const state={settings:{},transactions:[]};let applied=false,writes=0;
 const loadApi=new Function('S','NUVEM','nfDec','applyCloud',`
 const _mk=true;let _nuvemIlegivel=false,_aplicandoNuvem=false;
 function nfGarantirDono(){};function loadData(){};function estaSujo(){return false;}
 function setSync(){};function guardarBase(){};function marcarSujo(){};
 function dataCount(d){return d?(d.transactions||[]).length:0;}
 async function cloudSaveNow(){throw Error('Não deve sobrescrever a conta vazia');}
 ${load};return loadCloud;
 `)(state,{ler:async()=>({blob:'encrypted',versao:1})},async()=>JSON.stringify({settings:{accountType:'pj',nome:'Empresa'},transactions:[]}),d=>{applied=true;Object.assign(state,d);});
 await loadApi('u1');assert(applied);assert.equal(state.settings.accountType,'pj');
 console.log('Tipo de conta: precedência, migração, falhas de rede, cifra ilegível, preços e cadastro verificados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
